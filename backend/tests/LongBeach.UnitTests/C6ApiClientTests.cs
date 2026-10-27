using System.Net;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using LongBeach.Domain.Bar;
using LongBeach.Infrastructure.C6;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace LongBeach.UnitTests;

public sealed class C6ApiClientTests
{
    [Fact]
    public async Task Authentication_is_form_encoded_cached_and_renewed_before_expiry()
    {
        var time = new C6TestTime();
        var authentication = 0;
        using var client = C6TestFixture.Client(async (request, ct) =>
        {
            Assert.Equal("baas-api-sandbox.c6bank.info", request.RequestUri!.Host);
            if (request.RequestUri.AbsolutePath == "/v1/auth/")
            {
                authentication++;
                Assert.Equal(HttpMethod.Post, request.Method);
                Assert.Equal("application/x-www-form-urlencoded", request.Content!.Headers.ContentType!.MediaType);
                Assert.Contains("client_secret=test%26secret", await request.Content.ReadAsStringAsync(ct));
                Assert.Null(request.Headers.Authorization);
                return C6TestFixture.Json("{\"access_token\":\"token-" + authentication + "\",\"expires_in\":100}");
            }
            Assert.Equal("Bearer", request.Headers.Authorization!.Scheme);
            Assert.Equal("token-" + authentication, request.Headers.Authorization.Parameter);
            return C6TestFixture.Json("{\"available\":\"-4.50\"}");
        }, time: time);
        using var first = await client.Send(HttpMethod.Get, "/v1/statement/balance", null, default);
        using var second = await client.Send(HttpMethod.Get, "/v1/statement/balance", null, default);
        Assert.Equal(1, authentication);
        time.Advance(TimeSpan.FromSeconds(91));
        using var third = await client.Send(HttpMethod.Get, "/v1/statement/balance", null, default);
        Assert.Equal(2, authentication);
    }

    [Theory]
    [InlineData("https://attacker.test/v1/statement")]
    [InlineData("//attacker.test/v1/statement")]
    [InlineData("/v1/../auth")]
    [InlineData("/v1/%2e%2e/auth")]
    [InlineData("/v1/statement#secret")]
    [InlineData("/v1\\attacker.test")]
    public async Task Unsafe_destinations_are_rejected_before_credentials_are_sent(string path)
    {
        var calls = 0;
        using var client = C6TestFixture.Client((_, _) => { calls++; return Task.FromResult(C6TestFixture.Json("{}")); });
        await Assert.ThrowsAsync<BarRuleException>(() => client.Send(HttpMethod.Get, path, null, default));
        Assert.Equal(0, calls);
    }

    [Theory]
    [InlineData("Production", "Staging")]
    [InlineData("Sandbox", "Production")]
    [InlineData("production", "Production")]
    public async Task Cross_environment_credentials_cannot_be_used(string c6Environment, string appEnvironment)
    {
        var options = C6TestFixture.Settings(); options.Environment = c6Environment;
        using var client = C6TestFixture.Client((_, _) => throw new Exception("Network must not be called"), options, appEnvironment);
        await Assert.ThrowsAsync<BarRuleException>(() => client.Send(HttpMethod.Get, "/v1/statement/balance", null, default));
    }

    [Fact]
    public async Task Disabled_or_missing_credentials_prevent_requests()
    {
        var options = C6TestFixture.Settings(); options.Enabled = false;
        using var client = C6TestFixture.Client((_, _) => throw new Exception("Network must not be called"), options);
        await Assert.ThrowsAsync<BarRuleException>(() => client.Send(HttpMethod.Get, "/v1/statement/balance", null, default));
        options.Enabled = true; options.ClientSecret = "";
        await Assert.ThrowsAsync<BarRuleException>(() => client.Send(HttpMethod.Get, "/v1/statement/balance", null, default));
    }

