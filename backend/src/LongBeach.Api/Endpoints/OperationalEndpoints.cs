using System.Data;
using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;
using LongBeach.Application.Operations;
using LongBeach.Application.Customers;
using LongBeach.Infrastructure.Customers;
using LongBeach.Contracts.Operations;
using LongBeach.Domain.Identity;
using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.Api.Endpoints;

public static class OperationalEndpoints
{
    public static IEndpointRouteBuilder MapOperationalEndpoints(this IEndpointRouteBuilder endpoints, bool publicDemo)
    {
        var group = endpoints.MapGroup("/api/v1/operations/{kind}").WithTags("Operations");
        // Existing public demos may access only their four original fictional modules.
        // New arena records always require an individual authenticated account.
        if (publicDemo) group.AllowAnonymous();
        else group.RequireAuthorization();

        group.MapGet("/", async (string kind, HttpContext http, LongBeachDbContext db, ICustomerRegistry customers, CancellationToken ct) =>
        {
            if (!OperationalValidation.Permissions.ContainsKey(kind)) return Results.NotFound();
            if (!Allowed(http, kind, false, publicDemo)) return Denied(http);
            var rows = await db.OperationalRecords.AsNoTracking().Where(item => item.Kind == kind)
                .OrderBy(item => item.Name).Select(item => new { item.Id, item.Payload }).ToListAsync(ct);
            var payloads = new List<string>();
            foreach (var row in rows)
                payloads.Add(StaffDependencyPayload(VisiblePayload(publicDemo ? row.Payload : await CustomerOperationalRecords.ProjectAsync(customers, kind, row.Id, row.Payload, ct), kind, http, publicDemo), kind, http));
            return Results.Content($"[{string.Join(',', payloads)}]", "application/json");
        });

        group.MapGet("/schedule", async (string kind, string? date, HttpContext http, LongBeachDbContext db, CancellationToken ct) =>
        {
            if (kind != "courts") return Results.NotFound();
            if (!Allowed(http, kind, false, publicDemo)) return Denied(http);
            if (!DateOnly.TryParseExact(date, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var day))
                return Results.BadRequest(new { message = "Informe a data da agenda no formato ano-mês-dia." });
            var records = await LongBeach.Infrastructure.Operations.CourtScheduleRecords.Load(db, day, ct);
            var snapshot = records.GroupBy(row => row.Kind).ToDictionary(grouping => grouping.Key,
                grouping => grouping.Select(row => ParsePayload(row.Payload)).ToArray());
            return Results.Ok(CourtScheduleQuery.Build(day, DateTimeOffset.UtcNow, snapshot, Allowed(http, "classes", false, publicDemo)));
        });

        group.MapGet("/schedule-range", async (string kind, string? from, string? to, HttpContext http, LongBeachDbContext db, CancellationToken ct) =>
        {
            if (kind != "courts") return Results.NotFound();
            if (!Allowed(http, kind, false, publicDemo)) return Denied(http);
            if (!DateOnly.TryParseExact(from, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var first)
                || !DateOnly.TryParseExact(to, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var last)
                || last < first || last.DayNumber - first.DayNumber >= CourtScheduleQuery.MaximumRangeDays)
                return Results.BadRequest(new { message = "Escolha um período válido de até 366 dias, incluindo a data inicial e final." });
            var records = await LongBeach.Infrastructure.Operations.CourtScheduleRecords.Load(db, first, last, ct);
            var snapshot = records.GroupBy(row => row.Kind).ToDictionary(grouping => grouping.Key,
                grouping => grouping.Select(row => ParsePayload(row.Payload)).ToArray());
            return Results.Ok(CourtScheduleQuery.BuildRange(first, last, DateTimeOffset.UtcNow, snapshot, Allowed(http, "classes", false, publicDemo)));
        });

        group.MapPost("/recurring", (string kind, RecurringReservationInput input, HttpContext http, LongBeachDbContext db, ICustomerRegistry customers, CancellationToken ct) =>
            SaveRecurring(kind, input, http, db, customers, publicDemo, ct)).RequireRateLimiting("public-demo-write");

        group.MapPut("/{id:guid}", async (string kind, Guid id, JsonElement body, HttpContext http, LongBeachDbContext db, ICustomerRegistry customers, CancellationToken ct) =>
        {
            if (!OperationalValidation.Permissions.ContainsKey(kind)) return Results.NotFound();
            if (!Allowed(http, kind, true, publicDemo)) return Denied(http);
            if (body.ValueKind != JsonValueKind.Object || System.Text.Encoding.UTF8.GetByteCount(body.GetRawText()) > 32_768)
                return Results.BadRequest(new { message = "O registro deve ser um objeto de até 32 KB." });
            if (kind == "team" && StaffRecordFields.HasAccessFields(body))
                return Results.BadRequest(new { message = "Use a seção de acesso da Equipe para administrar a conta." });
            if (kind == "reservations" && OperationalValidation.Text(body, "activityKind") == "SingleLesson" &&
                (!Guid.TryParse(OperationalValidation.Text(body, "customerId"), out var lessonCustomerId) || lessonCustomerId == Guid.Empty))
                return Results.BadRequest(new { message = "Escolha um cliente cadastrado para a aula avulsa." });

            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct);
            // Serialize arena writes across replicas: shared capacity and duplicate enrollment
            // checks must remain true even when two attendants save at the same time.
            await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(724031904)", ct);
            var records = await db.OperationalRecords.ToListAsync(ct);
            var snapshot = records.GroupBy(row => row.Kind).ToDictionary(grouping => grouping.Key,
                grouping => grouping.Select(row => ParsePayload(row.Payload)).ToArray());
            if (records.Any(row => row.Id == id && row.Kind != kind)) return Results.Conflict(new { message = "Este identificador já pertence a outra área." });
            var record = records.SingleOrDefault(row => row.Id == id && row.Kind == kind);
            if (kind == "team" && await db.Set<StaffMembership>().AnyAsync(member => member.TeamId == id, ct))
                return Results.Conflict(new { message = "Esta pessoa possui conta de acesso. Atualize a ficha e a conta juntas na Equipe." });
            if (kind == "classes" && record is null)
            {
                // Stale operational forms, including legacy version-zero forms, must
                // never recreate a class after its removal.
                var deletions = await db.AuditLogs.AsNoTracking()
                    .Where(row => row.Resource == nameof(OperationalRecord) && row.ResourceId == id.ToString() && row.Action == "Deleted")
                    .Select(row => row.MetadataJson).ToListAsync(ct);
                if (deletions.Any(json => OperationalValidation.Text(ParsePayload(json), "Kind") == "classes"))
                    return Results.Conflict(new { message = "Esta turma foi excluída. Atualize a página; para cadastrar outra turma, use Nova turma." });
            }
            if (kind == "financeEntries" && (LongBeach.Application.Finance.ExpenseRules.Reserved(body) ||
                record is not null && LongBeach.Application.Finance.ExpenseRules.Managed(ParsePayload(record.Payload))))
                return Results.Conflict(new { message = "Este lançamento é controlado em Despesas e pagamentos. Abra essa área para consultar ou registrar pagamentos." });
            var prepared = OperationalRecordAccess.PrepareWrite(body.GetRawText(), record?.Payload, kind,
                CanFinance(http, false, publicDemo, kind), CanFinance(http, true, publicDemo, kind));
            if (!prepared.Allowed) return Results.Forbid();
            var incoming = prepared.Body;
            if (kind == "rentalGroups") RentalMusicPreferences.PreserveOmitted(incoming, record?.Payload);
            if (kind == "inventory")
            {
                // A movement may have advanced the material while its metadata form was open.
                // Report the stale version before treating the old balance as a forbidden stock edit.
                if (record is not null && OperationalValidation.Version(body) != OperationalValidation.Version(ParsePayload(record.Payload))
                    && LongBeach.Application.Inventory.MaterialRecordRules.Number(incoming, "quantity") != LongBeach.Application.Inventory.MaterialRecordRules.Number(JsonNode.Parse(record.Payload)!.AsObject(), "quantity"))
                    return Results.Conflict(new { message = "Este material mudou depois que você o abriu. Atualize os dados e confira a quantidade antes de salvar." });
                var completesMissingUnit = record is not null
                    && LongBeach.Application.Inventory.MaterialRecordRules.Text(JsonNode.Parse(record.Payload)!.AsObject(), "unit").Trim().Length == 0
                    && LongBeach.Application.Inventory.MaterialRecordRules.Text(incoming, "unit").Trim().Length > 0;
                var hasLedgerHistory = completesMissingUnit && await db.Set<LongBeach.Domain.Inventory.MaterialMovement>().AnyAsync(x => x.MaterialId == id, ct);
                LongBeach.Application.Inventory.MaterialRecordRules.GuardMetadata(incoming, record?.Payload, hasLedgerHistory);
            }
            if (kind == "financeEntries") LongBeach.Application.Finance.FinancialReceiptRules.PrepareWrite(incoming, record?.Payload);
            if (kind == "financeEntries") LongBeach.Application.Finance.BusinessAllocationRules.PreserveOmitted(incoming, record?.Payload);
            if (kind == "financeEntries") await LongBeach.Infrastructure.Billing.BillingWriteGuard.Check(db, id, incoming, record?.Payload, ct);
            if (kind == "reservations")
            {
                var metadataError = RecurringReservationBatch.ValidateMetadata(incoming, record?.Payload) ?? RentalGroupRules.ReservationMetadata(incoming, record?.Payload);
                if (metadataError is not null) return Results.BadRequest(new { message = metadataError });
                if (record is not null)
                {
                    var saved = ParsePayload(record.Payload);
                    var originalActivity = OperationalValidation.Text(saved, "activityKind");
                    var originalTeacher = OperationalValidation.Text(saved, "teacherId");
                    var schoolOrigin = originalActivity == "Trial" || originalActivity != "SingleLesson" && !string.IsNullOrEmpty(originalTeacher) ||
                        records.Where(row => row.Kind == "portalRequests").Select(row => ParsePayload(row.Payload)).Where(request => request.ValueKind == JsonValueKind.Object).Any(request =>
                            OperationalValidation.Text(request, "reservationId") == id.ToString() &&
                            (OperationalValidation.Text(request, "kind") == "Trial" || OperationalValidation.Text(request, "kind") == "Reschedule" &&
                             OperationalValidation.Text(request, "appointmentKey").StartsWith("class:", StringComparison.Ordinal)));
                    if (schoolOrigin && ((incoming["activityKind"]?.ToString() ?? "") != originalActivity ||
                        !string.IsNullOrEmpty(originalTeacher) && string.IsNullOrEmpty(incoming["teacherId"]?.ToString())))
                        return Results.BadRequest(new { message = "Preserve o tipo e o professor da aula experimental ou remarcada ao editar." });
                }
            }
            if (kind == "financeEntries" && record is not null)
            {
                var saved = ParsePayload(record.Payload);
                if (OperationalValidation.Text(saved, "sourceKind") == "rentalMonths" && new[] { "sourceKind", "sourceId", "month" }.Any(key => incoming[key]?.ToString() != OperationalValidation.Text(saved, key)))
                    return Results.BadRequest(new { message = "Preserve a origem e a competência da mensalidade. Cancele o lançamento para corrigir o acordo." });
            }
            if (!publicDemo)
                await CustomerOperationalRecords.PrepareWriteAsync(customers, kind, id, incoming, record?.Payload, ct,
                    allowReassignment: ProfileAccess.IsManagement(http.User.FindAll(ClaimTypes.Role).Select(x => x.Value)) && http.User.HasClaim("permission", SystemPermissions.CustomersMerge));
            body = JsonSerializer.SerializeToElement(incoming);
            var error = OperationalValidation.Validate(kind, id, body, snapshot, DateOnly.FromDateTime(DateTime.UtcNow.AddHours(-3)));
            if (error is not null) return Results.BadRequest(new { message = error });
            // All courts operate daily. Preserve legacy records until an authorized edit,
            // then store the compatibility field consistently, after validating its shape.
            if (kind == "courts") incoming["operatingDays"] = new JsonArray(0, 1, 2, 3, 4, 5, 6);
            if (!publicDemo) await CustomerSchoolIdentityGuard.CheckAsync(db, customers, kind, id, body, records, ct);
            var currentBody = record is null ? default : ParsePayload(record.Payload);
            var currentVersion = record is null ? 0 : OperationalValidation.Version(currentBody);
            incoming["name"] = OperationalValidation.Text(body, "name").Trim();
            incoming.Remove("version");
            if (record is not null)
            {
                var current = JsonNode.Parse(record.Payload)!.AsObject(); current.Remove("version");
                if (JsonNode.DeepEquals(incoming, current)) return Results.Content(VisiblePayload(record.Payload, kind, http, publicDemo), "application/json");
                if (OperationalValidation.Version(body) != currentVersion)
                    return Results.Conflict(new { message = "Este cadastro mudou depois que você o abriu. Atualize os dados e confira as alterações antes de salvar." });
            }
            else if (OperationalValidation.Version(body) != 0) return Results.Conflict(new { message = "A versão inicial do cadastro é inválida." });
            incoming["version"] = checked(currentVersion + 1);
            var json = incoming.ToJsonString();
            var name = incoming["name"]!.GetValue<string>();
            if (record is null) db.OperationalRecords.Add(new OperationalRecord(id, kind, name, json));
            else record.Update(name, json);
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return Results.Content(VisiblePayload(json, kind, http, publicDemo), "application/json", statusCode: record is null ? 201 : 200);
        }).RequireRateLimiting("public-demo-write");

