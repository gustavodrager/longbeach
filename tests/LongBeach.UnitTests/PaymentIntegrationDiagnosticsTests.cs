using System.Security.Cryptography;
using System.Text.Json;
using LongBeach.Infrastructure.Finance;
using LongBeach.Infrastructure.Payments;
using Microsoft.Extensions.Configuration;

namespace LongBeach.UnitTests;

public sealed class PaymentIntegrationDiagnosticsTests
{
    private static IConfiguration Config(Dictionary<string,string?> values) => new ConfigurationBuilder().AddInMemoryCollection(values).Build();

    [Fact]
    public void Missing_configuration_is_reported_per_product_without_claiming_connection()
    {
        var result = PaymentIntegrationDiagnostics.Read(Config([]));
        Assert.Equal(3, result.Count);
        Assert.All(result, status => { Assert.Equal("Desativado", status.State); Assert.Null(status.LastSuccessUtc); Assert.NotEmpty(status.Requirements!); });
        Assert.Contains(result[0].Requirements!, x => x.Contains("token"));
        Assert.Contains(result[2].Requirements!, x => x.Contains("Recorrência"));
    }

    [Fact]
    public void Valid_configuration_is_not_reported_as_homologated_and_never_exposes_values()
    {
        using var ec = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var key = Convert.ToBase64String(ec.ExportSubjectPublicKeyInfo());
        var values = new Dictionary<string,string?> {
            ["Payments:PagBank:Enabled"]="true", ["Payments:PagBank:Token"]="private-token-do-not-expose",
            ["Payments:PagBank:WebhookPublicKey"]=key, ["Payments:PagBank:WebhookUrl"]="https://arena.example/api/v1/integrations/pagbank/webhook",
            ["Payments:Billing:Enabled"]="true"
        };
        var result = PaymentIntegrationDiagnostics.Read(Config(values));
        Assert.Equal("Configurado; validar operação",result[0].State);
        Assert.Equal("Sandbox",result[0].Environment);
        Assert.Empty(result[0].Requirements!);
        Assert.Equal("Desativado",result[1].State);
        var json=JsonSerializer.Serialize(result);
        Assert.DoesNotContain(values["Payments:PagBank:Token"]!,json);
        Assert.DoesNotContain(key,json);
        Assert.DoesNotContain("arena.example",json);
    }

    [Theory]
    [InlineData("http://arena.example/api/v1/integrations/pagbank/webhook")]
    [InlineData("https://localhost/api/v1/integrations/pagbank/webhook")]
    [InlineData("https://arena.example/incorrect")]
    [InlineData("https://name:password@arena.example/api/v1/integrations/pagbank/webhook")]
    public void Invalid_callback_is_an_actionable_configuration_problem(string callback)
    {
        var result=PaymentIntegrationDiagnostics.Read(Config(new(){["Payments:PagBank:Enabled"]="true",["Payments:PagBank:WebhookUrl"]=callback}));
        Assert.Equal("Configuração incompleta",result[0].State);
        Assert.Contains(result[0].Requirements!,x=>x.Contains("endereço público HTTPS"));
    }

    [Fact]
    public void Card_keys_and_trailing_data_are_not_valid_webhook_keys()
    {
        using var rsa=RSA.Create();using var ec=ECDsa.Create(ECCurve.NamedCurves.nistP256);
        Assert.False(PaymentIntegrationDiagnostics.ValidWebhookKey(Convert.ToBase64String(rsa.ExportSubjectPublicKeyInfo())));
        Assert.False(PaymentIntegrationDiagnostics.ValidWebhookKey(Convert.ToBase64String([..ec.ExportSubjectPublicKeyInfo(),1])));
        Assert.True(PaymentIntegrationDiagnostics.ValidWebhookKey(Convert.ToBase64String(ec.ExportSubjectPublicKeyInfo())));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("2026-10-13")]
    [InlineData("1999-12-31")]
    [InlineData("12/10/2026")]
    public void Edi_cannot_silently_skip_collection_with_missing_or_future_start_date(string? date)
    {
        var result=PagBankEdiConfiguration.Problems(Config(new(){["Integrations:PagBankEdi:User"]="123",["Integrations:PagBankEdi:Token"]="edi-only",["Integrations:PagBankEdi:StartDate"]=date}),new(2026,10,12));
        Assert.Single(result);Assert.Contains("data inicial",result[0]);
    }

    [Fact]
    public void Edi_identifies_invalid_credentials_without_leaking_them()
    {
        var values=new Dictionary<string,string?>{["Integrations:PagBankEdi:User"]="invalid-merchant",["Integrations:PagBankEdi:Token"]="private\ntoken",["Integrations:PagBankEdi:StartDate"]="2026-10-12"};
        var result=PagBankEdiConfiguration.Problems(Config(values),new(2026,10,12));
        Assert.Equal(2,result.Count);Assert.DoesNotContain("invalid-merchant",JsonSerializer.Serialize(result));
        values["Integrations:PagBankEdi:User"]="123";values["Integrations:PagBankEdi:Token"]="edi-only";
        Assert.Empty(PagBankEdiConfiguration.Problems(Config(values),new(2026,10,12)));
    }
}
