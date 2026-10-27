using System.Text.Json;
using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.Persistence;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using static LongBeach.IntegrationTests.OperationalPostgresTests;

namespace LongBeach.IntegrationTests;

public sealed class OperationalAuditPostgresTests
{
    private static async Task<JsonElement> Audit()
    {
        var file = await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "auditar-operacao.sql"));
        var sql = file[file.IndexOf("BEGIN TRANSACTION", StringComparison.Ordinal)..].Replace(":'month'", "@auditMonth");
        await using var connection = new NpgsqlConnection(Environment.GetEnvironmentVariable("LONG_BEACH_TEST_DATABASE_URL"));
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("auditMonth", "2222-02");
        var text = (string)(await command.ExecuteScalarAsync())!;
        return JsonDocument.Parse(text).RootElement.Clone();
    }
    private static long Count(JsonElement result, string code) => result.GetProperty("checks").EnumerateArray()
        .Single(row => row.GetProperty("code").GetString() == code).GetProperty("count").GetInt64();

    [PostgresFact]
    public async Task Read_only_audit_distinguishes_integrity_errors_from_pending_billing_and_omits_personal_data()
    {
        await using var factory = Factory(); await Migrate(factory);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<LongBeachDbContext>();
        var before = await Audit();
        var court = Guid.NewGuid().ToString(); var group = Guid.NewGuid().ToString();
        var monthId = Guid.NewGuid(); var first = Guid.NewGuid();
        OperationalRecord Row(Guid id, string kind, object payload) => new(id, kind, "Private fixture name", JsonSerializer.Serialize(payload));
        object Reservation(string status) => new { courtId = court, date = "2222-02-02", startTime = "22:00", endTime = "24:00", status, rentalGroupId = group, rentalMonth = "2222-02" };
        object Charge() => new { status = "Pendente", sourceKind = "rentalMonths", sourceId = monthId.ToString(), month = "2222-02" };
        var rows = new[] {
            Row(monthId,"rentalMonths",new { rentalGroupId=group, month="2222-02", dates=new[]{"2222-02-02","2222-02-09","2222-02-16","2222-02-23"}, amount=(decimal?)null, dueDate="" }),
            Row(first,"reservations",Reservation("Confirmada")),
            Row(Guid.NewGuid(),"reservations",Reservation("Confirmada")),
            Row(Guid.NewGuid(),"reservations",Reservation("Cancelada")),
            Row(Guid.NewGuid(),"financeEntries",Charge()), Row(Guid.NewGuid(),"financeEntries",Charge()),
            Row(Guid.NewGuid(),"financeEntries",new { status="Pendente",sourceKind="reservations",sourceId=first.ToString() })
        };
        db.AddRange(rows); await db.SaveChangesAsync();
        try
        {
            var report = await Audit();
            Assert.Equal("on", report.GetProperty("readOnly").GetString());
            foreach(var code in new[]{"conflitos_agenda","cobrancas_duplicadas_competencia","cobrancas_individuais_de_mensalista","competencias_sem_grupo","competencias_com_encontros_ausentes","competencias_com_valor_ou_vencimento_pendente"})
                Assert.Equal(Count(before,code)+1,Count(report,code));
            Assert.Equal(Count(before,"encontros_sem_competencia"),Count(report,"encontros_sem_competencia"));
            Assert.DoesNotContain("Private fixture name",report.GetRawText());
            Assert.DoesNotContain(group,report.GetRawText());
            var repeated=await Audit();
            Assert.Equal(report.GetProperty("checks").GetRawText(),repeated.GetProperty("checks").GetRawText());
        }
        finally { db.RemoveRange(rows); await db.SaveChangesAsync(); }
    }
}
