using LongBeach.Application.Finance;
using Microsoft.Extensions.Configuration;

namespace LongBeach.Infrastructure.Finance;

public sealed record C6FinanceScope(string Environment, string Account)
{
    public static C6FinanceScope Read(IConfiguration config)
    {
        var environment = config["Integrations:C6:Environment"] ?? "Sandbox";
        var account = config["Integrations:C6:AccountId"] ?? "";
        if (environment is not ("Sandbox" or "Production") || account.Length > 80 || account.Any(char.IsControl))
            throw new FinancialRuleException("Confira o ambiente e a identificação da conta C6.");
        return new(environment, account);
    }

    public static bool Enabled(IConfiguration config) => config.GetValue("Integrations:C6:Enabled", false)
        && config.GetValue("Integrations:C6:BankingEnabled", false);

    public static DateOnly Today(TimeProvider time) => DateOnly.FromDateTime(
        TimeZoneInfo.ConvertTime(time.GetUtcNow(), TimeZoneInfo.FindSystemTimeZoneById("America/Sao_Paulo")).DateTime);
}
