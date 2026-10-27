using System.Text.Json;
using LongBeach.Application.Finance;

namespace LongBeach.UnitTests;

public sealed class PagBankEdiRulesTests
{
    [Theory]
    [InlineData("123")]
    [InlineData("\"123\"")]
    public void Accepts_the_same_merchant_as_integer_or_string(string merchant)
    {
        var page=Parse(merchant);
        Assert.Single(page.Details);
        Assert.Equal(1,page.TotalElements);
    }

    [Theory]
    [InlineData("999")]
    [InlineData("\"999\"")]
    [InlineData("123.5")]
    [InlineData("1.23e2")]
    [InlineData("null")]
    [InlineData("true")]
    [InlineData("{}")]
    [InlineData("[]")]
    [InlineData("-123")]
    [InlineData("9223372036854775808")]
    public void Rejects_other_merchants_and_invalid_identifier_types(string merchant)
    {
        Assert.Equal("EDI_MERCHANT_MISMATCH",Assert.Throws<FinancialRuleException>(()=>Parse(merchant)).Message);
    }

    private static EdiPage Parse(string merchant)
    {
        using var json=JsonDocument.Parse("{\"detalhes\":[{\"estabelecimento\":"+merchant+",\"tipo_evento\":1,\"valor_saldo\":0}],\"pagination\":{\"page\":1,\"totalPages\":1,\"totalElements\":1}}");
        return PagBankEdiRules.Parse(json.RootElement,1,"123");
    }
}
