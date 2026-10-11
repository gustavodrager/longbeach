using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using LongBeach.Application.Bar;
using LongBeach.Domain.Bar;
using Microsoft.Extensions.Configuration;
namespace LongBeach.Infrastructure.Payments;
public sealed partial class PagBankPaymentGateway(HttpClient http, IConfiguration config, PagBankWebhookKeys? keys = null) : IPaymentGateway
{
    public bool Enabled => config.GetValue("Payments:PagBank:Enabled",false) && config.GetValue("Payments:PagBank:PixEnabled",true);
    public bool CardEnabled => config.GetValue("Payments:PagBank:Enabled",false) && config.GetValue("Payments:PagBank:CardEnabled", false);
    public async Task<string?> CardPublicKey(CancellationToken ct)
    {
        if (!CardEnabled) return null;
        Configure(); using var response = await http.GetAsync("public-keys/card", ct);
        if (!response.IsSuccessStatusCode) throw new BarRuleException("Não foi possível preparar o cartão. Tente novamente.");
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
        return json.RootElement.GetProperty("public_key").GetString();
    }
    public async Task<GatewayPayment> CreateCard(Guid paymentId, Guid operationId, decimal amount, PixCustomer customer, string encryptedCard, CancellationToken ct)
    {
        if (!CardEnabled) throw new BarRuleException("Cartão online ainda não habilitado.");
        Configure();
        if (string.IsNullOrWhiteSpace(encryptedCard) || encryptedCard.Length > 12000 || !TaxIdPattern().IsMatch(customer.TaxId)) throw new BarRuleException("Confira os dados do cartão e do pagador.");
        var webhook = config["Payments:PagBank:WebhookUrl"];
        if (!Uri.TryCreate(webhook, UriKind.Absolute, out var uri) || uri.Scheme != "https") throw new BarRuleException("Configure o webhook HTTPS.");
        var body = new { reference_id = paymentId.ToString(), customer = new { name = customer.Name, email = customer.Email, tax_id = customer.TaxId },
            items = new[] { new { reference_id = paymentId.ToString(), name = "Pagamento Long Beach", quantity = 1, unit_amount = checked((long)(amount * 100)) } },
            charges = new[] { new { reference_id = paymentId.ToString(), description = "Pagamento Long Beach", amount = new { value = checked((long)(amount * 100)), currency = "BRL" },
                payment_method = new { type = "CREDIT_CARD", installments = 1, capture = true, card = new { encrypted = encryptedCard, store = false } } } }, notification_urls = new[] { webhook } };
        using var request = new HttpRequestMessage(HttpMethod.Post, "orders") { Content = JsonContent.Create(body) };
        request.Headers.Add("x-idempotency-key", operationId.ToString()); using var response = await http.SendAsync(request, ct); return await Read(response, ct);
    }
    private void Configure()
    {

        var url=config["Payments:PagBank:BaseUrl"] ?? "https://sandbox.api.pagseguro.com/";
        if(url!="https://sandbox.api.pagseguro.com/" && url!="https://api.pagseguro.com/")throw new BarRuleException("Ambiente PagBank inválido.");
        var token=config["Payments:PagBank:Token"];if(string.IsNullOrWhiteSpace(token))throw new BarRuleException("Credencial PagBank ausente.");
        if(http.BaseAddress is null)http.BaseAddress=new Uri(url);http.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",token);
        if(!http.DefaultRequestHeaders.UserAgent.Any())http.DefaultRequestHeaders.UserAgent.ParseAdd("LongBeachOS/1.0");
        if(!http.DefaultRequestHeaders.Accept.Any())http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
    }
    public async Task<GatewayPayment> CreatePix(Guid paymentId, Guid operationId, decimal amount, DateTimeOffset expires, PixCustomer customer, CancellationToken ct)
    {
        if (!Enabled) throw new BarRuleException("Pix PagBank ainda não habilitado.");
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
        => await RefundPartial(orderId, operationId, amount, 0, ct);
    public async Task<GatewayPayment> RefundPartial(string orderId,Guid operationId,decimal amount,decimal previouslyRefunded,CancellationToken ct)
    {
        BarRules.Money(amount); BarRules.Money(previouslyRefunded); if(amount<=0)throw new BarRuleException("Estorno precisa ser positivo.");
        var expected = checked((long)((amount + previouslyRefunded) * 100));
        var current=await Get(orderId,ct);if(current.Refunded==expected)return current;
        if(current.Refunded!=checked((long)(previouslyRefunded*100)))throw new BarRuleException("Estorno externo diverge do histórico. Concilie antes de continuar.");
        if(!ChargePattern().IsMatch(current.ChargeId))throw new BarRuleException("Identificador da cobrança inválido.");
        using var request=new HttpRequestMessage(HttpMethod.Post,"charges/"+current.ChargeId+"/cancel"){Content=JsonContent.Create(new {amount=new {value=checked((long)(amount*100))}})};
        request.Headers.Add("x-idempotency-key",operationId.ToString());
        using var response=await http.SendAsync(request,ct);
        var confirmed=await Get(orderId,ct);
        if(confirmed.Refunded!=expected)throw new BarRuleException("Estorno PagBank ainda não confirmado. Consulte antes de repetir.");
        return confirmed;
    }
    public bool VerifyWebhook(byte[] body,IEnumerable<string> signatures) => Verify(body,signatures,config["Payments:PagBank:WebhookPublicKey"]);
    private readonly PagBankWebhookKeys keyCache=keys??new();
    public async Task<bool> VerifyWebhookAsync(byte[] body,IEnumerable<string> signatures,CancellationToken ct)
    {
        var values=signatures.ToArray();if(values.Length==0||values.All(string.IsNullOrWhiteSpace))return false;
        if(!config.GetValue("Payments:PagBank:RefreshWebhookKeys",false))return VerifyWebhook(body,values);
        Configure();var identity=http.BaseAddress+":"+Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(config["Payments:PagBank:Token"]!)));
        var entry=keyCache.For(identity);await entry.Gate.WaitAsync(ct);
        try
        {
            var now=DateTimeOffset.UtcNow;
            if(now>=entry.NextRefresh)
            {
                entry.NextRefresh=now.AddMinutes(5);
                try
                {
                    using var response=await http.GetAsync("public-keys?type=webhook",ct);response.EnsureSuccessStatusCode();
                    using var json=JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));var key=json.RootElement.GetProperty("public_key").GetString()!;
                    using var ec=ECDsa.Create();ec.ImportSubjectPublicKeyInfo(Convert.FromBase64String(key),out _);
                    if(entry.Current!=key){entry.Previous=entry.Current;entry.PreviousUntil=now.AddDays(7);entry.Current=key;}
                }
                catch(Exception e)when(!ct.IsCancellationRequested&&e is HttpRequestException or TaskCanceledException or JsonException or CryptographicException or FormatException){/* Keep last trusted key on network failure. */}
            }
            return Verify(body,values,entry.Current)||(now<entry.PreviousUntil&&Verify(body,values,entry.Previous))||(entry.Current==null&&VerifyWebhook(body,values));
        }
        finally {entry.Gate.Release();}
    }
    private static bool Verify(byte[] body,IEnumerable<string> signatures,string? key)
    {
        if(string.IsNullOrWhiteSpace(key))return false;
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
