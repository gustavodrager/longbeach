using LongBeach.Application.Finance;
using LongBeach.Contracts.Finance;

namespace LongBeach.UnitTests;

public sealed class BankImportIdentityRulesTests
{
    private static FinancialObservation Row(string bank = "c6", string kind = "movement", char id = 'a', string account = "0123456789abcdef") =>
        new("financial-observation-v1", "BRL", $"bank-v1:{bank}:{account}:{kind}:{new string(id, 32)}",
            kind == "movement" ? bank + "-conta" : "saldos", kind == "movement" ? "entradas-extrato" : bank == "c6" ? "Saldo C6" : "Saldo Pagbank",
            "Descrição da origem", "Informado", new(2026, 10, 25), new(2026, 10, 25), kind == "movement" ? "day" : "snapshot", 1234, "");

    [Theory]
    [InlineData("c6", "movement")]
    [InlineData("pagbank", "movement")]
    [InlineData("c6", "balance")]
    [InlineData("pagbank", "balance")]
    public void Reads_only_valid_bank_identity_with_matching_observation(string bank, string kind)
    {
        var identity = BankImportIdentityRules.Read(Row(bank, kind));
        Assert.Equal(new BankImportIdentity(bank, "0123456789abcdef", kind, new string('a', 32)), identity);
    }

    [Fact] public void Ordinary_source_cells_are_not_bank_identities() =>
        Assert.Null(BankImportIdentityRules.Read(Row() with { SourceCell = "Extrato!A2" }));

    [Theory]
    [InlineData("entradas-extrato", -1)]
    [InlineData("saidas-extrato", 1)]
    public void Rejects_signs_inconsistent_with_the_direction(string metric, long amount) =>
        Assert.Throws<FinancialRuleException>(() => BankImportIdentityRules.Read(Row() with { Metric = metric, AmountCents = amount }));

    [Fact] public void Accepts_negative_outgoing_movements_zero_movements_and_zero_or_negative_snapshots()
    {
        Assert.NotNull(BankImportIdentityRules.Read(Row() with { Metric = "saidas-extrato", AmountCents = -1 }));
        Assert.NotNull(BankImportIdentityRules.Read(Row() with { AmountCents = 0 }));
        Assert.NotNull(BankImportIdentityRules.Read(Row() with { Metric = "saidas-extrato", AmountCents = 0 }));
        Assert.NotNull(BankImportIdentityRules.Read(Row(kind: "balance") with { AmountCents = 0 }));
        Assert.NotNull(BankImportIdentityRules.Read(Row(kind: "balance") with { AmountCents = -1 }));
    }

    [Theory]
    [InlineData("bank-v1:c6:0123456789abcdef:movement:abc")]
    [InlineData("BANK-V1:c6:0123456789abcdef:movement:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")]
    [InlineData("bank-v1:other:0123456789abcdef:movement:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")]
    [InlineData("bank-v1:c6:0123456789ABCDEF:movement:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")]
    [InlineData("bank-v1:c6:0123456789abcdef:other:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")]
    [InlineData("bank-v1:c6:0123456789abcdef:movement:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaag")]
    public void Rejects_malformed_reserved_identity(string sourceCell) =>
        Assert.Throws<FinancialRuleException>(() => BankImportIdentityRules.Read(Row() with { SourceCell = sourceCell }));

    [Fact] public void Rejects_bank_identity_on_other_controls_metrics_or_grains()
    {
        FinancialObservation[] invalid = [Row() with { Series = "alunos" }, Row() with { Metric = "Saldo C6" },
            Row() with { Grain = "snapshot" }, Row() with { PeriodEnd = new(2026, 10, 26) },
            Row("pagbank", "balance") with { Metric = "Saldo C6" }, Row("c6", "balance") with { Series = "c6-conta" }];
        Assert.All(invalid, item => Assert.Throws<FinancialRuleException>(() => BankImportIdentityRules.Read(item)));
    }

    [Fact] public void Distinct_bank_movements_can_share_a_date_but_old_aggregates_cannot()
    {
        var row = Row();
        Assert.True(BankImportIdentityRules.MayOverlap(row, Row(id: 'b')));
        Assert.True(BankImportIdentityRules.MayOverlap(row, Row(account: "fedcba9876543210")));
        Assert.False(BankImportIdentityRules.MayOverlap(row, row with { SourceCell = "Extrato!A2" }));
        Assert.False(BankImportIdentityRules.MayOverlap(row with { SourceCell = "Extrato!A2" }, row));
    }

    [Fact] public void Same_account_snapshot_date_cannot_be_reintroduced_with_another_id()
    {
        var row = Row(kind: "balance");
        Assert.True(BankImportIdentityRules.MayOverlap(row, row));
        Assert.False(BankImportIdentityRules.MayOverlap(row, Row(kind: "balance", id: 'b')));
        Assert.True(BankImportIdentityRules.MayOverlap(row, Row(kind: "balance", account: "fedcba9876543210")));
    }
}
