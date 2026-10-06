using System.Text.Json;
using LongBeach.Application.Finance;
using LongBeach.Contracts.Finance;
namespace LongBeach.UnitTests;
public sealed class FinancialHistoryRulesTests
{
    private static FinancialObservation Row(string grain="month",int month=8,string state="Não Pago",long amount=12345)=>new("financial-observation-v1","BRL","Teste!G2","alunos","valor-informado","Aluno teste",state,new(2026,month,1),grain is "month" or "estimate"?new DateOnly(2026,month,1).AddMonths(1).AddDays(-1):new(2026,month,1),grain,amount,"");
    [Fact] public void Preserves_unpaid_status_and_centavos()=>Assert.Equal(Row(),FinancialHistoryRules.Parse(JsonSerializer.SerializeToElement(Row())));
    [Fact] public void Totals_do_not_mix_periods_estimates_or_snapshots()
    {
        var totals=FinancialHistoryRules.Totals([Row(),Row(month:7),Row(grain:"estimate"),Row(grain:"snapshot"),Row(grain:"snapshot") with{PeriodStart=new(2026,8,2),PeriodEnd=new(2026,8,2)}]);
        Assert.Equal(5,totals.Length);Assert.All(totals,x=>Assert.Equal(12345,x.AmountCents));
    }
    [Fact] public void Totals_do_not_mix_overlapping_controls_or_statuses()=>Assert.Equal(3,FinancialHistoryRules.Totals([Row(),Row(state:"Pago"),Row() with{Series="consolidado"}]).Length);
    [Theory][InlineData("day")][InlineData("snapshot")] public void Rejects_daily_records_with_month_range(string grain)=>Assert.Throws<FinancialRuleException>(()=>FinancialHistoryRules.Parse(JsonSerializer.SerializeToElement(Row() with{Grain=grain})));
    [Fact] public void Rejects_unknown_currency_and_incomplete_month()
    {
        Assert.Throws<FinancialRuleException>(()=>FinancialHistoryRules.Parse(JsonSerializer.SerializeToElement(Row() with{Currency="USD"})));
        Assert.Throws<FinancialRuleException>(()=>FinancialHistoryRules.Parse(JsonSerializer.SerializeToElement(Row() with{PeriodEnd=new(2026,8,20)})));
    }
    [Fact] public void Fingerprint_is_stable_for_order_but_changes_with_status()
    {
        var first=Row();var second=Row(month:7) with{SourceCell="Teste!G3"};
        Assert.Equal(FinancialHistoryRules.Fingerprint("source",[first,second]),FinancialHistoryRules.Fingerprint("source",[second,first]));
        Assert.NotEqual(FinancialHistoryRules.Fingerprint("source",[first]),FinancialHistoryRules.Fingerprint("source",[first with{State="Pago"}]));
    }
    [Fact] public void Edi_rejects_foreign_merchants_and_inconsistent_pagination()
    {
        var json=JsonSerializer.SerializeToElement(new{detalhes=new[]{new{estabelecimento="123"}},pagination=new{page=1,totalPages=1,totalElements=1}});
        Assert.Single(PagBankEdiRules.Parse(json,1,"123").Details);
        Assert.Throws<FinancialRuleException>(()=>PagBankEdiRules.Parse(json,1,"999"));
        Assert.Throws<FinancialRuleException>(()=>PagBankEdiRules.Parse(json,2,"123"));
    }
}