    [Theory]
    [InlineData("GET", 2)]
    [InlineData("PUT", 1)]
    public async Task Reauthentication_retries_reads_but_never_repeats_mutations(string method, int expectedOperations)
    {
        var operations = 0;
        using var client = C6TestFixture.Client((request, _) =>
        {
            if (request.RequestUri!.AbsolutePath == "/v1/auth/") return Task.FromResult(C6TestFixture.Auth());
            operations++;
            return Task.FromResult(operations == 1 ? C6TestFixture.Json("{\"secret\":\"never-log\"}", HttpStatusCode.Unauthorized) : C6TestFixture.Json("{}"));
        });
        if (method == "GET") { using var result = await client.Send(HttpMethod.Get, "/v1/statement/balance", null, default); }
        else
        {
            var exception = await Assert.ThrowsAsync<C6ApiException>(() => client.Send(HttpMethod.Put, "/v2/pix/cob/test", new { }, default));
            Assert.DoesNotContain("never-log", exception.ToString());
        }
        Assert.Equal(expectedOperations, operations);
    }

    [Fact]
    public async Task Redirects_are_not_followed_and_provider_error_bodies_are_not_exposed()
    {
        using var client = C6TestFixture.Client((request, _) => Task.FromResult(request.RequestUri!.AbsolutePath == "/v1/auth/"
            ? C6TestFixture.Auth() : C6TestFixture.Json("{\"private\":\"secret-value\"}", HttpStatusCode.TemporaryRedirect)));
        var exception = await Assert.ThrowsAsync<C6ApiException>(() => client.Send(HttpMethod.Get, "/v1/statement/balance", null, default));
        Assert.Equal(HttpStatusCode.TemporaryRedirect, exception.StatusCode);
        Assert.DoesNotContain("secret-value", exception.ToString());
    }

