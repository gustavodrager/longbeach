using System.Text.Json;
using LongBeach.Contracts.Billing;
using LongBeach.Domain.Bar;
using LongBeach.Infrastructure.Billing;
using LongBeach.Infrastructure.C6;
using LongBeach.Infrastructure.Finance;
using LongBeach.Infrastructure.Payments;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace LongBeach.UnitTests;

public sealed class BankImportModeTests
{
    private static IConfiguration Config(bool? enabled = true) => new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
    {
        [BankImportMode.Key] = enabled?.ToString(), ["Payments:Billing:Enabled"] = "true",
        ["Payments:PagBank:Enabled"] = "true", ["Payments:PagBank:CardEnabled"] = "true",
        ["Payments:PagBank:RefreshWebhookKeys"] = "true", ["Payments:PagBankSubscriptions:Enabled"] = "true",
        ["Integrations:C6:Enabled"] = "true", ["Integrations:C6:BankingEnabled"] = "true",
        ["Integrations:PagBankEdi:Enabled"] = "true"
    }).Build();

    [Fact]
    public void Mode_is_opt_in_and_diagnostics_do_not_request_credentials_while_importing()
    {
        Assert.False(BankImportMode.Enabled(Config(null)));
        Assert.False(BankImportMode.Enabled(Config(false)));
        var diagnostics = PaymentIntegrationDiagnostics.Read(Config());
        Assert.Equal(4, diagnostics.Count);
        Assert.All(diagnostics, value =>
        {
            Assert.Equal("Importação de arquivos", value.State);
            Assert.Empty(value.Requirements!);
            Assert.Null(value.FailureCode);
            Assert.Contains("histórico", value.Detail);
        });
        Assert.DoesNotContain("credencia", JsonSerializer.Serialize(diagnostics), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task C6_blocks_before_authentication_certificate_or_any_http_request()
    {
        var handler = new NoRequests();
        using var client = new C6ApiClient(new HttpClient(handler), Options.Create(C6TestFixture.Settings()), new TestEnvironment(), configuration: Config());
        Assert.True(client.ImportOnly);
        foreach (var method in new[] { HttpMethod.Get, HttpMethod.Put })
        {
            var failure = await Assert.ThrowsAsync<BarRuleException>(() => client.Send(method, "/v1/statement/balance", null, default));
            Assert.Contains("importação de arquivos", failure.Message);
        }
        Assert.False(new C6PaymentGateway(client, Options.Create(C6TestFixture.Settings())).Enabled);
        using var certificateClient = new HttpClient(new C6CertificateTransport(new C6Options(), new TestEnvironment(), configuration: Config()));
        await Assert.ThrowsAsync<BarRuleException>(() => certificateClient.GetAsync("https://baas-api-sandbox.c6bank.info/v1/statement/balance"));
        Assert.Equal(0, handler.Calls);
    }

    [Fact]
    public async Task PagBank_blocks_reads_refunds_public_keys_and_webhook_key_refresh_before_http()
    {
        var handler = new NoRequests();
        using var http = new HttpClient(handler);
        var gateway = new PagBankPaymentGateway(http, Config());
        Assert.False(gateway.Enabled); Assert.False(gateway.CardEnabled);
        Assert.Null(await gateway.CardPublicKey(default));
        await Assert.ThrowsAsync<BarRuleException>(() => gateway.Get("ORDE_existing", default));
        await Assert.ThrowsAsync<BarRuleException>(() => gateway.RefundPartial("ORDE_existing", Guid.NewGuid(), 10, 0, default));
        Assert.False(await gateway.VerifyWebhookAsync([1], ["existing-signature"], default));
        Assert.Equal(0, handler.Calls);
    }

    [Fact]
    public async Task Recurring_queries_and_cancellations_are_blocked_before_http()
    {
        var handler = new NoRequests();
        using var http = new HttpClient(handler);
        var gateway = new PagBankRecurringGateway(http, Config());
        Assert.False(gateway.Enabled);
        await Assert.ThrowsAsync<BarRuleException>(() => gateway.Get("SUBS_existing", default));
        await Assert.ThrowsAsync<BarRuleException>(() => gateway.Cancel("SUBS_existing", Guid.NewGuid(), default));
        Assert.Equal(0, handler.Calls);
    }

    [Fact]
    public async Task Billing_configuration_and_recovery_do_not_touch_providers_or_pending_records()
    {
        // Null dependencies make any attempt to load/change a pending record or call a provider fail.
        var service = new BillingService(null!, null!, null!, null!, null!, TimeProvider.System, NullLogger<BillingService>.Instance, Config());
        Assert.Equal(new BillingConfig(false, false, false, null, null, false, false, true), await service.Config(default));
        await service.Recover(default);
        await Assert.ThrowsAsync<BarRuleException>(() => service.Pay(Guid.NewGuid(), null!, Guid.NewGuid(), false, default));
        await Assert.ThrowsAsync<BarRuleException>(() => service.Subscribe(Guid.NewGuid(), null!, Guid.NewGuid(), default));
        await Assert.ThrowsAsync<BarRuleException>(() => service.Cancel(Guid.NewGuid(), new(Guid.NewGuid()), Guid.NewGuid(), default));
        await Assert.ThrowsAsync<BarRuleException>(() => service.Refresh(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), false, default));
        await Assert.ThrowsAsync<BarRuleException>(() => service.RefreshSubscription(Guid.NewGuid(), Guid.NewGuid(), default));
        Assert.False(await service.SubscriptionWebhook([], default));
    }

    [Fact]
    public async Task Provider_workers_exit_without_opening_scopes_or_scheduling_retries()
    {
        var scopes = new NoScopes(); var config = Config();
        BackgroundService[] workers = [
            new BillingWorker(scopes, TimeProvider.System, NullLogger<BillingWorker>.Instance, config),
            new PagBankReconciliationWorker(scopes, TimeProvider.System, NullLogger<PagBankReconciliationWorker>.Instance, config),
            new C6BankingWorker(scopes, config, TimeProvider.System, NullLogger<C6BankingWorker>.Instance),
            new PagBankEdiWorker(scopes, null!, config, TimeProvider.System, NullLogger<PagBankEdiWorker>.Instance)
        ];
        foreach (var worker in workers)
        {
            using (worker)
            {
                await worker.StartAsync(default);
                await worker.ExecuteTask!.WaitAsync(TimeSpan.FromSeconds(2));
                await worker.StopAsync(default);
            }
        }
        Assert.Equal(0, scopes.Calls);
    }

    [Fact]
    public async Task On_demand_collectors_and_failure_reporting_cannot_bypass_import_mode()
    {
        var scopes = new NoScopes(); var config = Config();
        using var c6 = new C6BankingWorker(scopes, config, TimeProvider.System, NullLogger<C6BankingWorker>.Instance);
        using var edi = new PagBankEdiWorker(scopes, null!, config, TimeProvider.System, NullLogger<PagBankEdiWorker>.Instance);
        await Assert.ThrowsAsync<BarRuleException>(() => c6.Run(default));
        await Assert.ThrowsAsync<BarRuleException>(() => edi.Run("123", "fixture", new(2026, 10, 1), default));
        await Assert.ThrowsAsync<BarRuleException>(() => edi.BackfillNow(default));
        await Assert.ThrowsAsync<BarRuleException>(() => edi.Reprocess(new(2026, 10, 1), new(2026, 10, 2), "Fixture", Guid.NewGuid(), default));
        await c6.RecordFailure("C6_TIMEOUT", default);
        await edi.RecordFailure("EDI_TIMEOUT", default);
        Assert.Equal(0, scopes.Calls);
    }

    private sealed class NoRequests : HttpMessageHandler
    {
        public int Calls;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Calls++;
            throw new InvalidOperationException("Import mode must block HTTP before this handler.");
        }
    }

    private sealed class NoScopes : IServiceScopeFactory
    {
        public int Calls;
        public IServiceScope CreateScope() { Calls++; throw new InvalidOperationException("Import mode must not start provider work."); }
    }

    private sealed class TestEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Test";
        public string ApplicationName { get; set; } = "LongBeach.Tests";
        public string ContentRootPath { get; set; } = "/test-only";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
