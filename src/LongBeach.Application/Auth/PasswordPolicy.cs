namespace LongBeach.Application.Auth;

public static class PasswordPolicy
{
    public const int MinimumLength = 14;
    public const int MaximumLength = 256;

    public static void EnsureStrong(string password)
    {
        if (string.IsNullOrWhiteSpace(password) || password.Length < MinimumLength)
        {
            throw new WeakPasswordException(
                $"The new password must contain at least {MinimumLength} characters.");
        }

        if (password.Length > MaximumLength)
        {
            throw new WeakPasswordException(
                $"The new password must contain at most {MaximumLength} characters.");
        }

        if (!password.Any(char.IsLower) ||
            !password.Any(char.IsUpper) ||
            !password.Any(char.IsDigit) ||
            !password.Any(character => !char.IsLetterOrDigit(character)))
        {
            throw new WeakPasswordException(
                "The new password must include uppercase and lowercase letters, a number, and a symbol.");
        }
    }
}
