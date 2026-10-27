using System.Net.Mail;
using Npgsql;

namespace LongBeach.Tools;

internal static class LocalPreview
{
    private const string ApplyArgument = "--apply-local-fixtures";
    private const string DatabaseVariable = "LONG_BEACH_LOCAL_TOOL_DATABASE_URL";

    public static string RequireDatabase(string[] arguments)
    {
        if (arguments.Length != 1 || arguments[0] != ApplyArgument)
        {
            throw new InvalidOperationException(
                $"A preparação de dados fictícios exige a invocação local explícita {ApplyArgument}.");
        }

        NpgsqlConnectionStringBuilder connection;
        try
        {
            connection = new NpgsqlConnectionStringBuilder(RequireEnvironment(DatabaseVariable));
        }
        catch (ArgumentException)
        {
            // Do not include the original exception or connection string: it can contain secrets.
            throw new InvalidOperationException($"{DatabaseVariable} deve ter formato de connection string Npgsql.");
        }

        var localHost = string.Equals(connection.Host, "localhost", StringComparison.OrdinalIgnoreCase)
            || connection.Host == "127.0.0.1";
        if (!localHost || connection.Port != 55439 || connection.Database != "longbeach_profiles_preview")
        {
            throw new InvalidOperationException(
                "Este utilitário aceita somente localhost/127.0.0.1:55439 e o banco fictício longbeach_profiles_preview.");
        }

        return connection.ConnectionString;
    }

    public static string RequirePassword() => RequireEnvironment("LONG_BEACH_PREVIEW_PASSWORD");

    public static string RequireEmail(string variable)
    {
        var value = RequireEnvironment(variable);
        if (!MailAddress.TryCreate(value, out var address)
            || !string.Equals(address.Address, value, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException($"{variable} deve conter somente um endereço de email válido.");
        }

        return address.Address.ToLowerInvariant();
    }

    private static string RequireEnvironment(string variable)
    {
        var value = Environment.GetEnvironmentVariable(variable);
        return string.IsNullOrWhiteSpace(value)
            ? throw new InvalidOperationException($"Defina {variable} no ambiente local antes de executar.")
            : value;
    }
}
