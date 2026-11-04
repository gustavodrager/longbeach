using System.Text.Json;

namespace LongBeach.Api;

internal static class StaffRecordFields
{
    private static readonly HashSet<string> AccessFields = new(StringComparer.OrdinalIgnoreCase)
    {
        "userId", "account", "access", "staffAccess", "accessTypeId", "typeId", "phoneLogin", "username",
        "password", "passwordHash", "initialPassword", "requiresFirstAccess", "requiresLocalPasswordChange",
        "canManageStaff", "roles", "permissions", "isOwner", "credentialVersion", "googleSubject",
        "googleEmail", "localPasswordEnabled", "initialAccessExpiresAtUtc", "staffMembership", "refreshTokens"
    };

    public static bool HasAccessFields(JsonElement body) => body.ValueKind == JsonValueKind.Object && body.EnumerateObject().Any(p =>
        AccessFields.Contains(p.Name) || p.Name.Contains("password", StringComparison.OrdinalIgnoreCase) || p.Name.Contains("secret", StringComparison.OrdinalIgnoreCase));
}
