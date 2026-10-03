using System.Text.Json;
using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.Api.Endpoints;

public static class OperationalEndpoints
{
    private static readonly HashSet<string> Kinds = ["students", "team", "inventory", "projects"];

    public static IEndpointRouteBuilder MapOperationalEndpoints(this IEndpointRouteBuilder endpoints, bool publicDemo)
    {
        var group = endpoints.MapGroup("/api/v1/operations/{kind}").WithTags("Operations");
        if (publicDemo) group.AllowAnonymous();

        group.MapGet("/", async (string kind, LongBeachDbContext db, CancellationToken ct) =>
        {
            if (!Kinds.Contains(kind)) return Results.NotFound();
            var payloads = await db.OperationalRecords.AsNoTracking().Where(item => item.Kind == kind)
                .OrderBy(item => item.Name).Select(item => item.Payload).ToListAsync(ct);
            return Results.Content($"[{string.Join(',', payloads)}]", "application/json");
        });

        group.MapPut("/{id:guid}", async (string kind, Guid id, JsonElement body, HttpContext http, LongBeachDbContext db, CancellationToken ct) =>
        {
            if (!Kinds.Contains(kind)) return Results.NotFound();
            if (body.ValueKind != JsonValueKind.Object || EncodingLength(body) > 32_768)
                return Results.BadRequest(new { message = "O registro deve ser um objeto de até 32 KB." });
            if (!body.TryGetProperty("id", out var idValue) || idValue.ValueKind != JsonValueKind.String ||
                !Guid.TryParse(idValue.GetString(), out var payloadId) || payloadId != id)
                return Results.BadRequest(new { message = "O identificador do registro não corresponde à rota." });
            if (!body.TryGetProperty("name", out var nameValue) || nameValue.ValueKind != JsonValueKind.String)
                return Results.BadRequest(new { message = "O nome é obrigatório." });
            var name = nameValue.GetString()?.Trim();
            if (string.IsNullOrWhiteSpace(name) || name.Length > 240)
                return Results.BadRequest(new { message = "O nome deve ter entre 1 e 240 caracteres." });

            var json = body.GetRawText();
            var record = await db.OperationalRecords.SingleOrDefaultAsync(item => item.Id == id && item.Kind == kind, ct);
            if (record is null)
            {
                db.OperationalRecords.Add(new OperationalRecord(id, kind, name, json));
                http.Items["OperationalAction"] = "create";
            }
            else
            {
                record.Update(name, json);
                http.Items["OperationalAction"] = "update";
            }
            await db.SaveChangesAsync(ct);
            return Results.Content(json, "application/json", statusCode: record is null ? 201 : 200);
        }).RequireRateLimiting("public-demo-write");

        return endpoints;
    }

    private static int EncodingLength(JsonElement body) => System.Text.Encoding.UTF8.GetByteCount(body.GetRawText());
}
