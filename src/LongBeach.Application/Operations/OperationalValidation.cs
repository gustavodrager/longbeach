using System.Globalization;
using System.Text.Json;
using LongBeach.Domain.Identity;

namespace LongBeach.Application.Operations;

/// <summary>Versioned, additive arena records. Legacy records keep their identifiers and fields.</summary>
public static class OperationalValidation
{
    public static readonly IReadOnlyDictionary<string, (string Read, string Write)> Permissions =
        new Dictionary<string, (string, string)>(StringComparer.Ordinal)
        {
            ["students"] = (SystemPermissions.StudentsRead, SystemPermissions.StudentsWrite),
            ["team"] = (SystemPermissions.EmployeesRead, SystemPermissions.EmployeesWrite),
            ["inventory"] = (SystemPermissions.InventoryRead, SystemPermissions.InventoryWrite),
            ["projects"] = (SystemPermissions.ProjectsRead, SystemPermissions.ProjectsWrite),
            ["courts"] = (SystemPermissions.ProjectsRead, SystemPermissions.ProjectsWrite),
            ["reservations"] = (SystemPermissions.ProjectsRead, SystemPermissions.ProjectsWrite),
            ["classes"] = (SystemPermissions.StudentsRead, SystemPermissions.StudentsWrite),
            ["enrollments"] = (SystemPermissions.StudentsRead, SystemPermissions.StudentsWrite),
            ["presences"] = (SystemPermissions.StudentsRead, SystemPermissions.StudentsWrite),
            ["financeEntries"] = (SystemPermissions.FinanceRead, SystemPermissions.FinanceWrite),
            ["rentalGroups"] = (SystemPermissions.ProjectsRead, SystemPermissions.ProjectsWrite),
            ["rentalMonths"] = (SystemPermissions.ProjectsRead, SystemPermissions.ProjectsWrite),
            ["rentalAttendances"] = (SystemPermissions.ProjectsRead, SystemPermissions.ProjectsWrite),
            ["maintenance"] = (SystemPermissions.ProjectsRead, SystemPermissions.ProjectsWrite)
        };
    public static readonly HashSet<string> LegacyKinds = ["students", "team", "inventory", "projects"];
    public static int Version(JsonElement body) => body.TryGetProperty("version", out var version) && version.TryGetInt32(out var value) ? value : 0;
    public static string Text(JsonElement body, string field) => body.TryGetProperty(field, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : "";
    private static decimal Number(JsonElement body, string field) => body.TryGetProperty(field, out var value) && value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out var number) ? number : -1;
    private static bool Date(JsonElement body, string field, out DateOnly date) => DateOnly.TryParseExact(Text(body, field), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out date);
    private static bool Time(JsonElement body, string field, out int time) => CourtHours.TryMinute(Text(body, field), field is "closingTime" or "endTime", out time);
    private static bool Status(JsonElement body, params string[] states) => states.Contains(Text(body, "status"), StringComparer.Ordinal);
    private static bool Overlaps(JsonElement first, JsonElement second) => Time(first, "startTime", out var a) && Time(first, "endTime", out var b) && Time(second, "startTime", out var c) && Time(second, "endTime", out var d) && a < d && c < b;
    private static Guid Id(JsonElement body, string field = "id") => Guid.TryParse(Text(body, field), out var id) ? id : Guid.Empty;
    private static bool Money(JsonElement body, string field) { var number = Number(body, field); return number is >= 0 and <= 999_999_999 && decimal.Round(number, 2) == number; }
    private static bool OptionalMoney(JsonElement body, string field) => body.TryGetProperty(field, out var value) && (value.ValueKind == JsonValueKind.Null || Money(body, field));

    public static bool ClassStartedOn(JsonElement body, DateOnly date) => string.IsNullOrEmpty(Text(body, "startDate")) || Date(body, "startDate", out var start) && start <= date;

