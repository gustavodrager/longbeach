namespace LongBeach.Api.Startup;

public enum StartupCommand
{
    Run,
    MigrateOnly
}

public static class StartupCommandParser
{
    private const string MigrateOnlyArgument = "--migrate-only";

    public static StartupCommand Parse(IEnumerable<string> arguments) =>
        arguments.Contains(MigrateOnlyArgument, StringComparer.OrdinalIgnoreCase)
            ? StartupCommand.MigrateOnly
            : StartupCommand.Run;
}
