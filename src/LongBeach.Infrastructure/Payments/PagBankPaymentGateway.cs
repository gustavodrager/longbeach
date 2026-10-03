using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using LongBeach.Application.Bar;
using LongBeach.Domain.Bar;
using Microsoft.Extensions.Configuration;
namespace LongBeach.Infrastructure.Payments;
public sealed partial class PagBankPaymentGateway(HttpClient http, IConfiguration config) : IPaymentGateway
{
    public bool Enabled => config.GetValue("Payments:PagBank:Enabled",false);
    private void Configure()
    {
        if(!Enabled)throw new BarRuleException("Pix PagBank ainda não está habilitado neste ambiente.");
        var url=config["Payments:PagBank:BaseUrl"] ?? "https://sandbox.api.pagseguro.com/";
        if(url!="https://sandbox.api.pagseguro.com/" && url!="https://api.pagseguro.com/")throw new BarRuleException("Ambiente PagBank inválido.");
        var token=config["Payments:PagBank:Token"];if(string.IsNullOrWhiteSpace(token))throw new BarRuleException("Credencial PagBank ausente.");
        if(http.BaseAddress is null)http.BaseAddress=new Uri(url);http.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",token);
    }
    public async Task<GatewayPayment> CreatePix(Guid paymentId, Guid operationId, decimal amount, DateTimeOffset expires, PixCustomer customer, CancellationToken ct)
    {
        Configure();
        var webhook=config["Payments:PagBank:WebhookUrl"];
        if(!Uri.TryCreate(webhook,UriKind.Absolute,out var uri)||uri.Scheme!="https")throw new BarRuleException("Configure URL HTTPS do webhook PagBank.");
        if(!TaxIdPattern().IsMatch(customer.TaxId))throw new BarRuleException("Documento do pagador deve conter 11 ou 14 dígitos.");
        var body=new { reference_id=paymentId.ToString(), customer=new {name=BarRules.Text(customer.Name,160,"Nome do pagador"),email=BarRules.Text(customer.Email,320,"E-mail do pagador"),tax_id=customer.TaxId},
            charges=new[]{new{reference_id=paymentId.ToString(),description="Venda Long Beach",amount=new{value=checked((long)(amount*100)),currency="BRL"},payment_method=new{type="PIX",pix=new{expiration_date=expires.ToString("O")}}}},notification_urls=new[]{webhook}};
        using var request=new HttpRequestMessage(HttpMethod.Post,"orders"){Content=JsonContent.Create(body)};request.Headers.Add("x-idempotency-key",operationId.ToString());
        using var response=await http.SendAsync(request,ct);return await Read(response,ct);
    }
    public async Task<GatewayPayment> Get(string orderId,CancellationToken ct)
    {
        Configure();if(!OrderPattern().IsMatch(orderId))throw new BarRuleException("Pedido PagBank inválido.");
        using var response=await http.GetAsync("orders/"+orderId,ct);return await Read(response,ct);
    }
    public async Task<GatewayPayment> Refund(string orderId,Guid operationId,decimal amount,CancellationToken ct)
    {
        var current=await Get(orderId,ct);if(current.Refunded==checked((long)(amount*100)))return current;
        if(!ChargePattern().IsMatch(current.ChargeId))throw new BarRuleException("Identificador da cobrança inválido.");
        using var request=new HttpRequestMessage(HttpMethod.Post,"charges/"+current.ChargeId+"/cancel"){Content=JsonContent.Create(new {amount=new {value=checked((long)(amount*100))}})};
        request.Headers.Add("x-idempotency-key",operationId.ToString());
        using var response=await http.SendAsync(request,ct);
        var confirmed=await Get(orderId,ct);
        if(confirmed.Refunded!=checked((long)(amount*100)))throw new BarRuleException("Estorno PagBank ainda não confirmado. Consulte antes de repetir.");
        return confirmed;
    }
    public bool VerifyWebhook(byte[] body,IEnumerable<string> signatures)
    {
        if(!Enabled)return false;var key=config["Payments:PagBank:WebhookPublicKey"];if(string.IsNullOrWhiteSpace(key))return false;
        try
        {
            using var ecdsa=ECDsa.Create();ecdsa.ImportSubjectPublicKeyInfo(Convert.FromBase64String(key),out _);
            foreach(var signature in signatures.SelectMany(x=>x.Split(',',StringSplitOptions.TrimEntries|StringSplitOptions.RemoveEmptyEntries)))
            {
                try{if(ecdsa.VerifyData(body,Convert.FromBase64String(signature),HashAlgorithmName.SHA256,DSASignatureFormat.Rfc3279DerSequence))return true;}catch(FormatException){}
            }
        }catch(FormatException){}catch(CryptographicException){}
        return false;
    }
    private static async Task<GatewayPayment> Read(HttpResponseMessage response,CancellationToken ct)
    {
        if(!response.IsSuccessStatusCode)throw new BarRuleException("PagBank não confirmou a operação. Consulte o pagamento antes de tentar outra forma.");
        using var doc=await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct),cancellationToken:ct);var order=doc.RootElement;
        var charges=order.GetProperty("charges");if(charges.GetArrayLength()!=1)throw new BarRuleException("Resposta PagBank com quantidade inesperada de cobranças.");
        var charge=charges[0];var amount=charge.GetProperty("amount");var text=charge.TryGetProperty("qr_code",out var qr)?qr.GetProperty("text").GetString():null;string? image=null;
        if(charge.TryGetProperty("links",out var links))foreach(var link in links.EnumerateArray())if(link.GetProperty("rel").GetString()=="QRCODE.PNG")image=link.GetProperty("href").GetString();
        return new(order.GetProperty("id").GetString()!,charge.GetProperty("id").GetString()!,charge.GetProperty("reference_id").GetString()!,charge.GetProperty("status").GetString()!,amount.GetProperty("value").GetInt64(),amount.GetProperty("currency").GetString()!,text,image,amount.TryGetProperty("summary",out var summary)&&summary.TryGetProperty("refunded",out var refunded)?refunded.GetInt64():0);
    }
    [GeneratedRegex("^CHAR_[A-Za-z0-9-]+$")] private static partial Regex ChargePattern();
    [GeneratedRegex("^ORDE_[A-Za-z0-9-]+$")] private static partial Regex OrderPattern();
    [GeneratedRegex("^(?:[0-9]{11}|[0-9]{14})$")] private static partial Regex TaxIdPattern();
}
