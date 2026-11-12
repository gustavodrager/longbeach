using System.Text.Json;
using System.Text.Json.Nodes;
using LongBeach.Application.Operations;

namespace LongBeach.UnitTests;

public sealed class ClassDeletionValidationTests
{
    private static readonly Guid ClassId = Guid.NewGuid();
    private static readonly Guid ActiveClassId = Guid.NewGuid();
    private static readonly Guid EnrollmentId = Guid.NewGuid();
    private static readonly DateOnly Today = new(2026, 11, 12);
    private static JsonElement Json(object value) => JsonSerializer.SerializeToElement(value);
    private static JsonElement Archived => Json(ClassDeletionRules.Archive(Json(new { id = ClassId, name = "Turma", status = "Ativa", startTime = "18:00", weekDay = 4 }), Guid.NewGuid(), DateTimeOffset.Parse("2026-11-12T21:30:00Z")));
    private static Dictionary<string, JsonElement[]> Records() => new()
    {
        ["classes"] = [Archived, Json(new { id = ActiveClassId, name = "Outra turma", status = "Ativa" })],
        ["enrollments"] = [Json(new { id = EnrollmentId, classId = ClassId, status = "Encerrada" })]
    };

    [Theory]
    [InlineData("enrollments")]
    [InlineData("presences")]
    [InlineData("reservations")]
    public void Historical_records_cannot_be_moved_to_another_class_to_bypass_readonly(string kind)
    {
        var id = Guid.NewGuid(); var records = Records();
        records[kind] = [Json(new { id, name = "Histórico", classId = ClassId, status = "Encerrada" })];
        var moved = Json(new { id, name = "Histórico", classId = ActiveClassId, status = "Ativa" });
        Assert.Equal(ClassDeletionRules.ReadOnlyMessage, OperationalValidation.Validate(kind, id, moved, records, Today));
    }

    [Theory]
    [InlineData("classes", "deletedAt")]
    [InlineData("enrollments", "closedByClassDeletion")]
    [InlineData("enrollments", "cancelledBeforeStart")]
    [InlineData("reservations", "cancelledByClassDeletion")]
    public void Normal_validation_and_staged_imports_reject_server_owned_markers(string kind, string field)
    {
        var id = Guid.NewGuid();
        var body = new JsonObject { ["id"] = id.ToString(), ["name"] = "Cadastro", [field] = false };
        Assert.Equal("Os dados de exclusão são preenchidos somente pelo sistema.", OperationalValidation.Validate(kind, id, Json(body), Records(), Today));
    }

    private static JsonObject Charge(Guid id, string month = "2026-11") => new()
    {
        ["id"] = id.ToString(), ["name"] = "Mensalidade", ["amount"] = 150, ["dueDate"] = "2026-12-05", ["status"] = "Pendente",
        ["direction"] = "Receber", ["origin"] = "Escola", ["sourceKind"] = "enrollments", ["sourceId"] = EnrollmentId.ToString(), ["month"] = month
    };

    [Fact]
    public void A_past_debt_can_still_be_reconciled_but_cannot_be_moved_to_another_competence()
    {
        var id = Guid.NewGuid(); var records = Records(); var stored = Charge(id);
        records["financeEntries"] = [Json(stored)];
        var changed = stored.DeepClone().AsObject(); changed["dueDate"] = "2026-12-10";
        Assert.Null(OperationalValidation.Validate("financeEntries", id, Json(changed), records, Today));
        changed["month"] = "2026-12";
        Assert.Equal("Preserve a matrícula e a competência desta cobrança histórica. A turma foi excluída.",
            OperationalValidation.Validate("financeEntries", id, Json(changed), records, Today));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void New_or_reassigned_charges_cannot_create_future_competences_for_deleted_classes(bool reassignExisting)
    {
        var id = Guid.NewGuid(); var records = Records();
        if (reassignExisting)
        {
            var unrelated = Charge(id, "2026-12"); unrelated.Remove("sourceKind"); unrelated.Remove("sourceId");
            records["financeEntries"] = [Json(unrelated)];
        }
        Assert.Equal("Esta turma foi excluída. Preserve as cobranças anteriores; não gere novas competências após a exclusão.",
            OperationalValidation.Validate("financeEntries", id, Json(Charge(id, "2026-12")), records, Today));
    }

    [Fact]
    public void Reservations_cannot_overlap_an_occurrence_that_started_before_same_day_deletion()
    {
        var id = Guid.NewGuid(); var court = Guid.NewGuid(); var records = Records();
        var lesson = JsonNode.Parse(Archived.GetRawText())!.AsObject(); lesson["courtId"] = court.ToString(); lesson["endTime"] = "19:00";
        records["classes"] = [Json(lesson)];
        records["courts"] = [Json(new { id = court, name = "Quadra", status = "Disponível", openingTime = "06:00", closingTime = "24:00" })];
        var reservation = Json(new { id, name = "Locação", courtId = court, date = "2026-11-12", startTime = "18:45", endTime = "19:00", amount = 100, status = "Confirmada" });
        Assert.Equal("Este horário já está ocupado por uma reserva ou aula nesta quadra.",
            OperationalValidation.Validate("reservations", id, reservation, records, Today));
    }
}
