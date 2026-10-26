using LongBeach.Contracts.Finance;

namespace LongBeach.Application.Finance;

public sealed record BankImportIdentity(string Bank, string Account, string Kind, string Id);

public static class BankImportIdentityRules
{
    public static BankImportIdentity? Read(FinancialObservation item)
    {
        if (!item.SourceCell.StartsWith("bank-v1", StringComparison.OrdinalIgnoreCase)) return null;
        var parts = item.SourceCell.Split(':');
        if (parts.Length != 5 || parts[0] != "bank-v1" || parts[1] is not ("pagbank" or "c6") ||
            !LowerHex(parts[2], 16) || parts[3] is not ("movement" or "balance") || !LowerHex(parts[4], 32))
            throw new FinancialRuleException("Identidade da observação bancária inválida. Confira banco, conta e identificador da origem.");
        var movement = parts[3] == "movement";
        var expectedSeries = movement ? parts[1] + "-conta" : "saldos";
        var expectedBalanceMetric = parts[1] == "c6" ? "Saldo C6" : "Saldo Pagbank";
        if (item.Series != expectedSeries || item.Grain != (movement ? "day" : "snapshot") || item.PeriodStart != item.PeriodEnd ||
            (movement ? item.Metric is not ("entradas-extrato" or "saidas-extrato") : item.Metric != expectedBalanceMetric))
            throw new FinancialRuleException("A identidade bancária não corresponde ao controle, métrica e período informados.");
        if (movement && (item.Metric == "entradas-extrato" ? item.AmountCents < 0 : item.AmountCents > 0))
            throw new FinancialRuleException("O sinal do movimento bancário não corresponde à entrada ou saída informada.");
        return new(parts[1], parts[2], parts[3], parts[4]);
    }

    public static bool MayOverlap(FinancialObservation first, FinancialObservation second)
    {
        var left = Read(first); var right = Read(second);
        if (left is null || right is null) return false;
        // Different movements can occur on the same day. One account has only one snapshot per date.
        return first.SourceCell == second.SourceCell || left.Kind == "movement" && right.Kind == "movement" ||
            left.Kind == "balance" && right.Kind == "balance" &&
            (left.Bank != right.Bank || left.Account != right.Account || first.PeriodStart != second.PeriodStart);
    }

    private static bool LowerHex(string value, int length) => value.Length == length &&
        value.All(c => c is >= '0' and <= '9' or >= 'a' and <= 'f');
}