    [Theory]
    [InlineData("invalid\\u0000token", "Bearer")]
    [InlineData("valid-token", "unexpected-type")]
    public async Task Invalid_authentication_material_is_rejected_without_exposing_it(string token, string type)
    {
        var requests = 0;
        using var client = C6TestFixture.Client((_, _) =>
        {
            requests++;
            return Task.FromResult(C6TestFixture.Json("{\"access_token\":\"" + token + "\",\"expires_in\":300,\"token_type\":\"" + type + "\"}"));
        });
        var exception = await Assert.ThrowsAsync<C6ApiException>(() => client.Send(HttpMethod.Get, "/v1/statement/balance", null, default));
        Assert.Equal(1, requests); Assert.DoesNotContain("token", exception.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Shared_rolling_budget_counts_authentication_and_cancels_a_queued_mutation_without_sending_it()
    {
        var time = new C6TestTime(); var requests = 0; var writes = 0;
        using var client = C6TestFixture.Client((request, _) =>
        {
            requests++;
            if (request.Method == HttpMethod.Put) writes++;
            return Task.FromResult(request.RequestUri!.AbsolutePath == "/v1/auth/" ? C6TestFixture.Auth() : C6TestFixture.Json("{}"));
        }, time: time);
        for (var i = 0; i < 49; i++) { using var result = await client.Send(HttpMethod.Get, "/v1/statement/balance", null, default); }
        Assert.Equal(50, requests); // One authentication and 49 business calls share the allowance.
        using (var cancellation = new CancellationTokenSource())
        {
            var queued = client.Send(HttpMethod.Put, "/v2/pix/cob/test", new { }, cancellation.Token);
            Assert.False(queued.IsCompleted); Assert.Equal(0, writes);
            cancellation.Cancel();
            await Assert.ThrowsAnyAsync<OperationCanceledException>(async () => { using var result = await queued; });
        }
        Assert.Equal(50, requests);
        time.Advance(TimeSpan.FromSeconds(61));
        using var next = await client.Send(HttpMethod.Put, "/v2/pix/cob/test", new { }, default);
        Assert.Equal(51, requests); Assert.Equal(1, writes);
    }

    [Fact]
    public async Task Saturated_rate_queue_returns_safe_429_and_releases_canceled_waiters()
    {
        var time = new C6TestTime(); var requests = 0;
        using var client = C6TestFixture.Client((request, _) =>
        {
            requests++;
            return Task.FromResult(request.RequestUri!.AbsolutePath == "/v1/auth/" ? C6TestFixture.Auth() : C6TestFixture.Json("{}"));
        }, time: time);
        for (var i = 0; i < 49; i++) { using var result = await client.Send(HttpMethod.Get, "/v1/statement/balance", null, default); }
        using var cancellation = new CancellationTokenSource();
        var queued = Enumerable.Range(0, 16).Select(_ => client.Send(HttpMethod.Get, "/v1/statement/balance", null, cancellation.Token)).ToArray();
        Assert.All(queued, task => Assert.False(task.IsCompleted));
        var saturated = await Assert.ThrowsAsync<C6ApiException>(() => client.Send(HttpMethod.Get, "/v1/statement/balance", null, default));
        Assert.Equal(HttpStatusCode.TooManyRequests, saturated.StatusCode); Assert.Equal(50, requests);
        cancellation.Cancel();
        foreach (var task in queued) await Assert.ThrowsAnyAsync<OperationCanceledException>(async () => { using var result = await task; });
        time.Advance(TimeSpan.FromSeconds(61));
        using var resumed = await client.Send(HttpMethod.Get, "/v1/statement/balance", null, default);
        Assert.Equal(51, requests);
    }

    [Fact]
    public async Task Provider_rate_rejection_never_automatically_retries_a_write()
    {
        var writes = 0;
        using var client = C6TestFixture.Client((request, _) =>
        {
            if (request.RequestUri!.AbsolutePath == "/v1/auth/") return Task.FromResult(C6TestFixture.Auth());
            writes++;
            return Task.FromResult(C6TestFixture.Json("{\"detail\":\"private-provider-data\"}", HttpStatusCode.TooManyRequests));
        });
        var rejected = await Assert.ThrowsAsync<C6ApiException>(() => client.Send(HttpMethod.Put, "/v2/pix/cob/test", new { }, default));
        Assert.Equal(HttpStatusCode.TooManyRequests, rejected.StatusCode); Assert.Equal(1, writes);
        Assert.DoesNotContain("private-provider-data", rejected.ToString());
    }

    [Fact]
    public void Certificate_expiry_and_missing_private_key_are_diagnosed()
    {
        using var key = RSA.Create(2048);
        var now = DateTimeOffset.UtcNow;
        var request = new CertificateRequest("CN=LongBeach test only", key, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        using var expired = request.CreateSelfSigned(now.AddDays(-2), now.AddDays(-1));
        Assert.Contains("expirou", Assert.Throws<BarRuleException>(() => C6CertificateTransport.ValidateCertificate(expired, now)).Message);
        using var valid = request.CreateSelfSigned(now.AddHours(-1), now.AddHours(1));
        C6CertificateTransport.ValidateCertificate(valid, now);
        using var withoutKey = X509CertificateLoader.LoadCertificate(valid.Export(X509ContentType.Cert));
        Assert.Contains("chave privada", Assert.Throws<BarRuleException>(() => C6CertificateTransport.ValidateCertificate(withoutKey, now)).Message);
    }
}

internal static class C6TestFixture
{
    public static C6Options Settings() => new()
    {
        Enabled = true, BankingEnabled = true, PixEnabled = true, Environment = "Sandbox", AccountId = "test-account",
        ClientId = "test-client", ClientSecret = "test&secret", CertificatePath = "/test-only/no-real-cert.pfx", PixKey = "pix-test@longbeach.test"
    };
    public static C6ApiClient Client(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> callback,
        C6Options? settings = null, string environment = "Test", TimeProvider? time = null)
        => new(new HttpClient(new Handler(callback)), Options.Create(settings ?? Settings()), new HostEnvironment(environment), time);
    public static HttpResponseMessage Auth() => Json("{\"access_token\":\"test-token\",\"expires_in\":3600}");
    public static HttpResponseMessage Json(string value, HttpStatusCode status = HttpStatusCode.OK)
        => new(status) { Content = new StringContent(value, Encoding.UTF8, "application/json") };
    private sealed class Handler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> callback) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) => callback(request, ct);
    }
    private sealed class HostEnvironment(string environment) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = environment;
        public string ApplicationName { get; set; } = "LongBeach.Tests";
        public string ContentRootPath { get; set; } = "/test-only";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}

internal sealed class C6TestTime : TimeProvider
{
    private DateTimeOffset now = new(2026, 10, 19, 12, 0, 0, TimeSpan.Zero);
    public override DateTimeOffset GetUtcNow() => now;
    public override long GetTimestamp() => now.UtcTicks;
    public override long TimestampFrequency => TimeSpan.TicksPerSecond;
    public void Advance(TimeSpan amount) => now += amount;
}
