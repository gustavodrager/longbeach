namespace LongBeach.Contracts.Auth;

public sealed record ChangePasswordRequest(string? CurrentPassword, string? NewPassword);

public sealed record ChangePasswordResponse(string Message, bool RequiresReauthentication);
