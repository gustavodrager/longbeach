using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using LongBeach.Application.Messaging;
using LongBeach.Contracts.Messaging;
using LongBeach.Domain.Identity;
using LongBeach.Domain.Messaging;
using Microsoft.AspNetCore.Mvc;
namespace LongBeach.Api.Endpoints;

public static class MessagingEndpoints
{
    private static Guid Actor(HttpContext h)=>Guid.TryParse(h.User.FindFirstValue(ClaimTypes.NameIdentifier)??h.User.FindFirstValue("sub"),out var id)?id:throw new MessagingRuleException("Entre novamente para continuar.",401);
    public static IEndpointRouteBuilder MapMessagingEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var g=endpoints.MapGroup("/api/v1/messaging").WithTags("WhatsApp da arena").RequireAuthorization(SystemPermissions.MessagingRead);
        g.MapGet("/conversations",(string? search,string? status,string? mode,int? page,int? pageSize,IMessaging s,CancellationToken ct)=>s.ConversationsAsync(search,status,mode,page??1,pageSize??20,ct));
        g.MapGet("/conversations/{id:guid}",(Guid id,IMessaging s,CancellationToken ct)=>s.ConversationAsync(id,ct));
        g.MapPost("/conversations",(CreateConversationInput i,HttpContext h,IMessaging s,CancellationToken ct)=>s.CreateConversationAsync(i,Actor(h),ct)).RequireAuthorization(SystemPermissions.MessagingOperate);
        foreach(var action in new[]{"assume","resume-bot","complete","read"})
        {var current=action;g.MapPost($"/conversations/{{id:guid}}/{current}",(Guid id,ConversationActionInput i,HttpContext h,IMessaging s,CancellationToken ct)=>s.ActionAsync(id,current,i,Actor(h),ct)).RequireAuthorization(SystemPermissions.MessagingOperate);}
        g.MapPut("/conversations/{id:guid}/contact",(Guid id,ContactLinkInput i,HttpContext h,IMessaging s,CancellationToken ct)=>s.LinkAsync(id,i,Actor(h),ct)).RequireAuthorization(SystemPermissions.MessagingManage);
        g.MapGet("/conversations/{id:guid}/messages",(Guid id,string? before,int? limit,IMessaging s,CancellationToken ct)=>s.MessagesAsync(id,before,limit??50,ct));
        g.MapPost("/conversations/{id:guid}/messages",(Guid id,SendMessageInput i,HttpContext h,IMessaging s,CancellationToken ct)=>s.SendAsync(id,i,Actor(h),ct)).RequireAuthorization(SystemPermissions.MessagingOperate);
        g.MapGet("/operations/{operationId:guid}",(Guid operationId,IMessaging s,CancellationToken ct)=>s.OperationAsync(operationId,ct));
        g.MapGet("/sends",(string? state,int? page,int? pageSize,IMessaging s,CancellationToken ct)=>s.SendsAsync(state,page??1,pageSize??20,ct));
        g.MapPost("/messages/{id:guid}/cancel",(Guid id,CancelMessageInput i,HttpContext h,IMessaging s,CancellationToken ct)=>s.CancelAsync(id,i,Actor(h),ct)).RequireAuthorization(SystemPermissions.MessagingOperate);
        g.MapPost("/attachments",async(HttpContext h,IMessaging s,CancellationToken ct)=>
        {
            if(!h.Request.HasFormContentType)return Results.BadRequest(new{message="Selecione um arquivo."});
            var form=await h.Request.ReadFormAsync(new Microsoft.AspNetCore.Http.Features.FormOptions{MultipartBodyLengthLimit=MessagingRules.MaxAttachmentBytes,ValueLengthLimit=1024},ct);var file=form.Files.GetFile("file");
            if(file is null||file.Length==0||file.Length>MessagingRules.MaxAttachmentBytes)return Results.BadRequest(new{message="Selecione uma imagem PNG/JPEG ou PDF de até 10 MB."});
            using var output=new MemoryStream();await file.CopyToAsync(output,ct);return Results.Ok(await s.UploadAsync(output.ToArray(),file.FileName,file.ContentType,Actor(h),ct));
        }).RequireAuthorization(SystemPermissions.MessagingOperate).DisableAntiforgery().WithMetadata(new RequestSizeLimitAttribute(11*1024*1024));
        g.MapGet("/attachments/{id:guid}",async(Guid id,HttpContext h,IMessaging s,CancellationToken ct)=>
        {var file=await s.DownloadAsync(id,ct);h.Response.Headers["X-Content-Type-Options"]="nosniff";return Results.File(file.Data,file.ContentType,file.FileName);});
        g.MapGet("/settings",(IMessaging s,CancellationToken ct)=>s.SettingsAsync(ct));
        g.MapPut("/settings",(SaveMessagingSettingsInput i,IMessaging s,CancellationToken ct)=>s.SaveSettingsAsync(i,ct)).RequireAuthorization(SystemPermissions.MessagingManage);
        g.MapGet("/faqs",(IMessaging s,CancellationToken ct)=>s.FaqsAsync(ct));
        g.MapPost("/faqs",(SaveFaqInput i,IMessaging s,CancellationToken ct)=>s.SaveFaqAsync(null,i,ct)).RequireAuthorization(SystemPermissions.MessagingManage);
        g.MapPut("/faqs/{id:guid}",(Guid id,SaveFaqInput i,IMessaging s,CancellationToken ct)=>s.SaveFaqAsync(id,i,ct)).RequireAuthorization(SystemPermissions.MessagingManage);
        g.MapDelete("/faqs/{id:guid}",async(Guid id,int expectedVersion,IMessaging s,CancellationToken ct)=>{await s.DeleteFaqAsync(id,expectedVersion,ct);return Results.NoContent();}).RequireAuthorization(SystemPermissions.MessagingManage);
        g.MapGet("/connection",async(HttpContext h,IMessagingBridge b,CancellationToken ct)=>
        {var result=await b.StatusAsync(ct);return h.User.HasClaim("permission",SystemPermissions.MessagingManage)?result:result with{QrCode=null,AccountId=null};});
        g.MapPost("/connection/pair",(IMessagingBridge b,CancellationToken ct)=>b.PairAsync(ct)).RequireAuthorization(SystemPermissions.MessagingManage);
        g.MapPost("/connection/reconnect",(IMessagingBridge b,CancellationToken ct)=>b.ReconnectAsync(ct)).RequireAuthorization(SystemPermissions.MessagingManage);
        endpoints.MapPost("/api/v1/messaging/bridge/events",async(HttpContext h,IConfiguration cfg,IMessaging s,CancellationToken ct)=>
        {
            var expected=cfg["Messaging:BridgeSecret"];var header=h.Request.Headers.Authorization.ToString();
            if(expected is not {Length:>=32}||!header.StartsWith("Bearer ",StringComparison.Ordinal)||!CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(header[7..]),Encoding.UTF8.GetBytes(expected)))return Results.Unauthorized();
            if(h.Request.ContentLength>15*1024*1024)return Results.StatusCode(413);
            using var body=new MemoryStream();var buffer=new byte[81920];int count;
            while((count=await h.Request.Body.ReadAsync(buffer,ct))>0){if(body.Length+count>15*1024*1024)return Results.StatusCode(413);await body.WriteAsync(buffer.AsMemory(0,count),ct);}
            body.Position=0;BridgeEvent? input;try{input=await System.Text.Json.JsonSerializer.DeserializeAsync<BridgeEvent>(body,new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web),ct);}catch(System.Text.Json.JsonException){return Results.BadRequest();}
            if(input is null)return Results.BadRequest();await s.IngestAsync(input,ct);return Results.Accepted();
        }).AllowAnonymous().WithMetadata(new RequestSizeLimitAttribute(15*1024*1024));
        return endpoints;
    }
}
