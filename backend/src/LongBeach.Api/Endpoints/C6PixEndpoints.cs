using System.Text.Json;
using LongBeach.Application.Billing;

namespace LongBeach.Api.Endpoints;

public static class C6PixEndpoints
{
    public static IEndpointRouteBuilder MapC6PixEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/api/v1/integrations/c6/pix/webhook", async (HttpContext http, IBilling billing, CancellationToken ct) =>
        {
            const int limit = 65536;
            if (http.Request.ContentLength > limit) return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
            using var body = new MemoryStream();
            var buffer = new byte[8192];
            int read;
            while ((read = await http.Request.Body.ReadAsync(buffer, ct)) > 0)
            {
                if (body.Length + read > limit) return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
                body.Write(buffer, 0, read);
            }
            try { await billing.C6PixNotification(body.ToArray(), ct); }
            catch (JsonException) { return Results.BadRequest(); }
            return Results.Accepted();
        }).AllowAnonymous().RequireRateLimiting("c6-webhook").WithTags("C6");
        return endpoints;
    }
}
