namespace LongBeach.Application.Auth;

public static class GoogleEmailAllowlist
{
    public static string[] Parse(string? configuredEmails) =>
        (configuredEmails ?? string.Empty)
            .Split([',', ';'], StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

    public static bool Contains(string? configuredEmails, string? email) =>
        !string.IsNullOrWhiteSpace(email) && Parse(configuredEmails)
            .Contains(email.Trim(), StringComparer.OrdinalIgnoreCase);
}
