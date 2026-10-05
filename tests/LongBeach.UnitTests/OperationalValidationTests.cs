using System.Text.Json;
using LongBeach.Application.Operations;

namespace LongBeach.UnitTests;

public sealed class OperationalValidationTests
{
    private static readonly Guid CourtId = Guid.Parse("00000000-0000-4000-8000-000000000001");
    private static readonly Guid ClassId = Guid.Parse("00000000-0000-4000-8000-000000000002");
    private static readonly Guid StudentId = Guid.Parse("00000000-0000-4000-8000-000000000003");
    private static readonly Guid TeacherId = Guid.Parse("00000000-0000-4000-8000-000000000004");
    private static JsonElement Json(object value) => JsonSerializer.SerializeToElement(value);
    private static Dictionary<string, JsonElement[]> Records() => new()
    {
        ["courts"] = [Json(new { id = CourtId, name = "Quadra 1", status = "Disponível", openingTime = "06:00", closingTime = "23:00" })],
        ["students"] = [Json(new { id = StudentId, name = "Aluno" })],
        ["team"] = [Json(new { id = TeacherId, name = "Professor" })],
        ["classes"] = [Json(new { id = ClassId, name = "Turma", courtId = CourtId, weekDay = 1, startTime = "18:00", endTime = "19:00", status = "Ativa", capacity = 1 })]
    };
    private static readonly DateOnly Today = new(2026, 10, 4);
    [Fact]
    public void Reservation_uses_same_capacity_as_weekly_classes()
    {
        var id = Guid.NewGuid(); var records = Records();
        var overlapping = Json(new { id, name = "Reserva", courtId = CourtId, date = "2026-10-05", startTime = "18:30", endTime = "19:30", status = "Confirmada", amount = 80 });
        Assert.Contains("ocupado", OperationalValidation.Validate("reservations", id, overlapping, records, Today));
        var adjacent = Json(new { id, name = "Reserva", courtId = CourtId, date = "2026-10-05", startTime = "19:00", endTime = "20:00", status = "Confirmada", amount = 80 });
        Assert.Null(OperationalValidation.Validate("reservations", id, adjacent, records, Today));
    }
    [Fact]
    public void Reservation_cannot_use_closed_or_maintenance_court()
    {
        var id = Guid.NewGuid();
        var outside = Json(new { id, name = "Reserva", courtId = CourtId, date = "2026-10-05", startTime = "05:30", endTime = "06:30", status = "Confirmada", amount = 80 });
        Assert.Contains("funcionamento", OperationalValidation.Validate("reservations", id, outside, Records(), Today));
    }
    [Fact]
    public void Weekly_class_cannot_override_an_existing_reservation()
    {
        var id = Guid.NewGuid(); var records = Records(); records["classes"] = [];
        records["reservations"] = [Json(new { id = Guid.NewGuid(), courtId = CourtId, date = "2026-10-05", startTime = "18:30", endTime = "19:30", status = "Confirmada" })];
        var input = Json(new { id, name = "Nova turma", courtId = CourtId, weekDay = 1, startTime = "18:00", endTime = "19:00", status = "Ativa", capacity = 5, teacherId = TeacherId, studentIds = Array.Empty<Guid>() });
        Assert.Contains("conflita", OperationalValidation.Validate("classes", id, input, records, Today));
    }
    [Fact]
    public void Enrollment_prevents_duplicate_and_full_classes()
    {
        var id = Guid.NewGuid(); var records = Records();
        records["enrollments"] = [Json(new { id = Guid.NewGuid(), studentId = StudentId, classId = ClassId, status = "Ativa" })];
        var input = Json(new { id, name = "Matrícula", studentId = StudentId, classId = ClassId, status = "Ativa", startDate = "2026-10-04", monthlyAmount = 120 });
        Assert.Contains("já possui", OperationalValidation.Validate("enrollments", id, input, records, Today));
        var otherStudent = Guid.NewGuid(); records["students"] = [Json(new { id = StudentId }), Json(new { id = otherStudent })];
        input = Json(new { id, name = "Matrícula", studentId = otherStudent, classId = ClassId, status = "Ativa", startDate = "2026-10-04", monthlyAmount = 120 });
        Assert.Contains("vagas", OperationalValidation.Validate("enrollments", id, input, records, Today));
    }
    [Fact]
    public void Attendance_requires_existing_enrollment_and_unique_date()
    {
        var id = Guid.NewGuid(); var records = Records(); var input = Json(new { id, name = "Presença", studentId = StudentId, classId = ClassId, date = "2026-10-04", status = "Presente" });
        Assert.Contains("matrícula", OperationalValidation.Validate("presences", id, input, records, Today));
        records["enrollments"] = [Json(new { id = Guid.NewGuid(), studentId = StudentId, classId = ClassId, startDate = "2026-10-04", status = "Ativa" })];
        Assert.Null(OperationalValidation.Validate("presences", id, input, records, Today));
        records["presences"] = [Json(new { id = Guid.NewGuid(), studentId = StudentId, classId = ClassId, date = "2026-10-04" })];
        Assert.Contains("já foi registrada", OperationalValidation.Validate("presences", id, input, records, Today));
    }
    [Fact]
    public void Monthly_charge_has_traceable_origin_and_cannot_duplicate_competence()
    {
        var id = Guid.NewGuid(); var enrollmentId = Guid.NewGuid(); var records = Records();
        records["enrollments"] = [Json(new { id = enrollmentId })];
        var charge = Json(new { id, name = "Mensalidade", direction = "Receber", origin = "Escola", amount = 120, dueDate = "2026-10-10", status = "Pendente", sourceId = enrollmentId, sourceKind = "enrollments", month = "2026-10" });
        Assert.Null(OperationalValidation.Validate("financeEntries", id, charge, records, Today));
        records["financeEntries"] = [Json(new { id = Guid.NewGuid(), sourceId = enrollmentId, sourceKind = "enrollments", month = "2026-10", status = "Pendente" })];
        Assert.Contains("Já existe", OperationalValidation.Validate("financeEntries", id, charge, records, Today));
    }
    [Fact]
    public void Payment_confirmation_requires_actual_payment_date()
    {
        var id = Guid.NewGuid(); var charge = Json(new { id, name = "Despesa", direction = "Pagar", origin = "Arena", amount = 120, dueDate = "2026-10-10", status = "Pago", paidDate = "" });
        Assert.Contains("data do pagamento", OperationalValidation.Validate("financeEntries", id, charge, Records(), Today));
    }
    [Theory]
    [InlineData("classes", "students:read", "students:write")]
    [InlineData("reservations", "projects:read", "projects:write")]
    [InlineData("financeEntries", "finance:read", "finance:write")]
    public void Each_kind_reuses_existing_scoped_permissions(string kind, string read, string write)
    {
        Assert.Equal((read, write), OperationalValidation.Permissions[kind]);
    }

