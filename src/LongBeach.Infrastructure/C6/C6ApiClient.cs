using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using LongBeach.Domain.Bar;
using LongBeach.Infrastructure.Finance;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace LongBeach.Infrastructure.C6;

public sealed class C6ApiException(HttpStatusCode? statusCode = null)
    : HttpRequestException("O C6 não confirmou a operação. Consulte novamente antes de repetir uma cobrança ou devolução.", null, statusCode);

/// <summary>Authenticated transport restricted to the configured official C6 environment.</summary>
public sealed class C6ApiClient(HttpClient http, IOptions<C6Options> options, IHostEnvironment environment, TimeProvider? clock = null, IConfiguration? configuration = null) : IDisposable
{
    public bool ImportOnly => BankImportMode.Enabled(configuration);
    private readonly TimeProvider time = clock ?? TimeProvider.System;
    private readonly SemaphoreSlim tokenGate = new(1, 1);
    private readonly SemaphoreSlim rateQueue = new(16, 16);
    private readonly object rateGate = new();
    private readonly Queue<long> sentAt = new();
    private static readonly TimeSpan RateWindow = TimeSpan.FromMinutes(1);
    private const int RequestsPerWindow = 50;
    private string? accessToken;
    private DateTimeOffset tokenValidUntil;

    // Official endpoints are deliberately not configurable: credentials and mTLS cannot leave C6.
    public static Uri BaseAddress(string environment) => environment switch
    {
        "Sandbox" => new("https://baas-api-sandbox.c6bank.info/"),
        "Production" => new("https://baas-api.c6bank.info/"),
        _ => throw new BarRuleException("Ambiente C6 inválido.")
    };

