using System.Net;
using System.Net.Http.Json;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using LongBeach.Application.Fiscal;
using LongBeach.Contracts.Fiscal;
using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Fiscal;
using LongBeach.Domain.Inventory;
using LongBeach.Domain.Purchases;
using LongBeach.Infrastructure.Bar;
using LongBeach.Infrastructure.Fiscal;
using LongBeach.Infrastructure.Persistence;
using LongBeach.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;

namespace LongBeach.IntegrationTests;
public sealed class ReceivedInvoicesTests
{
    private static string Connection => Environment.GetEnvironmentVariable("LONG_BEACH_TEST_DATABASE_URL")!;
    private static LongBeachDbContext Db() => new(new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql(Connection).Options, TimeProvider.System);
    private static IConfiguration Config() => new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
    { ["Fiscal:RecipientCnpj"] = InvoiceFixture.Recipient, ["Fiscal:Environment"] = "2" }).Build();
    private static InvoiceUpload Upload(int number) => new("teste.xml", Convert.ToBase64String(InvoiceFixture.Bytes(number)));
    private static int Number() => Random.Shared.Next(10000, 99999999);
    private static async Task Migrate() { await using var db = Db(); await db.Database.MigrateAsync(); }
    private static ReceivedInvoicesService Service(LongBeachDbContext db) => new(db, Config());

    [PostgresFact]
    public async Task Concurrent_imports_preserve_one_original_and_do_not_create_purchases_or_movements()
    {
        await Migrate(); var number = Number(); var actor = Guid.NewGuid();
        async Task<InvoiceImportResult> Import() { await using var db = Db(); return await Service(db).Import(Upload(number), actor, default); }
        var results = await Task.WhenAll(Import(), Import());
        Assert.Equal(results[0].Invoice.Id, results[1].Invoice.Id); Assert.Single(results, x => x.AlreadyImported);
        await using var check = Db(); var service = Service(check);
        Assert.Null((await service.Detail(results[0].Invoice.Id, default)).PurchaseId);
        Assert.Equal(InvoiceFixture.Bytes(number), (await service.Original(results[0].Invoice.Id, default)).Content);
        Assert.False(await check.Set<Purchase>().AnyAsync(x => x.Document == results[0].Invoice.Data.AccessKey));
        var changed = Upload(number) with { ContentBase64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(InvoiceFixture.Xml(number).Replace("Água teste", "Produto alterado"))) };
        await Assert.ThrowsAsync<InvoiceRuleException>(() => service.Import(changed, actor, default));
        Assert.Equal(InvoiceFixture.Bytes(number), (await service.Original(results[0].Invoice.Id, default)).Content);
        await Assert.ThrowsAsync<Npgsql.PostgresException>(() => check.Database.ExecuteSqlInterpolatedAsync($"UPDATE received_invoices SET \"DataJson\"='{{}}' WHERE \"Id\"={results[0].Invoice.Id}"));
    }

    [PostgresFact]
    public async Task Confirmed_purchase_is_idempotent_and_only_explicit_receipt_changes_stock()
    {
        await Migrate(); var actor = Guid.NewGuid(); var number = Number(); Guid productId; int version;
        await using (var db = Db())
        {
            var category = new BarProductCategory("Nota teste " + Guid.NewGuid()); db.Add(category);
            var product = new BarProduct(Guid.NewGuid().ToString("N"), "Água teste", "Água", category.Id, "un", "CX", 12, 5, 0, 0, true, false, 0);
            db.Add(product); await db.SaveChangesAsync(); productId = product.Id; version = product.Version;
        }
        Guid invoiceId;
        await using (var db = Db())
        {
            var invoice = (await Service(db).Import(Upload(number), actor, default)).Invoice;
            invoiceId = invoice.Id;
            await Service(db).Classify(invoiceId, new("Bar", invoice.ReviewVersion), default);
        }
        var input = new InvoicePurchaseInput(Guid.Empty, [new(1, productId, version, 2)], true, 2);
        Guid purchaseId;
        await using (var db = Db()) purchaseId = await Service(db).CreatePurchase(invoiceId, input, actor, default);
        await using (var db = Db())
        {
            Assert.Equal(purchaseId, await Service(db).CreatePurchase(invoiceId, input, actor, default));
            await Assert.ThrowsAsync<InvoiceRuleException>(() => Service(db).Classify(invoiceId, new("Equipment", 3), default));
            await Assert.ThrowsAsync<InvoiceRuleException>(() => Service(db).CreatePurchase(invoiceId, input with { Items = [new(1, productId, version, 3)] }, actor, default));
        }
        await using (var db = Db())
        {
            var purchase = await db.Set<Purchase>().Include(x => x.Items).SingleAsync(x => x.Id == purchaseId);
            Assert.Equal(50, purchase.Total); Assert.Equal("Ordered", purchase.State); Assert.Equal("Pending", purchase.PaymentMethod);
            Assert.Equal(12, purchase.Items.Single().Conversion); Assert.Equal(50, purchase.Items.Single().LandedTotal);
            Assert.False(await db.Set<StockMovement>().AnyAsync(x => x.ProductId == productId));
            await new BarPurchasesService(db).Receive(purchaseId, new(StockModel.Bar, Guid.NewGuid(), [new(productId, 1)]), actor, default);
        }
        await using (var db = Db())
        {
            Assert.Equal(12, (await db.Set<StockBalance>().SingleAsync(x => x.ProductId == productId)).Quantity);
            Assert.Equal("PartiallyReceived", (await db.Set<Purchase>().SingleAsync(x => x.Id == purchaseId)).State);
        }
    }

    [PostgresFact]
    public async Task Invalid_mapping_or_stale_product_cannot_partially_create_a_purchase()
    {
        await Migrate(); var actor = Guid.NewGuid(); await using var db = Db(); var service = Service(db);
        var imported = await service.Import(Upload(Number()), actor, default);
        await service.Classify(imported.Invoice.Id, new("Bar", imported.Invoice.ReviewVersion), default);
        await Assert.ThrowsAsync<InvoiceRuleException>(() => service.CreatePurchase(imported.Invoice.Id, new(Guid.Empty, [new(1, Guid.NewGuid(), 1, 2)], true, 2), actor, default));
        var category = new BarProductCategory("Conferência " + Guid.NewGuid()); db.Add(category);
        var product = new BarProduct(Guid.NewGuid().ToString("N"), "Produto conferência", "Teste", category.Id, "un", "CX", 12, 5, 0, 0, true, false, 0);
        db.Add(product); await db.SaveChangesAsync();
        await Assert.ThrowsAsync<InvoiceRuleException>(() => service.CreatePurchase(imported.Invoice.Id,
            new(Guid.Empty, [new(1, product.Id, product.Version + 1, 2)], true, 2), actor, default));
        await using var check = Db(); Assert.Null((await Service(check).Detail(imported.Invoice.Id, default)).PurchaseId);
        Assert.False(await check.Set<Purchase>().AnyAsync(x => x.Document == imported.Invoice.Data.AccessKey));
    }

    [PostgresFact]
    public async Task Http_flow_checks_recipient_permissions_and_omits_xml_from_audit()
    {
        await Migrate(); var actor = Guid.NewGuid(); var number = Number();
        await using var factory = new LongBeachWebApplicationFactory().WithWebHostBuilder(b => b.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?>
        { ["ConnectionStrings:LongBeach"] = Connection, ["Fiscal:RecipientCnpj"] = InvoiceFixture.Recipient, ["Fiscal:Environment"] = "2" }))
            .ConfigureServices(s => s.AddDbContext<LongBeachDbContext>(o => o.UseNpgsql(Connection))));
        using var client = factory.CreateClient(); client.DefaultRequestHeaders.Authorization = new("Bearer", Token(actor, true));
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/v1/received-invoices/preview", Upload(number))).StatusCode);
        var result = await client.PostAsJsonAsync("/api/v1/received-invoices/", Upload(number)); Assert.Equal(HttpStatusCode.OK, result.StatusCode);
        var body = (await result.Content.ReadFromJsonAsync<InvoiceImportResult>())!;
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/v1/received-invoices/{body.Invoice.Id}/original")).StatusCode);
        await using var db = Db();
        var audit = await db.AuditLogs.SingleAsync(x => x.Resource == nameof(ReceivedInvoice) && x.ResourceId == body.Invoice.Id.ToString());
        var classified = await client.PostAsJsonAsync($"/api/v1/received-invoices/{body.Invoice.Id}/classification", new InvoiceClassificationInput("Equipment", 1));
        Assert.Equal(HttpStatusCode.OK, classified.StatusCode);
        var classificationAudit = await db.AuditLogs.SingleAsync(x => x.Resource == nameof(ReceivedInvoice) && x.ResourceId == body.Invoice.Id.ToString() && x.Action == "Modified");
        Assert.Equal(actor, classificationAudit.ActorUserId);
        Assert.Contains("Equipment", classificationAudit.MetadataJson); Assert.Contains("Unclassified", classificationAudit.MetadataJson);
        Assert.DoesNotContain("nfeProc", classificationAudit.MetadataJson);
        Assert.Equal(actor, audit.ActorUserId); Assert.DoesNotContain("nfeProc", audit.MetadataJson); Assert.DoesNotContain("Fornecedor fictício", audit.MetadataJson);
        var invalid = Upload(Number()) with { ContentBase64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(InvoiceFixture.Xml(Number()).Replace(InvoiceFixture.Recipient, "11111111000191"))) };
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/v1/received-invoices/", invalid)).StatusCode);
    }

    [PostgresFact]
    public async Task General_arena_notes_are_classified_without_bar_purchase_and_preserve_original()
    {
        await Migrate(); var actor = Guid.NewGuid();
        await using var db = Db(); var service = Service(db);
        foreach (var purpose in InvoicePurposes.All)
        {
            var number = Number(); var invoice = (await service.Import(Upload(number), actor, default)).Invoice;
            Assert.Equal("Unclassified", invoice.Purpose);
            Assert.Equal(1, invoice.ReviewVersion);
            var classified = await service.Classify(invoice.Id, new(purpose, invoice.ReviewVersion), default);
            Assert.Equal(purpose, classified.Purpose);
            Assert.Equal(2, classified.ReviewVersion);
            Assert.Equal(InvoiceFixture.Bytes(number), (await service.Original(invoice.Id, default)).Content);
            Assert.Contains((await service.List(1, default, purpose)).Items, x => x.Id == invoice.Id);
            if (purpose != "Bar")
            {
                var exception = await Assert.ThrowsAsync<InvoiceRuleException>(() => service.CreatePurchase(invoice.Id,
                    new(Guid.Empty, [new(1, Guid.NewGuid(), 1, 2)], true, 2), actor, default));
                Assert.Contains("Somente notas classificadas", exception.Message);
            }
            await Assert.ThrowsAsync<InvoiceRuleException>(() => service.Classify(invoice.Id, new("Equipment", 1), default));
            Assert.False(await db.Set<Purchase>().AnyAsync(x => x.Document == invoice.Data.AccessKey));
        }
        var saved = (await service.Import(Upload(Number()), actor, default)).Invoice;
        await Assert.ThrowsAsync<InvoiceRuleException>(() => service.Classify(saved.Id, new("invalid", 1), default));
        await Assert.ThrowsAsync<InvoiceRuleException>(() => service.List(1, default, "invalid"));
        await service.Classify(saved.Id, new("Bar", 1), default);
        await service.Classify(saved.Id, new("Materials", 2), default);
        await service.Classify(saved.Id, new("Bar", 3), default);
        var stale = await Assert.ThrowsAsync<InvoiceRuleException>(() => service.CreatePurchase(saved.Id,
            new(Guid.Empty, [new(1, Guid.NewGuid(), 1, 2)], true, 2), actor, default));
        Assert.Contains("classificação mudou", stale.Message);
    }

    [Fact]
    public async Task Bar_permission_does_not_expose_general_invoices_and_fiscal_permission_does_not_grant_bar_writes()
    {
        await using var factory = new LongBeachWebApplicationFactory(); using var client = factory.CreateClient();
        var id = Guid.NewGuid();
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token(Guid.NewGuid(), false, onlyPermission: "bar:purchases:manage"));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/received-invoices/")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync($"/api/v1/received-invoices/{id}/classification", new InvoiceClassificationInput("Bar", 1))).StatusCode);
        client.DefaultRequestHeaders.Authorization = new("Bearer", Token(Guid.NewGuid(), false, onlyPermission: "fiscal:invoices:manage"));
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/v1/received-invoices/preview", Upload(1) with { ContentBase64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(InvoiceFixture.Xml().Replace("<tpAmb>2</tpAmb>", "<tpAmb>1</tpAmb>"))) })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/received-invoices/choices")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync($"/api/v1/received-invoices/{id}/purchase", new InvoicePurchaseInput(Guid.Empty, [], true))).StatusCode);
    }

    [Fact]
    public async Task Endpoints_deny_anonymous_other_roles_and_first_access_sessions()
    {
        await using var factory = new LongBeachWebApplicationFactory(); using var client = factory.CreateClient();
        var id = Guid.NewGuid();
        foreach (var path in new[] { "/", "/choices", $"/{id}", $"/{id}/original" })
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/received-invoices" + path)).StatusCode);
        foreach (var firstAccess in new[] { false, true })
        {
            client.DefaultRequestHeaders.Authorization = new("Bearer", Token(Guid.NewGuid(), firstAccess, firstAccess));
            var expected = firstAccess ? HttpStatusCode.Unauthorized : HttpStatusCode.Forbidden;
            Assert.Equal(expected, (await client.GetAsync("/api/v1/received-invoices/")).StatusCode);
            Assert.Equal(expected, (await client.PostAsJsonAsync("/api/v1/received-invoices/preview", Upload(1))).StatusCode);
            Assert.Equal(expected, (await client.PostAsJsonAsync("/api/v1/received-invoices/", Upload(1))).StatusCode);
            Assert.Equal(expected, (await client.PostAsJsonAsync($"/api/v1/received-invoices/{id}/purchase", new InvoicePurchaseInput(Guid.Empty, [], true))).StatusCode);
        }
    }
    private static string Token(Guid actor, bool permission, bool firstAccess = false, string? onlyPermission = null)
    {
        var claims = new List<Claim> { new("sub", actor.ToString()) };
        if (permission) { claims.Add(new("permission", "fiscal:invoices:manage")); claims.Add(new("permission", "bar:purchases:manage")); }
        if (onlyPermission is not null) claims.Add(new("permission", onlyPermission));
        if (firstAccess) claims.Add(new("requires_first_access", "true"));
        return new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken("LongBeach.Tests", "LongBeach.Tests.Client", claims,
            DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(5),
            new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes("integration-tests-only-signing-key-with-more-than-32-characters")), SecurityAlgorithms.HmacSha256)));
    }
}
