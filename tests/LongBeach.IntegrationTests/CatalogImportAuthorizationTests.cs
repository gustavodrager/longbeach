using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace LongBeach.IntegrationTests;

public sealed class CatalogImportAuthorizationTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Catalog_import_requires_owner_before_any_database_access(bool apply)
    {
        await using var factory = new LongBeachWebApplicationFactory(); using var client = factory.CreateClient();
        var path = "/api/v1/imports/00000000-0000-0000-0000-000000000001/bar-catalog" + (apply ? "/apply" : "");
        async Task<HttpResponseMessage> Request() => apply
            ? await client.PostAsync(path, new StringContent("{\"confirmationToken\":\"test\"}", Encoding.UTF8, "application/json"))
            : await client.GetAsync(path);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Request()).StatusCode);
        var credentials = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes("integration-tests-only-signing-key-with-more-than-32-characters")), SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken("LongBeach.Tests", "LongBeach.Tests.Client", [new Claim("sub", Guid.NewGuid().ToString()), new Claim(ClaimTypes.Role, "Operations")], DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(5), credentials);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", new JwtSecurityTokenHandler().WriteToken(token));
        Assert.Equal(HttpStatusCode.Forbidden, (await Request()).StatusCode);
    }
}
