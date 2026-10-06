using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using LongBeach.Application.Abstractions;
using LongBeach.Application.Auth;
using LongBeach.Domain.Identity;
using LongBeach.Infrastructure.Bootstrap;
using LongBeach.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace LongBeach.IntegrationTests;

public sealed class FirstAccessApiTests
{
    private const string Initial = "test-initial-credential";
    private static readonly SymmetricSecurityKey GoogleTestKey = new(Encoding.UTF8.GetBytes("test-google-signing-key-with-more-than-32-characters"));

    [PostgresFact] public async Task Password_login_works_with_Google_enabled_but_setup_cannot_read_or_write_arena_data()
    {
        await using var factory = Factory(); using var client = factory.CreateClient();
        var (username,id) = await Provision(factory);
        var session = await Login(client, username.ToUpperInvariant(), Initial);
        Assert.True(session.GetProperty("user").GetProperty("requiresFirstAccess").GetBoolean());
        var token = session.GetProperty("accessToken").GetString(); client.DefaultRequestHeaders.Authorization = new("Bearer",token);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/operations/students")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/financial-history/arena-summary")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync($"/api/v1/operations/courts/{Guid.NewGuid()}",new {name="Rejected"})).StatusCode);
        var changed = await client.PostAsJsonAsync("/api/v1/auth/change-password",new {currentPassword=Initial,newPassword="PermanentPassword2!"});
        Assert.Equal(HttpStatusCode.OK,changed.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,(await client.GetAsync("/api/v1/auth/me")).StatusCode);
        client.DefaultRequestHeaders.Authorization = null;
        Assert.Equal(HttpStatusCode.Unauthorized,(await client.PostAsJsonAsync("/api/v1/auth/login",new {email=username,password=Initial})).StatusCode);
        var full = await Login(client,username,"PermanentPassword2!");
        Assert.False(full.GetProperty("user").GetProperty("requiresFirstAccess").GetBoolean());
        Assert.Contains("Owner",full.GetProperty("user").GetProperty("roles").EnumerateArray().Select(x=>x.GetString()));
        client.DefaultRequestHeaders.Authorization = new("Bearer",full.GetProperty("accessToken").GetString());
        Assert.Equal(HttpStatusCode.OK,(await client.GetAsync("/api/v1/operations/students")).StatusCode);
        await using var scope=factory.Services.CreateAsyncScope(); var db=scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        var audits=await db.AuditLogs.Where(x=>x.ResourceId==id.ToString()).ToListAsync();
        Assert.NotEmpty(audits); Assert.All(audits,a=> { Assert.DoesNotContain(Initial,a.MetadataJson); Assert.DoesNotContain("PermanentPassword2!",a.MetadataJson); });
        Assert.Contains(audits,a=>a.MetadataJson.Contains("RequiresFirstAccess"));
    }

    [PostgresFact] public async Task Google_link_checks_both_tokens_then_allows_later_Google_login_without_global_allowlisting()
    {
        await using var factory=Factory(); using var client=factory.CreateClient(); var (username,id)=await Provision(factory);
        var session=await Login(client,username,Initial);
        var token=session.GetProperty("accessToken").GetString();
        var subject=Guid.NewGuid().ToString("N");var email=$"{subject}@example.test";
        client.DefaultRequestHeaders.Authorization=new("Bearer",token);
        async Task<HttpResponseMessage> Link(string? credential) {
            using var request=new HttpRequestMessage(HttpMethod.Post,"/api/v1/auth/first-access/google");
            if(credential is not null)request.Headers.Add("X-Google-Id-Token",credential);
            return await client.SendAsync(request);
        }
        Assert.Equal(HttpStatusCode.Unauthorized,(await Link(null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,(await Link(GoogleToken(subject,email,audience:"wrong-client"))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,(await Link(GoogleToken(subject,email,verified:false))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,(await Link(GoogleToken(subject,email,expired:true))).StatusCode);
        var linked=await Link(GoogleToken(subject,email)); Assert.Equal(HttpStatusCode.OK,linked.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,(await client.GetAsync("/api/v1/auth/me")).StatusCode);
        client.DefaultRequestHeaders.Authorization=new("Bearer",GoogleToken(subject,email));
        var signedIn=await client.PostAsync("/api/v1/auth/google",null); Assert.Equal(HttpStatusCode.OK,signedIn.StatusCode);
        var full=await signedIn.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(id,full.GetProperty("user").GetProperty("id").GetGuid());
        Assert.False(full.GetProperty("user").GetProperty("requiresFirstAccess").GetBoolean());
        await using var scope=factory.Services.CreateAsyncScope();
        var db=scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();var user=await db.Users.SingleAsync(x=>x.Id==id);
        Assert.Equal(subject,user.GoogleSubject);
        Assert.Equal(PasswordHashVerificationResult.Failed,scope.ServiceProvider.GetRequiredService<IPasswordHasher>().Verify(Initial,user.PasswordHash));
    }

    [PostgresFact] public async Task Repeated_provisioning_preserves_completed_credentials_and_duplicate_Google_binding_is_rejected()
    {
        await using var factory=Factory(); factory.CreateClient(); var (username,id)=await Provision(factory);
        await using var scope=factory.Services.CreateAsyncScope();var db=scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();var hasher=scope.ServiceProvider.GetRequiredService<IPasswordHasher>();
        var user=await db.Users.SingleAsync(x=>x.Id==id);user.ChangePasswordHash(hasher.Hash("PermanentPassword2!"));user.CompleteFirstAccess();await db.SaveChangesAsync();var hash=user.PasswordHash;
        var result=await new FirstAccessProvisioner(db,hasher,TimeProvider.System).RunAsync(ProvisionConfig(username));
        Assert.Equal((0,1),result);Assert.Equal(hash,user.PasswordHash);Assert.False(user.RequiresFirstAccess);
        user.LinkGoogle("unique-"+id,$"{id}@example.test");await db.SaveChangesAsync();
        var second=User.CreateForFirstAccess("Second", "second-"+Guid.NewGuid().ToString("N"),hasher.Hash(Initial),DateTimeOffset.UtcNow.AddDays(1));
        second.LinkGoogle(user.GoogleSubject!,"other@example.test");db.Users.Add(second);
        await Assert.ThrowsAsync<DbUpdateException>(()=>db.SaveChangesAsync());
    }

    private static WebApplicationFactory<Program> Factory()
    {
        // Program registers authentication before WebApplicationFactory's late config callback.
        // Tests in this assembly are serialized; restore process variables immediately after startup.
        var settings=new Dictionary<string,string> { ["Authentication__Google__Enabled"]="true",["Authentication__Google__ClientId"]="test-client",["Authentication__Google__AllowedEmail"]="existing@example.test" };
        var previous=settings.ToDictionary(x=>x.Key,x=>Environment.GetEnvironmentVariable(x.Key));
        try
        {
            foreach(var setting in settings)Environment.SetEnvironmentVariable(setting.Key,setting.Value);
            var factory=BuildFactory(); using var client=factory.CreateClient(); return factory;
        }
        finally { foreach(var setting in previous)Environment.SetEnvironmentVariable(setting.Key,setting.Value); }
    }

    private static WebApplicationFactory<Program> BuildFactory()=>OperationalPostgresTests.Factory().WithWebHostBuilder(builder=>builder
        .ConfigureAppConfiguration((_,c)=>c.AddInMemoryCollection(new Dictionary<string,string?> { ["Authentication:Google:Enabled"]="true",["Authentication:Google:ClientId"]="test-client",["Authentication:Google:AllowedEmail"]="existing@example.test" }))
        .ConfigureServices(services=> {
            services.AddScoped<IAuthService,AuthService>();
            services.PostConfigure<JwtBearerOptions>("Google",options=> {
                options.Configuration=new OpenIdConnectConfiguration { Issuer="https://accounts.google.com" };
                options.Configuration.SigningKeys.Add(GoogleTestKey);
                options.ConfigurationManager=new Microsoft.IdentityModel.Protocols.StaticConfigurationManager<OpenIdConnectConfiguration>(options.Configuration);
                options.TokenValidationParameters.ValidAlgorithms=[SecurityAlgorithms.HmacSha256];
            });
        }));

    private static async Task<(string,Guid)> Provision(WebApplicationFactory<Program> factory)
    {
        await OperationalPostgresTests.Migrate(factory);
        await using var scope=factory.Services.CreateAsyncScope();var db=scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        if(!await db.Roles.AnyAsync(x=>x.Name=="Owner")){ db.Roles.Add(new Role("Owner"));await db.SaveChangesAsync(); }
        var username="test-"+Guid.NewGuid().ToString("N");
        var result=await new FirstAccessProvisioner(db,scope.ServiceProvider.GetRequiredService<IPasswordHasher>(),TimeProvider.System).RunAsync(ProvisionConfig(username));
        Assert.Equal((1,0),result);
        return (username,(await db.Users.SingleAsync(x=>x.Username==username)).Id);
    }
    private static IConfiguration ProvisionConfig(string username)=>new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> {
        ["Bootstrap:FirstAccess:TemporaryPassword"]=Initial,["Bootstrap:FirstAccess:ExpiresAtUtc"]=DateTimeOffset.UtcNow.AddDays(1).ToString("O"),
        ["Bootstrap:FirstAccess:Accounts:0:Name"]=username,["Bootstrap:FirstAccess:Accounts:0:Username"]=username,["Bootstrap:FirstAccess:Accounts:0:Role"]="Owner"
    }).Build();
    private static async Task<JsonElement> Login(HttpClient client,string username,string password)
    {
        var response=await client.PostAsJsonAsync("/api/v1/auth/login",new {email=username,password});
        Assert.Equal(HttpStatusCode.OK,response.StatusCode);return await response.Content.ReadFromJsonAsync<JsonElement>();
    }
    private static string GoogleToken(string subject,string email,string audience="test-client",bool verified=true,bool expired=false)=>
        new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken("https://accounts.google.com",audience,
            [new Claim("sub",subject),new Claim("email",email),new Claim("email_verified",verified?"true":"false",ClaimValueTypes.Boolean)],
            DateTime.UtcNow.AddHours(-1),DateTime.UtcNow.AddMinutes(expired?-5:5),new SigningCredentials(GoogleTestKey,SecurityAlgorithms.HmacSha256)));
}
