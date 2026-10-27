using System.Text.Json;
using LongBeach.Application.Finance;
using LongBeach.Contracts.Finance;
namespace LongBeach.Infrastructure.Finance;

public sealed partial class FinancialHistoryService
{
    private async Task<EdiWalletSnapshot> WalletBalance(DateOnly today, CancellationToken ct)
    {
        var documents = new List<EdiBalanceDocument>();
        DateOnly? day = null; DateTimeOffset? collected = null;
        await using var command = await Command("""
            WITH latest_day AS (
                SELECT MAX(movement_date) AS day FROM provider_documents
                WHERE provider='pagbank-edi' AND movement='balances' AND validated=true AND movement_date<@p0
                  AND movement_date <= (SELECT complete_through FROM provider_sync_state WHERE provider='pagbank-edi')
            ), latest_collection AS (
                SELECT MAX(fetched_at_utc) AS collected FROM provider_documents
                WHERE provider='pagbank-edi' AND movement='balances' AND validated=true AND movement_date=(SELECT day FROM latest_day)
            )
            SELECT movement_date,fetched_at_utc,page_number,source_sha256,payload::text
            FROM provider_documents WHERE provider='pagbank-edi' AND movement='balances' AND validated=true
              AND movement_date=(SELECT day FROM latest_day) AND fetched_at_utc=(SELECT collected FROM latest_collection)
            ORDER BY page_number
            """, ct, today);
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            day = reader.GetFieldValue<DateOnly>(0); collected = reader.GetFieldValue<DateTimeOffset>(1);
            using var json = JsonDocument.Parse(reader.GetString(4));
            documents.Add(new(reader.GetInt32(2), reader.GetString(3).Trim(), json.RootElement.Clone()));
        }
        return day is null ? new(null, null, null, [], "Aguardando coleta EDI validada.")
            : EdiWalletBalanceRules.Read(day.Value, collected!.Value, documents, config["Integrations:PagBankEdi:User"] ?? "", today);
    }
}
