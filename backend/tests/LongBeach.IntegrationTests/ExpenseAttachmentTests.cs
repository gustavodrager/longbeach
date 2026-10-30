using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using LongBeach.Application.Abstractions;
using LongBeach.Contracts.Finance;
using LongBeach.Domain.Finance;
using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.Auditing;
using LongBeach.Infrastructure.Finance;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using static LongBeach.IntegrationTests.OperationalPostgresTests;

namespace LongBeach.IntegrationTests;

public sealed class ExpenseAttachmentTests
{
    [Fact]
    public async Task Files_require_finance_permissions_even_when_public_demo_is_enabled()
    {
        await using var factory = new LongBeachWebApplicationFactory().WithWebHostBuilder(builder => builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?> { ["DemoMode:PublicOperationalData"] = "true" })));
        using var client = factory.CreateClient();
        var route = $"/api/v1/expenses/{Guid.NewGuid()}/attachments";
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(route)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync(route, Input())).StatusCode);
        client.DefaultRequestHeaders.Authorization = Header("Operations", "bar:sales:operate");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(route)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(route + "/" + Guid.NewGuid())).StatusCode);
        client.DefaultRequestHeaders.Authorization = Header("Operations", "finance:read");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(route, Input())).StatusCode);
        client.DefaultRequestHeaders.Authorization = Header("Operations", "finance:write");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(route, Input())).StatusCode);
    }

    [PostgresFact]
    public async Task Documents_are_idempotent_isolated_audited_and_do_not_change_expense_balance()
    {
        await using var fixture = await IsolatedBarDatabase.Create(new AuditSaveChangesInterceptor(new NullAuditContext(), TimeProvider.System));
        var db = fixture.Context;
        var expense = new OperationalRecord(Guid.NewGuid(), "financeEntries", "Despesa fictícia", "{\"direction\":\"Pagar\",\"amount\":600,\"status\":\"Pendente\"}");
        var other = new OperationalRecord(Guid.NewGuid(), "financeEntries", "Outra despesa fictícia", "{\"direction\":\"Pagar\",\"amount\":100}");
        var incoming = new OperationalRecord(Guid.NewGuid(), "financeEntries", "Recebimento fictício", "{\"direction\":\"Receber\",\"amount\":100}");
        db.AddRange(expense, other, incoming);
        await db.SaveChangesAsync();
        var service = new ExpenseAttachmentsService(db);
        var input = Input(); var actor = Guid.NewGuid();
        var uploaded = await service.Add(expense.Id, input, actor, default);
        Assert.Equal(uploaded.Id, (await service.Add(expense.Id, input, actor, default)).Id);
        Assert.Single(await service.List(expense.Id, default));
        var original = await service.Download(expense.Id, uploaded.Id, default);
        Assert.Equal(input.ContentBase64, original.ContentBase64);
        await Assert.ThrowsAsync<ExpenseAttachmentRuleException>(() => service.Add(expense.Id, input with { ContentBase64 = Convert.ToBase64String(Encoding.UTF8.GetBytes("%PDF-1.7\nchanged")) }, actor, default));
        await Assert.ThrowsAsync<ExpenseAttachmentRuleException>(() => service.Add(other.Id, input, actor, default));
        await Assert.ThrowsAsync<KeyNotFoundException>(() => service.Download(other.Id, uploaded.Id, default));
        await Assert.ThrowsAsync<ExpenseAttachmentRuleException>(() => service.Add(incoming.Id, Input(), actor, default));
        await Assert.ThrowsAsync<KeyNotFoundException>(() => service.Add(Guid.NewGuid(), Input(), actor, default));
        Assert.Equal(600, JsonDocument.Parse((await db.OperationalRecords.SingleAsync(x => x.Id == expense.Id)).Payload).RootElement.GetProperty("amount").GetInt32());
        Assert.DoesNotContain(await db.OperationalRecords.ToListAsync(), x => x.Kind == "expensePayments");
        var audit = await db.AuditLogs.SingleAsync(x => x.Resource == nameof(ExpenseAttachment));
        Assert.Contains("OMITTED", audit.MetadataJson);
        Assert.DoesNotContain(input.ContentBase64, audit.MetadataJson);
        Assert.DoesNotContain(input.FileName, audit.MetadataJson);
        Assert.DoesNotContain("ContentBase64", audit.MetadataJson);
    }

    [PostgresFact]
    public async Task File_api_uploads_lists_and_downloads_only_under_the_correct_expense()
    {
        await using var fixture = await IsolatedBarDatabase.Create();
        var db = fixture.Context;
        var expense = new OperationalRecord(Guid.NewGuid(), "financeEntries", "Compra fictícia", "{\"direction\":\"Pagar\",\"amount\":600}");
        var other = new OperationalRecord(Guid.NewGuid(), "financeEntries", "Outra compra fictícia", "{\"direction\":\"Pagar\",\"amount\":100}");
        db.AddRange(expense, other); await db.SaveChangesAsync();
        var connection = db.Database.GetConnectionString();
        await using var factory = new LongBeachWebApplicationFactory().WithWebHostBuilder(builder => builder
            .ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:LongBeach"] = connection }))
            .ConfigureServices(services => services.AddDbContext<LongBeachDbContext>(options => options.UseNpgsql(connection))));
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = Header("Manager");
        var route = $"/api/v1/expenses/{expense.Id}/attachments";
        var input = Input();
        var response = await client.PostAsJsonAsync(route, input);
        response.EnsureSuccessStatusCode();
        var row = (await response.Content.ReadFromJsonAsync<ExpenseAttachmentRow>())!;
        var replay = await client.PostAsJsonAsync(route, input);
        replay.EnsureSuccessStatusCode();
        Assert.Equal(row.Id, (await replay.Content.ReadFromJsonAsync<ExpenseAttachmentRow>())!.Id);
        client.DefaultRequestHeaders.Authorization = Header("Manager");
        Assert.Single((await client.GetFromJsonAsync<ExpenseAttachmentRow[]>(route))!);
        var original = (await client.GetFromJsonAsync<ExpenseAttachmentDownload>(route + "/" + row.Id))!;
        Assert.Equal(input.ContentBase64, original.ContentBase64);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/v1/expenses/{other.Id}/attachments/{row.Id}")).StatusCode);
        client.DefaultRequestHeaders.Authorization = Header("Operations", "finance:write");
        var invalid = await client.PostAsJsonAsync(route, Input());
        Assert.Equal(HttpStatusCode.Forbidden, invalid.StatusCode);
    }

    private static ExpenseAttachmentInput Input() => new(Guid.NewGuid(), "comprovante-ficticio.pdf", Convert.ToBase64String(Encoding.UTF8.GetBytes("%PDF-1.7\nfictional-test-receipt")));
}
