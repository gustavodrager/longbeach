using System.Globalization;
using Microsoft.Extensions.Configuration;

namespace LongBeach.Infrastructure.Finance;

// Shared by collection and diagnostics: never include configuration values in errors.
public static class PagBankEdiConfiguration
{
    public static IReadOnlyList<string> Problems(IConfiguration config, DateOnly yesterday)
    {
        var problems = new List<string>();
        var user = config["Integrations:PagBankEdi:User"];
        if (string.IsNullOrWhiteSpace(user) || !user.All(char.IsAsciiDigit))
            problems.Add("Informe o número do estabelecimento EDI, somente com dígitos.");
        var token = config["Integrations:PagBankEdi:Token"];
        if (string.IsNullOrWhiteSpace(token) || token.Any(char.IsWhiteSpace))
            problems.Add("Configure a credencial específica do EDI, sem espaços ou quebras de linha.");
        if (!DateOnly.TryParseExact(config["Integrations:PagBankEdi:StartDate"], "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var start)
            || start < new DateOnly(2000, 1, 1) || start > yesterday)
            problems.Add("Defina a data inicial do histórico EDI (AAAA-MM-DD), entre 2000-01-01 e ontem.");
        return problems;
    }
}
