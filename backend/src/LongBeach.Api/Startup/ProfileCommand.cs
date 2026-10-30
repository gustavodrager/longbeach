namespace LongBeach.Api.Startup;

public enum ProfileCommand { None, Preview, Apply }

public static class ProfileCommandParser
{
    public static ProfileCommand Parse(string[] args)
    {
        var preview = args.Contains("--preview-profiles", StringComparer.OrdinalIgnoreCase);
        var apply = args.Contains("--consolidate-profiles", StringComparer.OrdinalIgnoreCase);
        if (!preview && !apply) return ProfileCommand.None;
        if (preview && apply || args.Distinct(StringComparer.OrdinalIgnoreCase).Count() != args.Length ||
            args.Any(arg => !new[] { "--preview-profiles", "--consolidate-profiles", "--provision-from-stdin" }.Contains(arg, StringComparer.OrdinalIgnoreCase)))
            throw new InvalidOperationException("Run profile preview or consolidation as its own command.");
        if (apply && !args.Contains("--provision-from-stdin", StringComparer.OrdinalIgnoreCase))
            throw new InvalidOperationException("Profile consolidation requires a reviewed mapping from standard input.");
        return preview ? ProfileCommand.Preview : ProfileCommand.Apply;
    }
}
