using System.Net;
using System.Security.Authentication;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using LongBeach.Domain.Bar;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace LongBeach.Infrastructure.C6;

public static class C6ClientRegistration
{
    public static IServiceCollection AddC6Client(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<C6Options>(configuration.GetSection(C6Options.SectionName));
        services.AddSingleton(sp =>
        {
            var options = sp.GetRequiredService<IOptions<C6Options>>();
            var environment = sp.GetRequiredService<IHostEnvironment>();
            var time = sp.GetService<TimeProvider>() ?? TimeProvider.System;
            return new C6ApiClient(new HttpClient(new C6CertificateTransport(options.Value, environment, time))
                { Timeout = Timeout.InfiniteTimeSpan }, options, environment, time);
        });
        services.AddSingleton<C6PaymentGateway>();
        return services;
    }
}

/// <summary>Loads the server-only certificate lazily; disabled integration never needs credentials to boot.</summary>
public sealed class C6CertificateTransport(C6Options options, IHostEnvironment environment, TimeProvider? clock = null) : HttpMessageHandler
{
    private readonly object gate = new();
    private readonly TimeProvider time = clock ?? TimeProvider.System;
    private HttpMessageInvoker? transport;
    private X509Certificate2? certificate;

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var expected = C6ApiClient.BaseAddress(options.Environment);
        if (request.RequestUri is null || request.RequestUri.Scheme != "https" || request.RequestUri.Host != expected.Host
            || request.RequestUri.Port != 443 || !string.IsNullOrEmpty(request.RequestUri.UserInfo))
            throw new BarRuleException("Destino C6 inválido.");
        lock (gate)
        {
            if (!options.Enabled) throw new BarRuleException("Conexão C6 desabilitada.");
            var problems = options.ConfigurationProblems(environment);
            if (problems.Count > 0) throw new BarRuleException(problems[0]);
            certificate ??= LoadCertificate();
            ValidateCertificate(certificate, time.GetUtcNow());
            transport ??= new HttpMessageInvoker(new SocketsHttpHandler
            {
                AllowAutoRedirect = false,
                UseCookies = false,
                AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate,
                PooledConnectionLifetime = TimeSpan.FromMinutes(5),
                SslOptions = new()
                {
                    EnabledSslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13,
                    ClientCertificates = new X509CertificateCollection { certificate }
                }
            });
            return transport.SendAsync(request, cancellationToken);
        }
    }

    private X509Certificate2 LoadCertificate()
    {
        try
        {
            return string.IsNullOrWhiteSpace(options.CertificateKeyPath)
                ? X509CertificateLoader.LoadPkcs12FromFile(options.CertificatePath, options.CertificatePassword, X509KeyStorageFlags.EphemeralKeySet)
                : X509Certificate2.CreateFromPemFile(options.CertificatePath, options.CertificateKeyPath);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or CryptographicException or ArgumentException)
        {
            throw new BarRuleException("Não foi possível carregar o certificado mTLS C6. Confira o certificado e a chave privada no servidor.");
        }
    }

    public static void ValidateCertificate(X509Certificate2 value, DateTimeOffset now)
    {
        if (!value.HasPrivateKey) throw new BarRuleException("O certificado mTLS C6 precisa conter a chave privada.");
        if (value.NotAfter.ToUniversalTime() <= now.UtcDateTime) throw new BarRuleException("O certificado mTLS C6 expirou. Renove o certificado no servidor.");
        if (value.NotBefore.ToUniversalTime() > now.UtcDateTime) throw new BarRuleException("O certificado mTLS C6 ainda não está válido.");
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) lock (gate) { transport?.Dispose(); certificate?.Dispose(); }
        base.Dispose(disposing);
    }
}