    public static string? Validate(string kind, Guid id, JsonElement body, IReadOnlyDictionary<string, JsonElement[]> records, DateOnly today)
    {
        if (!Permissions.ContainsKey(kind)) return "Área não encontrada.";
        if (body.ValueKind != JsonValueKind.Object || System.Text.Encoding.UTF8.GetByteCount(body.GetRawText()) > 32_768) return "O registro deve ser um objeto de até 32 KB.";
        if (Id(body) != id) return "O identificador do registro não corresponde à rota.";
        if (string.IsNullOrWhiteSpace(Text(body, "name")) || Text(body, "name").Trim().Length > 240) return "O nome deve ter entre 1 e 240 caracteres.";
        if (body.TryGetProperty("version", out var version) && (version.ValueKind != JsonValueKind.Number || !version.TryGetInt32(out var v) || v < 0)) return "A versão do cadastro é inválida.";
        JsonElement[] Rows(string key) => records.TryGetValue(key, out var list) ? list : [];
        bool Exists(string key, string field) => Rows(key).Any(row => Id(row) == Id(body, field) && Id(body, field) != Guid.Empty);
        var others = Rows(kind).Where(row => Id(row) != id).ToArray();
        switch (kind)
        {
            case "rentalGroups": return RentalGroupRules.ValidateGroup(body, records);
            case "rentalAttendances": return RentalGroupRules.ValidateAttendance(body, records, today);
            case "rentalMonths": return "Gere a competência pela área de mensalistas.";
            case "students":
                if (!Money(body, "monthlyAmount")) return "Confira o valor da mensalidade.";
                break;
            case "team":
                if (!OptionalMoney(body, "payAmount")) return "Confira o valor combinado ou deixe a combinar.";
                break;
            case "projects":
                if (!Money(body, "estimatedCost") || !Money(body, "actualCost")) return "Confira os custos do projeto.";
                break;
            case "inventory":
                if (Number(body, "quantity") < 0 || Number(body, "minimum") < 0 || !Money(body, "unitCost")) return "Quantidade, mínimo e custo devem ser positivos ou zero.";
                break;
            case "courts":
                if (!Status(body, "Disponível", "Manutenção") || !Time(body, "openingTime", out var open) || !Time(body, "closingTime", out var close) || open >= close) return "Confira o estado e os horários de funcionamento da quadra.";
                if (!CourtHours.ValidDays(body)) return "Escolha os dias de funcionamento da quadra, sem repetir dias.";
                if (body.TryGetProperty("scheduleConfirmed", out var confirmed) && confirmed.ValueKind is not (JsonValueKind.True or JsonValueKind.False)) return "Informe se a agenda atual foi conferida.";
                foreach (var booking in Rows("reservations").Where(row => Id(row, "courtId") == id && Text(row, "status") != "Cancelada" && Date(row, "date", out var day) && day >= today).Concat(Rows("classes").Where(row => Id(row, "courtId") == id && Text(row, "status") == "Ativa")))
                {
                    if (Time(booking, "startTime", out var start) && Time(booking, "endTime", out var end) && (start < open || end > close)) return "O novo horário da quadra não comporta suas reservas ou aulas. Ajuste a agenda primeiro.";
                    var bookingDay = Date(booking, "date", out var bookedDate) ? (int)bookedDate.DayOfWeek : (int)Number(booking, "weekDay");
                    if (!CourtHours.OpensOn(body, bookingDay)) return "Os dias de funcionamento não comportam suas reservas ou aulas. Ajuste a agenda primeiro.";
                }
                break;
            case "reservations":
            case "classes":
                if (!Exists("courts", "courtId")) return "Escolha uma quadra cadastrada.";
                var court = Rows("courts").Single(row => Id(row) == Id(body, "courtId"));
                if (!Time(body, "startTime", out var first) || !Time(body, "endTime", out var last) || first >= last || !Time(court, "openingTime", out var begins) || !Time(court, "closingTime", out var ends) || first < begins || last > ends) return "O horário deve ficar dentro do funcionamento da quadra, com término depois do início.";
                if (kind == "reservations")
                {
                    if (!Date(body, "date", out var date) || !Money(body, "amount") || !Status(body, "Confirmada", "Chegou", "Concluída", "Cancelada", "Bloqueio")) return "Confira a data, o valor e o estado da reserva.";
                    if (Text(body, "status") == "Cancelada") break;
                    if (!CourtHours.OpensOn(court, (int)date.DayOfWeek)) return "A quadra não funciona neste dia da semana.";
                    if (date > today && Status(body, "Chegou", "Concluída")) return "A chegada ou conclusão só pode ser registrada na data da reserva ou depois dela.";
                    if (Text(court, "status") != "Disponível") return "Esta quadra está em manutenção.";
                    if (others.Any(row => Id(row, "courtId") == Id(body, "courtId") && Text(row, "date") == Text(body, "date") && Text(row, "status") != "Cancelada" && Overlaps(row, body)) || Rows("classes").Any(row => Id(row, "courtId") == Id(body, "courtId") && Text(row, "status") == "Ativa" && ClassStartedOn(row, date) && Number(row, "weekDay") == (int)date.DayOfWeek && Overlaps(row, body))) return "Este horário já está ocupado por uma reserva ou aula nesta quadra.";
                }
                else
                {
                    if (body.TryGetProperty("startDate", out var classStart) && (classStart.ValueKind != JsonValueKind.String || Text(body, "startDate") != "" && !Date(body, "startDate", out _))) return "Confira a data de início da grade.";
                    var weekday = Number(body, "weekDay"); var capacity = Number(body, "capacity");
                    if (weekday < 0 || weekday > 6 || decimal.Truncate(weekday) != weekday || capacity < 1 || capacity > 500 || decimal.Truncate(capacity) != capacity || !Status(body, "Ativa", "Pausada", "Encerrada")) return "Confira o dia da semana, o estado e o número de vagas da turma.";
                    if (!Exists("team", "teacherId")) return "Escolha um professor cadastrado na equipe.";
                    if (!body.TryGetProperty("studentIds", out var studentIds) || studentIds.ValueKind != JsonValueKind.Array || studentIds.GetArrayLength() > capacity) return "Confira os alunos e a capacidade da turma.";
                    if (studentIds.GetArrayLength() > 0) return "Registre os alunos pelo cadastro de matrículas, para preservar vagas e histórico.";
                    var students = studentIds.EnumerateArray().Select(value => value.ValueKind == JsonValueKind.String && Guid.TryParse(value.GetString(), out var parsed) ? parsed : Guid.Empty).ToArray();
                    if (students.Distinct().Count() != students.Length || students.Any(student => student == Guid.Empty || !Rows("students").Any(row => Id(row) == student))) return "A turma contém alunos inválidos ou repetidos.";
                    if (Rows("enrollments").Count(row => Id(row, "classId") == id && Text(row, "status") == "Ativa") > capacity) return "A capacidade não pode ficar abaixo do número de matrículas ativas.";
                    if (Text(body, "status") != "Ativa") break;
                    if (!CourtHours.OpensOn(court, (int)weekday)) return "A quadra não funciona neste dia da semana.";
                    if (Text(court, "status") != "Disponível") return "Esta quadra está em manutenção.";
                    if (others.Any(row => Id(row, "courtId") == Id(body, "courtId") && Number(row, "weekDay") == weekday && Text(row, "status") == "Ativa" && Overlaps(row, body)) || Rows("reservations").Any(row => Id(row, "courtId") == Id(body, "courtId") && Text(row, "status") != "Cancelada" && Date(row, "date", out var day) && day >= today && ClassStartedOn(body, day) && (int)day.DayOfWeek == weekday && Overlaps(row, body))) return "A aula conflita com uma reserva ou turma nesta quadra.";
                }
                break;
            case "enrollments":
                if (!Exists("students", "studentId") || !Exists("classes", "classId") || !Date(body, "startDate", out _) || !OptionalMoney(body, "monthlyAmount") || !Status(body, "Ativa", "Encerrada")) return "Confira o aluno, a turma, a data e o valor da matrícula.";
                if (Text(body, "status") == "Encerrada")
                {
                    if (!Date(body, "endDate", out var endDate) || !Date(body, "startDate", out var startDate) || endDate < startDate) return "Informe uma data de encerramento a partir do início da matrícula.";
                    break;
                }
                if (!string.IsNullOrEmpty(Text(body, "endDate"))) return "Uma matrícula ativa deve ficar sem data de encerramento.";
                var selectedClass = Rows("classes").Single(row => Id(row) == Id(body, "classId"));
                if (Date(body, "startDate", out var enrolledOn) && !ClassStartedOn(selectedClass, enrolledOn)) return "A matrícula não pode começar antes da turma.";
                if (Text(selectedClass, "status") != "Ativa") return "Só é possível matricular em uma turma ativa.";
                if (others.Any(row => Id(row, "studentId") == Id(body, "studentId") && Id(row, "classId") == Id(body, "classId") && Text(row, "status") == "Ativa")) return "Este aluno já possui matrícula ativa nesta turma.";
                if (others.Count(row => Id(row, "classId") == Id(body, "classId") && Text(row, "status") == "Ativa") >= Number(selectedClass, "capacity")) return "Esta turma não possui vagas disponíveis.";
                break;
            case "presences":
                if (!Exists("students", "studentId") || !Exists("classes", "classId") || !Date(body, "date", out var attendedDate) || !Status(body, "Presente", "Ausente")) return "Confira o aluno, a turma, a data e a presença.";
                if (attendedDate > today) return "A presença só pode ser registrada na data da aula ou depois dela.";
                if (!Rows("enrollments").Any(row => Id(row, "studentId") == Id(body, "studentId") && Id(row, "classId") == Id(body, "classId") && Date(row, "startDate", out var start) && start <= attendedDate && (Text(row, "status") == "Ativa" || (Date(row, "endDate", out var end) && attendedDate <= end)))) return "O aluno não tem matrícula nesta turma para a data informada.";
                if (others.Any(row => Id(row, "studentId") == Id(body, "studentId") && Id(row, "classId") == Id(body, "classId") && Text(row, "date") == Text(body, "date"))) return "Esta presença já foi registrada. Abra o registro para corrigir.";
                break;
            case "financeEntries":
                if (!Money(body, "amount") || Number(body, "amount") == 0 || !Date(body, "dueDate", out _) || !Status(body, "Pendente", "Pago", "Cancelado") || !new[] { "Receber", "Pagar" }.Contains(Text(body, "direction")) || !new[] { "Bar", "Escola", "Locações", "Arena" }.Contains(Text(body, "origin"))) return "Confira o valor, o vencimento, a origem e o estado do lançamento.";
                if (Text(body, "status") == "Pago" && (!Date(body, "paidDate", out var paidDate) || paidDate > today)) return "Informe a data do pagamento confirmado, até o dia de hoje.";
                if (!string.IsNullOrEmpty(Text(body, "sourceId")))
                {
                    var sourceKind = Text(body, "sourceKind");
                    if (!new[] { "enrollments", "reservations", "projects", "maintenance", "rentalMonths" }.Contains(sourceKind) || !Exists(sourceKind, "sourceId")) return "O lançamento deve apontar para um registro de origem existente.";
                    if (sourceKind == "reservations" && Rows("reservations").Any(r => Id(r) == Id(body, "sourceId") && RentalGroupRules.Id(r, "rentalGroupId") != Guid.Empty)) return "Este encontro pertence a um mensalista. Use a competência do grupo como origem da cobrança.";
                    if (sourceKind == "rentalMonths")
                    {
                        var source = Rows("rentalMonths").Single(r => Id(r) == Id(body, "sourceId"));
                        if (Text(body, "origin") != "Locações" || Text(body, "direction") != "Receber" || Text(body, "month") != Text(source, "month")) return "A cobrança do mensalista deve ter origem Locações e a competência do grupo.";
                        if (Text(body, "status") != "Cancelado" && others.Any(r => Text(r, "sourceKind") == "rentalMonths" && Id(r, "sourceId") == Id(body, "sourceId") && Text(r, "status") != "Cancelado")) return "Já existe uma cobrança ativa para este grupo e mês.";
                    }
                    if (sourceKind == "enrollments")
                    {
                        if (Text(body, "origin") != "Escola" || Text(body, "direction") != "Receber" || !DateOnly.TryParseExact(Text(body, "month") + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _)) return "A mensalidade deve ter origem Escola e competência no formato ano-mês.";
                        if (Text(body, "status") != "Cancelado" && others.Any(row => Text(row, "sourceKind") == "enrollments" && Id(row, "sourceId") == Id(body, "sourceId") && Text(row, "month") == Text(body, "month") && Text(row, "status") != "Cancelado")) return "Já existe uma mensalidade desta matrícula para a competência informada.";
                    }
                }
                break;
            case "maintenance":
                if (!Status(body, "Aberta", "Em andamento", "Concluída", "Cancelada") || !new[] { "Normal", "Urgente" }.Contains(Text(body, "priority")) || !Date(body, "dueDate", out _) || string.IsNullOrWhiteSpace(Text(body, "area")) || string.IsNullOrWhiteSpace(Text(body, "owner"))) return "Informe área, responsável, prazo, prioridade e estado da manutenção.";
                break;
        }
        return null;
    }
}