    public async Task<JsonDocument> Send(HttpMethod method, string relativePath, object? payload, CancellationToken ct)
    {
        BankImportMode.RequireApi(configuration);
        var settings = options.Value;
        if (!settings.Enabled) throw new BarRuleException("Conexão C6 desabilitada.");
        var problems = settings.ConfigurationProblems(environment);
        if (problems.Count > 0) throw new BarRuleException(problems[0]);
        var uri = RequestUri(settings.Environment, relativePath);
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
        deadline.CancelAfter(TimeSpan.FromSeconds(settings.TimeoutSeconds));
        try
        {
            var token = await Token(deadline.Token);
            using var response = await Request(method, uri, payload, token, deadline.Token);
            if (response.StatusCode == HttpStatusCode.Unauthorized)
            {
                await Invalidate(token, deadline.Token);
                // Repeating a read is safe; callers must reconcile writes whose result is ambiguous.
                if (method == HttpMethod.Get)
                {
                    token = await Token(deadline.Token);
                    using var retry = await Request(method, uri, payload, token, deadline.Token);
                    return await Read(retry, deadline.Token);
                }
            }
            return await Read(response, deadline.Token);
        }
        catch (C6ApiException) { throw; }
        catch (HttpRequestException) { throw new C6ApiException(); }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested) { throw new C6ApiException(); }
    }

    public void Dispose() { http.Dispose(); tokenGate.Dispose(); rateQueue.Dispose(); }

    internal static Uri RequestUri(string environment, string path)
    {
        if (string.IsNullOrWhiteSpace(path) || !path.StartsWith("/v", StringComparison.Ordinal)
            || path.StartsWith("//", StringComparison.Ordinal) || path.Contains('\\') || path.Contains('#')
            || path.Any(char.IsControl) || path.Contains("..", StringComparison.Ordinal)
            || path.Contains('%') && Uri.UnescapeDataString(path).Split('?')[0] != path.Split('?')[0])
            throw new BarRuleException("Caminho C6 inválido.");
        var baseAddress = BaseAddress(environment);
        var uri = new Uri(baseAddress, path);
        if (uri.Scheme != Uri.UriSchemeHttps || uri.Host != baseAddress.Host || uri.Port != 443 || !string.IsNullOrEmpty(uri.UserInfo))
            throw new BarRuleException("Destino C6 inválido.");
        return uri;
    }

    private async Task<string> Token(CancellationToken ct)
    {
        await tokenGate.WaitAsync(ct);
        try
        {
            if (accessToken is not null && time.GetUtcNow() < tokenValidUntil) return accessToken;
            var settings = options.Value;
            using var request = new HttpRequestMessage(HttpMethod.Post, new Uri(BaseAddress(settings.Environment), "v1/auth/"))
            {
                Content = new FormUrlEncodedContent(new Dictionary<string, string>
                {
                    ["grant_type"] = "client_credentials", ["client_id"] = settings.ClientId, ["client_secret"] = settings.ClientSecret
                })
            };
            Headers(request);
            await RatePermit(ct);
            using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
            using var json = await Read(response, ct);
            if (!json.RootElement.TryGetProperty("access_token", out var token) || token.ValueKind != JsonValueKind.String
                || string.IsNullOrWhiteSpace(token.GetString()) || token.GetString()!.Length > 16384
                || token.GetString()!.Any(x => char.IsWhiteSpace(x) || char.IsControl(x))
                || !json.RootElement.TryGetProperty("expires_in", out var expires)) throw new C6ApiException();
            if (json.RootElement.TryGetProperty("token_type", out var type)
                && (type.ValueKind != JsonValueKind.String || !string.Equals(type.GetString(), "Bearer", StringComparison.OrdinalIgnoreCase)))
                throw new C6ApiException();
            var seconds = expires.ValueKind == JsonValueKind.Number && expires.TryGetInt32(out var numeric) ? numeric
                : expires.ValueKind == JsonValueKind.String && int.TryParse(expires.GetString(), out var text) ? text : 0;
            if (seconds < 1 || seconds > 86400) throw new C6ApiException();
            accessToken = token.GetString()!;
            tokenValidUntil = time.GetUtcNow().AddSeconds(seconds - Math.Min(30, seconds / 10d));
            return accessToken;
        }
        catch (C6ApiException) { throw; }
        catch (HttpRequestException) { throw new C6ApiException(); }
        finally { tokenGate.Release(); }
    }

    private async Task Invalidate(string token, CancellationToken ct)
    {
        await tokenGate.WaitAsync(ct);
        try { if (accessToken == token) { accessToken = null; tokenValidUntil = default; } }
        finally { tokenGate.Release(); }
    }

    private Task<HttpResponseMessage> Request(HttpMethod method, Uri uri, object? payload, string token, CancellationToken ct)
    {
        // Dispose the request after send, while leaving ownership of the response with the caller.
        return Execute();
        async Task<HttpResponseMessage> Execute()
        {
            using var request = new HttpRequestMessage(method, uri);
            if (payload is not null) request.Content = JsonContent.Create(payload);
            Headers(request);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            await RatePermit(ct);
            return await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        }
    }

    // C6 documents 60 requests/minute across all APIs for a key. This singleton budgets
    // authentication, reads and writes together and leaves headroom; replicas need coordination.
    private async Task RatePermit(CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        if (!rateQueue.Wait(0)) throw new C6ApiException(HttpStatusCode.TooManyRequests);
        try
        {
            while (true)
            {
                TimeSpan delay;
                lock (rateGate)
                {
                    ct.ThrowIfCancellationRequested();
                    var now = time.GetTimestamp();
                    while (sentAt.TryPeek(out var oldest) && time.GetElapsedTime(oldest, now) >= RateWindow) sentAt.Dequeue();
                    if (sentAt.Count < RequestsPerWindow)
                    {
                        sentAt.Enqueue(now);
                        return;
                    }
                    delay = RateWindow - time.GetElapsedTime(sentAt.Peek(), now);
                }
                await Task.Delay(delay, time, ct);
            }
        }
        finally { rateQueue.Release(); }
    }

    private static void Headers(HttpRequestMessage request)
    {
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        request.Headers.UserAgent.ParseAdd("LongBeachOS/1.0");
    }

    private static async Task<JsonDocument> Read(HttpResponseMessage response, CancellationToken ct)
    {
        if (!response.IsSuccessStatusCode) throw new C6ApiException(response.StatusCode);
        if (response.Content.Headers.ContentLength is > 8 * 1024 * 1024) throw new C6ApiException();
        try
        {
            await using var input = await response.Content.ReadAsStreamAsync(ct);
            using var output = new MemoryStream();
            var buffer = new byte[8192];
            int read;
            while ((read = await input.ReadAsync(buffer, ct)) > 0)
            {
                if (output.Length + read > 8 * 1024 * 1024) throw new C6ApiException();
                output.Write(buffer, 0, read);
            }
            return JsonDocument.Parse(output.ToArray());
        }
        catch (JsonException) { throw new C6ApiException(); }
    }
}
