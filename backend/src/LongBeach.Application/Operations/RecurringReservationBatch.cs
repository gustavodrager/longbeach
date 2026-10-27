using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using LongBeach.Contracts.Operations;

namespace LongBeach.Application.Operations;

/// <summary>A weekly group is a finite atomic creation of individual reservation facts.</summary>
public static class RecurringReservationBatch
{
    public const string OperationKind = "reservationGroups";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    public static RecurringReservationInput Normalize(RecurringReservationInput input) => input with
    {
        GroupTitle = (input.GroupTitle ?? "").Trim(), CustomerName = (input.CustomerName ?? "").Trim(),
        Phone = (input.Phone ?? "").Trim(), Notes = (input.Notes ?? "").Trim()
    };
    public static string? ValidateInput(RecurringReservationInput input)
    {
        if (input.OperationId == Guid.Empty) return "A identificação da solicitação é obrigatória.";
        if (input.CourtId == Guid.Empty) return "Escolha uma quadra cadastrada.";
        if (input.GroupTitle.Length is < 1 or > 120) return "O nome do grupo deve ter entre 1 e 120 caracteres.";
        if (input.Weeks is < 1 or > 12) return "Escolha de 1 a 12 semanas para o grupo.";
        if (!DateOnly.TryParseExact(input.StartDate, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var firstDate) || firstDate.DayNumber > DateOnly.MaxValue.DayNumber - 7 * (input.Weeks - 1)) return "Informe uma primeira data válida para todas as semanas.";
        if (!TimeOnly.TryParseExact(input.StartTime, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var begin) || !TimeOnly.TryParseExact(input.EndTime, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var end) || begin >= end) return "Confira o horário: o término deve ficar depois do início.";
        if (input.Amount is < 0 or > 999_999_999 || decimal.Round(input.Amount, 2) != input.Amount) return "Confira o valor combinado por reserva.";
        if (input.CustomerName!.Length > 240 || input.Phone!.Length > 80 || input.Notes!.Length > 2000) return "Confira o tamanho do nome, telefone e observações do grupo.";
        return null;
    }
    public static string Fingerprint(RecurringReservationInput input) => Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(new
    {
        input.OperationId, input.GroupTitle, input.CourtId, input.StartDate, input.StartTime, input.EndTime, input.Weeks,
        input.CustomerName, input.Phone, AmountCents = checked((long)(input.Amount * 100)), input.Notes
    }, JsonOptions)));
    public static Guid OccurrenceId(Guid operationId, int index)
    {
        var hex = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"longbeach-arena-recurring-v1:{operationId:D}:{index}")))[..32].ToCharArray();
        hex[12] = '8'; hex[16] = "89ab"[Convert.ToInt32(hex[16].ToString(), 16) & 3];
        return Guid.ParseExact(new string(hex), "N");
    }
    public static JsonObject[] Expand(RecurringReservationInput input)
    {
        var firstDate = DateOnly.ParseExact(input.StartDate, "yyyy-MM-dd", CultureInfo.InvariantCulture);
        return Enumerable.Range(1, input.Weeks).Select(index => new JsonObject
        {
            ["id"] = OccurrenceId(input.OperationId, index).ToString(), ["version"] = 1,
            ["name"] = input.GroupTitle, ["courtId"] = input.CourtId.ToString(),
            ["date"] = firstDate.AddDays((index - 1) * 7).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            ["startTime"] = input.StartTime, ["endTime"] = input.EndTime,
            ["customerName"] = input.CustomerName, ["phone"] = input.Phone, ["amount"] = input.Amount,
            ["status"] = "Confirmada", ["notes"] = input.Notes,
            ["groupId"] = input.OperationId.ToString(), ["groupTitle"] = input.GroupTitle, ["occurrenceIndex"] = index
        }).ToArray();
    }
    public static string? ValidateMetadata(JsonObject incoming, string? savedJson)
    {
        var previous = savedJson is null ? null : JsonNode.Parse(savedJson)!.AsObject();
        var linked = previous?["groupId"] is not null;
        foreach (var field in new[] { "groupId", "groupTitle", "occurrenceIndex" })
        {
            if (linked)
            {
                if (incoming[field] is not null && !JsonNode.DeepEquals(incoming[field], previous![field])) return "O grupo de origem desta reserva deve ser preservado. Edite apenas esta ocorrência.";
                incoming[field] = previous![field]?.DeepClone();
            }
            else if (incoming[field] is not null) return "Crie grupos pelo cadastro de reservas recorrentes.";
        }
        return null;
    }
}
