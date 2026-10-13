using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using LongBeach.Infrastructure.Payments;
using Microsoft.Extensions.Configuration;

namespace LongBeach.UnitTests;

public sealed class PagBankWebhookRotationTests
{
    private static readonly byte[] Body=Encoding.UTF8.GetBytes("{\"id\":\"ORDE_TEST\"}");
    private static string Sign(ECDsa key)=>Convert.ToBase64String(key.SignData(Body,HashAlgorithmName.SHA256,DSASignatureFormat.Rfc3279DerSequence));
    private static PagBankPaymentGateway Gateway(Handler handler,ECDsa? provisioned=null,PagBankWebhookKeys? cache=null,string token="test-only")
        =>new(new HttpClient(handler),new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?>{
            ["Payments:PagBank:RefreshWebhookKeys"]="true",["Payments:PagBank:Token"]=token,
            ["Payments:PagBank:WebhookPublicKey"]=provisioned is null?null:Convert.ToBase64String(provisioned.ExportSubjectPublicKeyInfo())
        }).Build(),cache);

    [Fact]
    public async Task Refresh_uses_typed_endpoint_and_retains_provisioned_key_during_rotation()
    {
        using var previous=ECDsa.Create(ECCurve.NamedCurves.nistP256);using var current=ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var handler=new Handler(JsonSerializer.Serialize(new{public_key=Convert.ToBase64String(current.ExportSubjectPublicKeyInfo())}));
        var gateway=Gateway(handler,previous);
        Assert.True(await gateway.VerifyWebhookAsync(Body,[Sign(current)],default));
        Assert.True(await gateway.VerifyWebhookAsync(Body,[Sign(previous)],default));
        Assert.False(await gateway.VerifyWebhookAsync([1,2],[Sign(current)],default));
        Assert.Equal(1,handler.Calls);
        Assert.Equal("https://sandbox.api.pagseguro.com/public-keys/webhook",handler.Uri);
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("{\"public_key\":null}")]
    [InlineData("{\"public_key\":123}")]
    [InlineData("{\"public_key\":\"invalid\"}")]
    [InlineData("[]")]
    [InlineData("invalid json")]
    public async Task Malformed_key_response_keeps_trusted_key_and_never_accepts_untrusted_signature(string response)
    {
        using var trusted=ECDsa.Create(ECCurve.NamedCurves.nistP256);using var other=ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var gateway=Gateway(new Handler(response),trusted);
        Assert.True(await gateway.VerifyWebhookAsync(Body,[Sign(trusted)],default));
        Assert.False(await gateway.VerifyWebhookAsync(Body,[Sign(other)],default));
    }

    [Fact]
    public async Task Unavailable_provider_uses_trusted_key_but_cannot_authenticate_without_one()
    {
        using var trusted=ECDsa.Create(ECCurve.NamedCurves.nistP256);
        Assert.True(await Gateway(new Handler("",HttpStatusCode.ServiceUnavailable),trusted).VerifyWebhookAsync(Body,[Sign(trusted)],default));
        Assert.False(await Gateway(new Handler("",HttpStatusCode.ServiceUnavailable)).VerifyWebhookAsync(Body,[Sign(trusted)],default));
    }

    [Fact]
    public async Task Empty_signature_never_fetches_keys_and_caches_are_separate_by_credential()
    {
        using var trusted=ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var handler=new Handler(JsonSerializer.Serialize(new{public_key=Convert.ToBase64String(trusted.ExportSubjectPublicKeyInfo())}));
        var cache=new PagBankWebhookKeys();var first=Gateway(handler,null,cache);
        Assert.False(await first.VerifyWebhookAsync(Body,[],default));Assert.Equal(0,handler.Calls);
        Assert.True(await first.VerifyWebhookAsync(Body,[Sign(trusted)],default));
        Assert.False(await Gateway(new Handler("{}"),null,cache,"other-account").VerifyWebhookAsync(Body,[Sign(trusted)],default));
    }

    [Fact]
    public async Task Rsa_card_key_is_not_used_as_webhook_key()
    {
        using var rsa=RSA.Create();using var trusted=ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var gateway=Gateway(new Handler(JsonSerializer.Serialize(new{public_key=Convert.ToBase64String(rsa.ExportSubjectPublicKeyInfo())})),trusted);
        Assert.True(await gateway.VerifyWebhookAsync(Body,[Sign(trusted)],default));
    }

    private sealed class Handler(string content,HttpStatusCode status=HttpStatusCode.OK):HttpMessageHandler
    {
        public int Calls;public string? Uri;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken ct)
        {
            Calls++;Uri=request.RequestUri!.ToString();
            return Task.FromResult(new HttpResponseMessage(status){Content=new StringContent(content,Encoding.UTF8,"application/json")});
        }
    }
}
