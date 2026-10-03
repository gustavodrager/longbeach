using System.Net;
using System.Security.Cryptography;
using System.Text;
using LongBeach.Infrastructure.Payments;
using LongBeach.Application.Bar;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
namespace LongBeach.UnitTests;
public sealed class PagBankGatewayTests
{
    [Fact]
    public void Webhook_signature_checks_original_bytes_and_rejects_modified_payload()
    {
        using var key=ECDsa.Create(ECCurve.NamedCurves.nistP256);var config=Config(new Dictionary<string,string?>{["Payments:PagBank:Enabled"]="true",["Payments:PagBank:WebhookPublicKey"]=Convert.ToBase64String(key.ExportSubjectPublicKeyInfo())});
        var gateway=new PagBankPaymentGateway(new HttpClient(),config);var payload=Encoding.UTF8.GetBytes("{\"id\":\"ORDE_1\"}");var signature=Convert.ToBase64String(key.SignData(payload,HashAlgorithmName.SHA256,DSASignatureFormat.Rfc3279DerSequence));
        Assert.True(gateway.VerifyWebhook(payload,["invalid",signature]));Assert.False(gateway.VerifyWebhook(Encoding.UTF8.GetBytes("{}"),[signature]));Assert.False(gateway.VerifyWebhook(payload,["invalid"]));
    }
    [Fact]
    public void Disabled_gateway_rejects_every_signature() => Assert.False(new PagBankPaymentGateway(new HttpClient(),Config(new Dictionary<string,string?>())).VerifyWebhook([1,2,3],["anything"]));
    [Fact]
    public async Task Pix_uses_stable_idempotency_key_and_supports_create_then_query_on_same_client()
    {
        var paymentId=Guid.NewGuid();var operationId=Guid.NewGuid();var handler=new ProviderHandler(paymentId.ToString());
        var config=Config(new Dictionary<string,string?>{["Payments:PagBank:Enabled"]="true",["Payments:PagBank:Token"]="test-token",["Payments:PagBank:WebhookUrl"]="https://longbeach.test/api/v1/integrations/pagbank/webhook"});
        var gateway=new PagBankPaymentGateway(new HttpClient(handler),config);
        var created=await gateway.CreatePix(paymentId,operationId,10,DateTimeOffset.UtcNow.AddMinutes(10),new PixCustomer("Pagador teste","pix@longbeach.test","12345678909"),default);
        var fetched=await gateway.Get(created.OrderId,default);
        Assert.Equal(operationId.ToString(),handler.Idempotency);Assert.Equal("10.00",(fetched.Amount/100m).ToString("0.00",System.Globalization.CultureInfo.InvariantCulture));
        Assert.Equal(paymentId.ToString(),fetched.Reference);Assert.Equal("PIX",handler.PaymentType);Assert.Equal(2,handler.Calls);
    }
    private sealed class ProviderHandler(string reference):HttpMessageHandler
    {
        public int Calls;public string? Idempotency;public string? PaymentType;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken ct)
        {
            Calls++;
            if(request.Method==HttpMethod.Post){Idempotency=request.Headers.GetValues("x-idempotency-key").Single();using var doc=JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct));var charge=doc.RootElement.GetProperty("charges")[0];PaymentType=charge.GetProperty("payment_method").GetProperty("type").GetString();Assert.Equal(1000,charge.GetProperty("amount").GetProperty("value").GetInt32());}
            var json=JsonSerializer.Serialize(new{id="ORDE_TEST",charges=new[]{new{id="CHAR_TEST",reference_id=reference,status="WAITING",amount=new{value=1000,currency="BRL",summary=new{refunded=0}},qr_code=new{text="pix-test"}}}});
            return new HttpResponseMessage(HttpStatusCode.OK){Content=new StringContent(json,Encoding.UTF8,"application/json")};
        }
    }
    private static IConfiguration Config(Dictionary<string,string?> values)=>new ConfigurationBuilder().AddInMemoryCollection(values).Build();
}
