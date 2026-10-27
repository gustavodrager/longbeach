using System.Text.Json;
namespace LongBeach.Application.Finance;

public sealed record EdiPage(int Page,int TotalPages,int TotalElements,IReadOnlyList<JsonElement> Details);
public static class PagBankEdiRules
{
    public static EdiPage Parse(JsonElement root,int expectedPage,string merchant)
    {
        try
        {
            var pagination=root.GetProperty("pagination"); var page=pagination.GetProperty("page").GetInt32();
            var totalPages=pagination.GetProperty("totalPages").GetInt32(); var totalElements=pagination.GetProperty("totalElements").GetInt32();
            var details=root.GetProperty("detalhes").EnumerateArray().Select(x=>x.Clone()).ToArray();
            if(page!=expectedPage || totalPages is < 0 or > 1000 || page>Math.Max(totalPages,1) || totalElements is < 0 or > 1000000 || details.Length>1000)
                throw new FinancialRuleException("EDI_PAGINATION");
            foreach(var detail in details)
                if(detail.ValueKind!=JsonValueKind.Object || !detail.TryGetProperty("estabelecimento",out var value) || !MatchesMerchant(value,merchant))
                    throw new FinancialRuleException("EDI_MERCHANT_MISMATCH");
            return new(page,Math.Max(totalPages,1),totalElements,details);
        }
        catch(Exception e) when(e is JsonException or KeyNotFoundException or InvalidOperationException or FormatException)
        { throw new FinancialRuleException("EDI_SCHEMA"); }
    }
    // Balances use a JSON integer; the other feeds may use a string. Never coerce
    // fractions, exponents, nulls or other JSON types into a merchant identifier.
    private static bool MatchesMerchant(JsonElement value,string merchant) => value.ValueKind switch
    {
        JsonValueKind.String => value.GetString()==merchant,
        JsonValueKind.Number => value.TryGetInt64(out var number) && number>=0
            && number.ToString(System.Globalization.CultureInfo.InvariantCulture)==merchant,
        _ => false
    };
}
