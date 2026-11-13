using System.Text.Json.Nodes;
namespace LongBeach.Application.Operations;

public static class ClassScheduleDefaults
{
    // New classes begin on their creation date. Editing must not move historical schedules.
    public static void Prepare(JsonObject incoming, string? previous, DateOnly today)
    {
        if (previous is null)
        {
            incoming["startDate"] = today.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);
            incoming["status"] = "Ativa";
            return;
        }
        var saved = JsonNode.Parse(previous)!.AsObject();
        if (saved.TryGetPropertyValue("startDate", out var start)) incoming["startDate"] = start?.DeepClone();
        else incoming.Remove("startDate");
    }
}
