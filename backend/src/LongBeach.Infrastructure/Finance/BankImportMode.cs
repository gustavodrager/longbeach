using LongBeach.Domain.Bar;
using Microsoft.Extensions.Configuration;

namespace LongBeach.Infrastructure.Finance;

public static class BankImportMode
{
    public const string Key = "Integrations:Banking:ImportOnly";
    public const string State = "Importação de arquivos";
    public const string Message = "Integrações bancárias em modo de importação de arquivos. Consultas, cobranças e estornos online estão suspensos; o histórico e as operações em confirmação foram preservados.";

    public static bool Enabled(IConfiguration? config) => config?.GetValue(Key, false) ?? false;

    public static void RequireApi(IConfiguration? config)
    {
        if (Enabled(config)) throw new BarRuleException(Message);
    }
}
