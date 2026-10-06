using System.Globalization;
using System.Text.Json;

namespace LongBeach.Application.Operations;

public static class CourtHours
{
    // 24:00 is the exclusive end of this business day, never its opening time.
    public static bool TryMinute(string value, bool allowEndOfDay, out int minute)
    {
        if (allowEndOfDay && value == "24:00") { minute = 1440; return true; }
        var valid = TimeOnly.TryParseExact(value, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var time);
        minute = time.Hour * 60 + time.Minute;
        return valid;
    }

    public static bool ValidDays(JsonElement court) => !court.TryGetProperty("operatingDays", out var days) ||
        days.ValueKind == JsonValueKind.Array && days.GetArrayLength() is >= 1 and <= 7 &&
        days.EnumerateArray().All(day => day.ValueKind == JsonValueKind.Number && day.TryGetInt32(out var value) && value is >= 0 and <= 6) &&
        days.EnumerateArray().Select(day => day.GetInt32()).Distinct().Count() == days.GetArrayLength();

    // Older records had daily operation; absent days retain that contract.
    public static bool OpensOn(JsonElement court, int weekday) => !court.TryGetProperty("operatingDays", out var days) ||
        days.ValueKind == JsonValueKind.Array && days.EnumerateArray().Any(day => day.ValueKind == JsonValueKind.Number && day.TryGetInt32(out var value) && value == weekday);

    public static bool ScheduleConfirmed(JsonElement court) => !court.TryGetProperty("scheduleConfirmed", out var confirmed) || confirmed.ValueKind == JsonValueKind.True;
}
