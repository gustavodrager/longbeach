using System.Text.Json;
using LongBeach.Application.Finance;
namespace LongBeach.UnitTests;
public sealed class EdiWalletBalanceRulesTests
{
    private static EdiBalanceDocument Doc(string details, int total = 2, int page = 1, int pages = 1) =>
        new(page, "source", JsonDocument.Parse($"{{\"pagination\":{{\"page\":{page},\"totalPages\":{pages},\"totalElements\":{total}}},\"detalhes\":[{details}]}}").RootElement.Clone());
    private static string Row(int kind, string amount, string day = "2026-10-12", int merchant = 123) =>
        $"{{\"estabelecimento\":{merchant},\"tipo_evento\":{kind},\"valor_saldo\":{amount},\"data_movimentacao\":\"{day}\"}}";
    [Fact] public void Closing_wallet_is_not_added_to_opening_or_bank_account()
    {
        var result = EdiWalletBalanceRules.Read(new(2026,10,12), DateTimeOffset.UtcNow, [Doc(Row(7,"500")+","+Row(8,"12.34"))], "123", new(2026,10,13));
        Assert.Equal(1234,result.AmountCents); Assert.Null(result.Issue);
    }
    [Theory] [InlineData("0",0)] [InlineData("-1.23",-123)]
    public void Zero_and_signed_balance_are_preserved(string value, long expected)
        => Assert.Equal(expected,EdiWalletBalanceRules.Read(new(2026,10,12),DateTimeOffset.UtcNow,[Doc(Row(8,value),1)],"123",new(2026,10,13)).AmountCents);
    [Fact] public void Missing_duplicate_or_untrusted_closing_never_becomes_zero()
    {
        var invalid = new[] { Doc(Row(7,"1"),1), Doc(Row(8,"1")+","+Row(8,"2")), Doc(Row(8,"1.001"),1), Doc(Row(8,"1","2026-10-11"),1), Doc(Row(8,"1",merchant:999),1), Doc(Row(8,"1"),2), Doc(Row(8,"1"),1,1,2) };
        foreach(var doc in invalid) { var result=EdiWalletBalanceRules.Read(new(2026,10,12),DateTimeOffset.UtcNow,[doc],"123",new(2026,10,13)); Assert.Null(result.AmountCents); Assert.NotNull(result.Issue); }
    }
    [Fact] public void Today_is_incomplete_and_older_balance_is_explicitly_stale()
    {
        var docs=new[]{Doc(Row(8,"1"),1)};
        Assert.Null(EdiWalletBalanceRules.Read(new(2026,10,12),DateTimeOffset.UtcNow,docs,"123",new(2026,10,12)).AmountCents);
        Assert.Contains("atrasada",EdiWalletBalanceRules.Read(new(2026,10,12),DateTimeOffset.UtcNow,docs,"123",new(2026,10,14)).Issue);
    }
}
