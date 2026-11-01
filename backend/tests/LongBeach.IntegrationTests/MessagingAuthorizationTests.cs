using System.Net;
using System.Net.Http.Json;
using LongBeach.Application.Messaging;
using LongBeach.Contracts.Messaging;
using Microsoft.Extensions.DependencyInjection;

namespace LongBeach.IntegrationTests;

public sealed class MessagingAuthorizationTests
{
    [Theory]
    [InlineData("Teacher")][InlineData("Student")]
    public async Task Client_and_teacher_cannot_read_or_write_the_arena_inbox(string role)
    {
        await using var factory=new LongBeachWebApplicationFactory();using var client=factory.CreateClient();client.DefaultRequestHeaders.Authorization=new("Bearer",ProfileAuthorizationTests.Token(Guid.NewGuid(),[role]));
        Assert.Equal(HttpStatusCode.Forbidden,(await client.GetAsync("/api/v1/messaging/conversations")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await client.GetAsync($"/api/v1/messaging/attachments/{Guid.NewGuid()}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await client.PostAsJsonAsync("/api/v1/messaging/conversations",new CreateConversationInput(Guid.NewGuid(),Guid.NewGuid()))).StatusCode);
    }
    [Fact]
    public async Task Attendant_operates_but_cannot_change_identity_automation_or_connection()
    {
        await using var factory=new LongBeachWebApplicationFactory();using var client=factory.CreateClient();client.DefaultRequestHeaders.Authorization=new("Bearer",ProfileAuthorizationTests.Token(Guid.NewGuid(),["Operations"]));
        Assert.Equal(HttpStatusCode.Forbidden,(await client.PutAsJsonAsync($"/api/v1/messaging/conversations/{Guid.NewGuid()}/contact",new ContactLinkInput(Guid.NewGuid(),1,null,false,false))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await client.PutAsJsonAsync("/api/v1/messaging/settings",new SaveMessagingSettingsInput(0,true,true,true,"18:00"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await client.PostAsync("/api/v1/messaging/connection/pair",null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await client.PostAsJsonAsync("/api/v1/messaging/faqs",new SaveFaqInput("Pergunta","Resposta",true))).StatusCode);
    }
    [Fact]
    public async Task Pairing_qr_is_visible_only_to_manager_and_bridge_requires_its_own_authentication()
    {
        await using var factory=new LongBeachWebApplicationFactory().WithWebHostBuilder(b=>b.ConfigureServices(s=>s.AddSingleton<IMessagingBridge>(new StatusBridge())));using var client=factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,(await client.GetAsync("/api/v1/messaging/connection")).StatusCode);
        client.DefaultRequestHeaders.Authorization=new("Bearer",ProfileAuthorizationTests.Token(Guid.NewGuid(),["Operations"]));var attendant=await client.GetFromJsonAsync<BridgeStatusDto>("/api/v1/messaging/connection");Assert.Null(attendant!.QrCode);Assert.Null(attendant.AccountId);
        client.DefaultRequestHeaders.Authorization=new("Bearer",ProfileAuthorizationTests.Token(Guid.NewGuid(),["Manager"]));var manager=await client.GetFromJsonAsync<BridgeStatusDto>("/api/v1/messaging/connection");Assert.Equal("synthetic-qr",manager!.QrCode);
        Assert.Equal(HttpStatusCode.Unauthorized,(await client.PostAsJsonAsync("/api/v1/messaging/bridge/events",new BridgeEvent("event","connection"))).StatusCode);
    }
    private sealed class StatusBridge:IMessagingBridge
    {
        public Task<BridgeStatusDto> StatusAsync(CancellationToken ct)=>Task.FromResult(new BridgeStatusDto("Pairing","synthetic-account",QrCode:"synthetic-qr"));
        public Task<BridgeStatusDto> PairAsync(CancellationToken ct)=>StatusAsync(ct);public Task<BridgeStatusDto> ReconnectAsync(CancellationToken ct)=>StatusAsync(ct);
        public Task<BridgeSendResult> SendAsync(BridgeSendRequest input,CancellationToken ct)=>throw new InvalidOperationException("No real sends in authorization tests.");
        public Task<BridgeSendResult?> FindAsync(Guid operationId,CancellationToken ct)=>Task.FromResult<BridgeSendResult?>(null);
    }
}
