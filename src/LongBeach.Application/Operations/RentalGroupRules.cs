using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
namespace LongBeach.Application.Operations;

public static class RentalGroupRules
{
    public static string Text(JsonElement row, string field) => OperationalValidation.Text(row, field);
    public static Guid Id(JsonElement row, string field = "id") => Guid.TryParse(Text(row, field), out var id) ? id : Guid.Empty;
    public static bool Month(string value, out DateOnly first) => DateOnly.TryParseExact(value + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out first) && first.Year < 9999;
    public static Guid StableId(string purpose, Guid group, string key) => new(SHA256.HashData(Encoding.UTF8.GetBytes($"longbeach-rentals-v1:{purpose}:{group:D}:{key}"))[..16]);
    public static decimal? Money(JsonElement row, string field) => row.TryGetProperty(field, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetDecimal(out var n) ? n : null;
    private static bool ValidMoney(JsonElement row, string field) => row.TryGetProperty(field, out var v) && (v.ValueKind == JsonValueKind.Null || Money(row, field) is >= 0 and <= 999_999_999 && decimal.Round(Money(row, field)!.Value, 2) == Money(row, field));
    public static JsonElement[] Members(JsonElement group) => group.TryGetProperty("members", out var members) && members.ValueKind == JsonValueKind.Array ? members.EnumerateArray().ToArray() : [];
    public static string? ValidateGroup(JsonElement body, IReadOnlyDictionary<string, JsonElement[]> records)
    {
        var courts = records.GetValueOrDefault("courts", []);
        var court = courts.FirstOrDefault(row => Id(row) == Id(body, "courtId"));
        if (court.ValueKind == JsonValueKind.Undefined) return "Escolha uma quadra cadastrada.";
        if (!body.TryGetProperty("weekDay", out var day) || day.ValueKind != JsonValueKind.Number || !day.TryGetInt32(out var weekday) || weekday is < 0 or > 6 || !CourtHours.OpensOn(court, weekday)) return "Escolha um dia em que a quadra funciona.";
        if (!CourtHours.TryMinute(Text(body, "startTime"), false, out var start) || !CourtHours.TryMinute(Text(body, "endTime"), true, out var end) || start >= end || !CourtHours.TryMinute(Text(court, "openingTime"), false, out var open) || !CourtHours.TryMinute(Text(court, "closingTime"), true, out var close) || start < open || end > close) return "Confira o horário dentro do funcionamento da quadra.";
        if (!DateOnly.TryParseExact(Text(body, "startDate"), "yyyy-MM-dd", out var begins) || Text(body, "endDate") != "" && (!DateOnly.TryParseExact(Text(body, "endDate"), "yyyy-MM-dd", out var ends) || ends < begins)) return "Confira as datas do acordo.";
        if (Text(body, "status") is not ("Ativo" or "Pausado" or "Encerrado")) return "Confira a situação do grupo.";
        if (!body.TryGetProperty("capacity", out var cap) || cap.ValueKind != JsonValueKind.Number || !cap.TryGetInt32(out var capacity) || capacity is < 1 or > 50) return "Informe de 1 a 50 integrantes previstos.";
        if (!body.TryGetProperty("dueDay", out var due) || due.ValueKind != JsonValueKind.Number || !due.TryGetInt32(out var dueDay) || dueDay is < 1 or > 31) return "Informe o dia de vencimento, de 1 a 31.";
        if (!ValidMoney(body, "monthlyAmount") || !ValidMoney(body, "extraAmount")) return "Confira os valores combinados ou deixe a combinar.";
        if (Text(body, "fifthPolicy") is not ("A confirmar" or "Incluído" or "Extra")) return "Confira o acordo para o quinto encontro.";
        if (Text(body, "notes").Length > 2000 || Text(body, "sport").Length > 80) return "Reduza as observações ou a modalidade.";
        var members = Members(body);
        if (members.Length is < 1 or > 50 || members.Any(m => m.ValueKind != JsonValueKind.Object || Id(m) == Guid.Empty || string.IsNullOrWhiteSpace(Text(m, "name")) || Text(m, "name").Trim().Length > 120 || Text(m, "phone").Length > 40 || Text(m, "status") is not ("Ativo" or "Inativo"))) return "Cadastre o nome de cada integrante e confira sua situação.";
        if (members.Select(m => Id(m)).Distinct().Count() != members.Length || members.Select(m => Text(m, "name").Trim()).Distinct(StringComparer.OrdinalIgnoreCase).Count() != members.Length) return "Há integrantes repetidos. Use o nome completo para distinguir homônimos.";
        if (members.Count(m => Text(m, "status") == "Ativo") > capacity) return "A quantidade prevista não pode ser menor que a de integrantes ativos.";
        bool Active(Guid id) => members.Any(m => Id(m) == id && Text(m, "status") == "Ativo");
        if (!Active(Id(body, "organizerId")) || Text(body, "backupId") != "" && (!Active(Id(body, "backupId")) || Id(body, "backupId") == Id(body, "organizerId"))) return "Escolha um responsável ativo e, se desejar, outro integrante como suplente.";
        var old = records.GetValueOrDefault("rentalGroups", []).FirstOrDefault(g => Id(g) == Id(body));
        if (old.ValueKind != JsonValueKind.Undefined && Members(old).Any(m => !members.Any(n => Id(n) == Id(m)))) return "Preserve o histórico dos integrantes: marque como inativo em vez de remover.";
        return null;
    }
    public static string? ValidateAttendance(JsonElement body, IReadOnlyDictionary<string, JsonElement[]> records, DateOnly today)
    {
        var reservation = records.GetValueOrDefault("reservations", []).FirstOrDefault(r => Id(r) == Id(body, "reservationId"));
        if (reservation.ValueKind == JsonValueKind.Undefined || Id(reservation, "rentalGroupId") != Id(body, "rentalGroupId") || Id(body, "rentalGroupId") == Guid.Empty || Text(reservation, "status") is "Cancelada" or "Bloqueio") return "Escolha um encontro válido do grupo.";
        if (DateOnly.ParseExact(Text(reservation, "date"), "yyyy-MM-dd") > today) return "Registre presença apenas no dia do encontro ou depois dele.";
        var group = records.GetValueOrDefault("rentalGroups", []).FirstOrDefault(g => Id(g) == Id(body, "rentalGroupId"));
        if (group.ValueKind == JsonValueKind.Undefined || !Members(group).Any(m => Id(m) == Id(body, "memberId")) || Text(body, "status") is not ("Presente" or "Ausente" or "Não informado")) return "Confira o integrante e a presença.";
        if (records.GetValueOrDefault("rentalAttendances", []).Any(p => Id(p) != Id(body) && Id(p, "reservationId") == Id(body, "reservationId") && Id(p, "memberId") == Id(body, "memberId"))) return "Este integrante já tem uma presença neste encontro. Edite o registro existente.";
        return null;
    }
    public static string[] Dates(JsonElement group, string month)
    {
        if (!Month(month, out var first)) throw new RentalRuleException("Informe a competência no formato ano-mês.");
        var start = DateOnly.ParseExact(Text(group, "startDate"), "yyyy-MM-dd");
        var end = Text(group, "endDate") == "" ? DateOnly.MaxValue : DateOnly.ParseExact(Text(group, "endDate"), "yyyy-MM-dd");
        return Enumerable.Range(0, DateTime.DaysInMonth(first.Year, first.Month)).Select(first.AddDays)
            .Where(d => (int)d.DayOfWeek == group.GetProperty("weekDay").GetInt32() && d >= start && d <= end).Select(d => d.ToString("yyyy-MM-dd")).ToArray();
    }
    public static JsonObject Reservation(JsonElement group, string month, string date)
    {
        var organizer = Members(group).Single(m => Id(m) == Id(group, "organizerId"));
        return new JsonObject { ["id"] = StableId("reservation", Id(group), date).ToString(), ["name"] = Text(group, "name"), ["version"] = 1,
            ["courtId"] = Text(group, "courtId"), ["date"] = date, ["startTime"] = Text(group, "startTime"), ["endTime"] = Text(group, "endTime"),
            ["customerName"] = Text(organizer, "name"), ["phone"] = Text(organizer, "phone"), ["amount"] = 0, ["status"] = "Confirmada",
            ["notes"] = "Aluguel mensal: cobrança única na competência do grupo. Alterações deste encontro não alteram o acordo mensal.",
            ["rentalGroupId"] = Id(group).ToString(), ["rentalMonth"] = month };
    }
    public static string? ReservationMetadata(JsonObject incoming, string? savedJson)
    {
        var old = savedJson is null ? null : JsonNode.Parse(savedJson)!.AsObject();
        foreach (var key in new[] { "rentalGroupId", "rentalMonth" })
            if (!JsonNode.DeepEquals(incoming[key], old?[key])) return "O vínculo com o mensalista só pode ser criado pela geração do mês e não pode ser alterado.";
        if (old?["rentalGroupId"] is not null && Money(JsonSerializer.SerializeToElement(incoming), "amount") != 0) return "O aluguel deste encontro está no acordo mensal. Edite a cobrança do mês, evitando cobrança em dobro.";
        return null;
    }
}
