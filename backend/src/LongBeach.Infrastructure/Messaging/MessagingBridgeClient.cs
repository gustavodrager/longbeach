using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using LongBeach.Application.Messaging;
using LongBeach.Contracts.Messaging;
using LongBeach.Domain.Messaging;
using Microsoft.Extensions.Configuration;
namespace LongBeach.Infrastructure.Messaging;

public sealed class MessagingBridgeClient(HttpClient http,IConfiguration configuration) : IMessagingBridge
{
    private bool Configured=>Uri.TryCreate(configuration["Messaging:BridgeUrl"],UriKind.Absolute,out var uri)&&uri.Scheme is "http" or "https"&&configuration["Messaging:BridgeSecret"] is {Length:>=32};
    private HttpRequestMessage Request(HttpMethod method,string path,object? body=null)
    {
        if(!Configured)throw new MessagingRuleException("A conexão do WhatsApp ainda não está configurada.",503);
        var request=new HttpRequestMessage(method,configuration["Messaging:BridgeUrl"]!.TrimEnd('/')+path);request.Headers.Authorization=new AuthenticationHeaderValue("Bearer",configuration["Messaging:BridgeSecret"]);
        if(body is not null)request.Content=JsonContent.Create(body);return request;
    }
    public async Task<BridgeStatusDto> StatusAsync(CancellationToken ct)
    {
        if(!Configured)return new("NotConfigured",Detail:"Conexão ainda não configurada.");
        try{using var request=Request(HttpMethod.Get,"/v1/status");using var response=await http.SendAsync(request,ct);if(!response.IsSuccessStatusCode)return new("Disconnected",Detail:"Não foi possível consultar a conexão.");return await response.Content.ReadFromJsonAsync<BridgeStatusDto>(ct)??new("Disconnected");}
        catch(Exception e)when(e is HttpRequestException or TaskCanceledException){if(ct.IsCancellationRequested)throw;return new("Disconnected",Detail:"A conexão com o WhatsApp está indisponível.");}
    }
    private async Task<BridgeStatusDto> Command(string path,CancellationToken ct)
    {using var request=Request(HttpMethod.Post,path);using var response=await http.SendAsync(request,ct);if(!response.IsSuccessStatusCode)throw new MessagingRuleException("Não foi possível atualizar a conexão do WhatsApp.",503);return await response.Content.ReadFromJsonAsync<BridgeStatusDto>(ct)??new("Disconnected");}
    public Task<BridgeStatusDto> PairAsync(CancellationToken ct)=>Command("/v1/pair",ct);
    public Task<BridgeStatusDto> ReconnectAsync(CancellationToken ct)=>Command("/v1/reconnect",ct);
    public async Task<BridgeSendResult> SendAsync(BridgeSendRequest input,CancellationToken ct)
    {using var request=Request(HttpMethod.Post,"/v1/messages",input);using var response=await http.SendAsync(request,ct);if(!response.IsSuccessStatusCode)return new(input.MessageId,"Uncertain","O resultado do envio ainda não foi confirmado.");return await response.Content.ReadFromJsonAsync<BridgeSendResult>(ct)??new(input.MessageId,"Uncertain");}
    public async Task<BridgeSendResult?> FindAsync(Guid operationId,CancellationToken ct)
    {using var request=Request(HttpMethod.Get,$"/v1/messages/{operationId}");using var response=await http.SendAsync(request,ct);if(response.StatusCode==HttpStatusCode.NotFound)return null;if(!response.IsSuccessStatusCode)throw new MessagingRuleException("Não foi possível conferir o envio.",503);return await response.Content.ReadFromJsonAsync<BridgeSendResult>(ct);}
}