    [Fact]
    public void Staff_read_does_not_expose_pay_or_allow_overwriting_it()
    {
        var saved = "{\"id\":\"staff-id\",\"name\":\"Professora\",\"payAmount\":180,\"payBasis\":\"Hora\",\"paymentFrequency\":\"Mensal\",\"paymentDay\":\"10\",\"notes\":\"Acordo de R$ 180 por hora\",\"version\":1}";
        var visible = JsonDocument.Parse(OperationalRecordAccess.VisiblePayload(saved, "team", false)).RootElement;
        Assert.False(visible.GetProperty("costsVisible").GetBoolean());
        Assert.Equal(0, visible.GetProperty("payAmount").GetInt32());
        Assert.Equal("", visible.GetProperty("notes").GetString());
        Assert.Equal("", visible.GetProperty("payBasis").GetString());
        var prepared = OperationalRecordAccess.PrepareWrite("{\"id\":\"staff-id\",\"name\":\"Novo nome\",\"payAmount\":0,\"costsVisible\":false}", saved, "team", false, false);
        Assert.True(prepared.Allowed);
        Assert.Equal(180, prepared.Body["payAmount"]!.GetValue<int>());
        Assert.Equal("Acordo de R$ 180 por hora", prepared.Body["notes"]!.GetValue<string>());
        Assert.False(prepared.Body.ContainsKey("costsVisible"));
    }
    [Fact]
    public void Financial_viewer_cannot_change_project_costs_without_write_permission()
    {
        var prepared = OperationalRecordAccess.PrepareWrite("{\"name\":\"Projeto\",\"estimatedCost\":100,\"actualCost\":20}", "{\"estimatedCost\":80,\"actualCost\":20}", "projects", true, false);
        Assert.False(prepared.Allowed);
    }

    [Fact]
    public void Ended_enrollment_only_allows_attendance_during_its_recorded_period()
    {
        var id = Guid.NewGuid(); var records = Records();
        records["enrollments"] = [Json(new { id = Guid.NewGuid(), studentId = StudentId, classId = ClassId, startDate = "2026-09-01", endDate = "2026-10-04", status = "Encerrada" })];
        var late = Json(new { id, name = "Presença", studentId = StudentId, classId = ClassId, date = "2026-10-05", status = "Presente" });
        Assert.Contains("matrícula", OperationalValidation.Validate("presences", id, late, records, Today.AddDays(1)));
        var within = Json(new { id, name = "Presença", studentId = StudentId, classId = ClassId, date = "2026-09-28", status = "Presente" });
        Assert.Null(OperationalValidation.Validate("presences", id, within, records, Today));
    }
    [Fact]
    public void Future_payment_cannot_be_reported_as_already_received()
    {
        var id = Guid.NewGuid();
        var charge = Json(new { id, name = "Recebimento", direction = "Receber", origin = "Arena", amount = 50, dueDate = "2026-10-10", status = "Pago", paidDate = "2026-10-10" });
        Assert.Contains("até o dia de hoje", OperationalValidation.Validate("financeEntries", id, charge, Records(), Today));
    }
    [Fact]
    public void Attendance_cannot_be_recorded_before_the_lesson_occurs()
    {
        var id = Guid.NewGuid(); var records = Records();
        records["enrollments"] = [Json(new { id = Guid.NewGuid(), studentId = StudentId, classId = ClassId, startDate = "2026-10-04", status = "Ativa" })];
        var future = Json(new { id, name = "Presença", studentId = StudentId, classId = ClassId, date = "2026-10-05", status = "Presente" });
        Assert.Contains("data da aula", OperationalValidation.Validate("presences", id, future, records, Today));
    }
}