        group.MapDelete("/{id:guid}", async (string kind, Guid id, int? version, HttpContext http, LongBeachDbContext db, CancellationToken ct) =>
        {
            if (kind != "classes") return Results.NotFound();
            if (!Allowed(http, kind, true, publicDemo) || !ProfileAccess.IsManagement(http.User.FindAll(ClaimTypes.Role).Select(row => row.Value)))
                return Denied(http);
            if (version is null or < 0) return Results.BadRequest(new { message = "Informe a versão da turma antes de excluir." });

            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct);
            await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(724031904)", ct);
            var records = await db.OperationalRecords.ToListAsync(ct);
            var record = records.SingleOrDefault(row => row.Id == id && row.Kind == "classes");
            if (record is null) return Results.NotFound(new { message = "Turma não encontrada. Atualize a página." });
            var lesson = ParsePayload(record.Payload);
            if (OperationalValidation.Version(lesson) != version)
                return Results.Conflict(new { message = "Esta turma mudou depois que você a abriu. Atualize os dados antes de excluir." });
            var error = ClassDeletionRules.Validate(id, lesson, records.Select(row => ParsePayload(row.Payload)));
            if (error is not null) return Results.Conflict(new { message = error });

            db.OperationalRecords.Remove(record);
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return Results.NoContent();
        }).RequireAuthorization("Management").RequireRateLimiting("public-demo-write");

        return endpoints;
    }
    private sealed record ReservationGroupOperation(Guid Id, string Name, string Fingerprint, int Version, Guid[] ReservationIds);
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static async Task<IResult> SaveRecurring(string kind, RecurringReservationInput request, HttpContext http, LongBeachDbContext db, ICustomerRegistry customers, bool publicDemo, CancellationToken ct)
    {
        if (kind != "reservations") return Results.NotFound();
        if (!Allowed(http, kind, true, publicDemo)) return Denied(http);
        var input = RecurringReservationBatch.Normalize(request);
        var inputError = RecurringReservationBatch.ValidateInput(input);
        if (inputError is not null) return Results.BadRequest(new { message = inputError });
        var fingerprint = RecurringReservationBatch.Fingerprint(input);
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct);
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(724031904)", ct);
        var records = await db.OperationalRecords.ToListAsync(ct);
        var operationRecord = records.SingleOrDefault(row => row.Id == input.OperationId);
        if (operationRecord is not null)
        {
            if (operationRecord.Kind != RecurringReservationBatch.OperationKind) return Results.Conflict(new { message = "Esta identificação já pertence a outro registro." });
            var operation = JsonSerializer.Deserialize<ReservationGroupOperation>(operationRecord.Payload, JsonOptions)!;
            if (operation.Fingerprint != fingerprint) return Results.Conflict(new { message = "Esta solicitação já foi usada para outro grupo. Confira as reservas antes de criar uma nova solicitação." });
            var saved = operation.ReservationIds.Select(id => records.SingleOrDefault(row => row.Id == id && row.Kind == kind)).ToArray();
            if (saved.Any(row => row is null)) return Results.Conflict(new { message = "O grupo está incompleto. Peça à gestão para conciliar seus registros antes de repetir." });
            // Replay returns current versions; individual changes never get overwritten by the original batch.
            return Results.Ok(GroupResponse(input.OperationId, operation.Name, saved.Select(row => row!.Payload), http, publicDemo));
        }
        if (input.Amount > 0 && !CanFinance(http, true, publicDemo, kind)) return Results.Json(new { message = "Sua conta pode reservar horários. Peça à gestão para definir valores do grupo." }, statusCode: 403);
        var expanded = RecurringReservationBatch.Expand(input);
        var snapshot = records.GroupBy(row => row.Kind).ToDictionary(grouping => grouping.Key,
            grouping => grouping.Select(row => ParsePayload(row.Payload)).ToArray());
        var reservations = snapshot.GetValueOrDefault(kind, []).ToList();
        var today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(-3));
        Guid? recurringCustomerId = input.CustomerId;
        foreach (var occurrence in expanded)
        {
            var id = Guid.Parse(occurrence["id"]!.GetValue<string>());
            if (records.Any(row => row.Id == id)) return Results.Conflict(new { message = "Uma identificação do grupo já está em uso. Confira os registros antes de continuar." });
            if (!publicDemo)
            {
                if (recurringCustomerId.HasValue) occurrence["customerId"] = recurringCustomerId.ToString();
                await CustomerOperationalRecords.PrepareWriteAsync(customers, kind, id, occurrence, null, ct);
                if (Guid.TryParse(occurrence["customerId"]?.ToString(), out var linkedCustomer)) recurringCustomerId = linkedCustomer;
            }
            var body = JsonSerializer.SerializeToElement(occurrence);
            var validationError = OperationalValidation.Validate(kind, id, body, snapshot, today);
            if (validationError is not null) return Results.BadRequest(new { message = $"Nenhuma reserva foi criada. Semana {occurrence["occurrenceIndex"]}: {validationError}" });
            reservations.Add(body); snapshot[kind] = reservations.ToArray();
        }
        foreach (var occurrence in expanded)
            db.OperationalRecords.Add(new OperationalRecord(Guid.Parse(occurrence["id"]!.GetValue<string>()), kind, input.GroupTitle, occurrence.ToJsonString()));
        var operationPayload = new ReservationGroupOperation(input.OperationId, input.GroupTitle, fingerprint, 1,
            expanded.Select(row => Guid.Parse(row["id"]!.GetValue<string>())).ToArray());
        db.OperationalRecords.Add(new OperationalRecord(input.OperationId, RecurringReservationBatch.OperationKind, input.GroupTitle, JsonSerializer.Serialize(operationPayload, JsonOptions)));
        await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct);
        return Results.Json(GroupResponse(input.OperationId, input.GroupTitle, expanded.Select(row => row.ToJsonString()), http, publicDemo), statusCode: 201);
    }
    private static RecurringReservationResponse GroupResponse(Guid id, string title, IEnumerable<string> payloads, HttpContext http, bool publicDemo) =>
        new(id, title, payloads.Select(payload => JsonSerializer.Deserialize<ArenaReservationResponse>(VisiblePayload(payload, "reservations", http, publicDemo), JsonOptions)!).ToArray());
    private static bool Allowed(HttpContext http, string kind, bool write, bool publicDemo)
    {
        if (publicDemo && OperationalValidation.LegacyKinds.Contains(kind)) return true;
        if (http.User.Identity?.IsAuthenticated != true) return false;
        if (http.User.HasClaim("requires_first_access", "true")) return false;
        if (kind == "team" && write && !http.User.HasClaim("can_manage_staff", "true")) return false;
        var permission = OperationalValidation.Permissions[kind];
        return http.User.HasClaim("permission", write ? permission.Write : permission.Read);
    }
    private static bool CanFinance(HttpContext http, bool write, bool publicDemo, string kind) =>
        (publicDemo && OperationalValidation.LegacyKinds.Contains(kind)) ||
        (!http.User.HasClaim("staff_managed", "true") || http.User.HasClaim("staff_menu", "finance") && (!write || http.User.HasClaim("staff_action", "finance.operate"))) &&
        http.User.HasClaim("permission", SystemPermissions.FinanceRead) && (!write || http.User.HasClaim("permission", SystemPermissions.FinanceWrite));
    private static string VisiblePayload(string json, string kind, HttpContext http, bool publicDemo) =>
        OperationalRecordAccess.VisiblePayload(json, kind, CanFinance(http, false, publicDemo, kind));
    private static string StaffDependencyPayload(string json, string kind, HttpContext http)
    {
        if (!http.User.HasClaim("staff_managed", "true")) return json;
        bool Menu(string id) => http.User.HasClaim("staff_menu", id);
        string[]? fields = kind switch
        {
            "team" when !http.User.HasClaim("can_manage_staff", "true") => ["id", "version", "name", "role", "status"],
            "students" when !Menu("students") => ["id", "version", "name", "status", "customerId"],
            "classes" when !Menu("classes") => ["id", "version", "name", "status", "teacherId", "courtId", "weekDay", "weekDays", "startTime", "endTime", "startDate", "endDate", "capacity", "studentIds"],
            "courts" when !Menu("agenda.settings") => ["id", "version", "name", "status", "openingTime", "closingTime", "operatingDays", "scheduleConfirmed"],
            "reservations" when !Menu("agenda") => ["id", "version", "name", "courtId", "date", "startTime", "endTime", "status", "activityKind", "teacherId", "rentalGroupId"],
            _ => null
        };
        if (fields is null) return json;
        var body = JsonNode.Parse(json)!.AsObject();
        return new JsonObject(body.Where(pair => fields.Contains(pair.Key, StringComparer.Ordinal)).Select(pair => KeyValuePair.Create(pair.Key, pair.Value?.DeepClone()))).ToJsonString();
    }
    private static JsonElement ParsePayload(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }
    private static IResult Denied(HttpContext http) => http.User.Identity?.IsAuthenticated == true ? Results.Forbid() : Results.Unauthorized();
}
