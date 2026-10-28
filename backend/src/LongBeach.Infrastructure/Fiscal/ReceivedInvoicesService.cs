using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using LongBeach.Application.Fiscal;
using LongBeach.Contracts.Bar;
using LongBeach.Contracts.Fiscal;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Fiscal;
using LongBeach.Domain.Purchases;
using LongBeach.Infrastructure.Bar;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace LongBeach.Infrastructure.Fiscal;

public sealed class ReceivedInvoicesService(LongBeachDbContext db, IConfiguration config) : IReceivedInvoices
{
    private string Recipient => config["Fiscal:RecipientCnpj"] ?? "";
    private int Environment => config.GetValue("Fiscal:Environment", 1);
    public InvoiceData Preview(InvoiceUpload input) => Parse(input).Data;
    private (byte[] Bytes, InvoiceData Data) Parse(InvoiceUpload input)
    {
        if (Recipient.Length != 14 || Environment is not (1 or 2)) throw new InvoiceRuleException("Configure o CNPJ destinatário e o ambiente fiscal antes de importar.");
        if (string.IsNullOrWhiteSpace(input.FileName) || input.FileName.Length > 180 || !input.FileName.EndsWith(".xml", StringComparison.OrdinalIgnoreCase))
            throw new InvoiceRuleException("Selecione um arquivo com extensão .xml.");
        if (string.IsNullOrWhiteSpace(input.ContentBase64) || input.ContentBase64.Length > 2_800_000) throw new InvoiceRuleException("Envie um XML de até 2 MB.");
        byte[] bytes;
        try { bytes = Convert.FromBase64String(input.ContentBase64); }
        catch (FormatException) { throw new InvoiceRuleException("Arquivo inválido. Selecione novamente o XML original."); }
        return (bytes, InvoiceXmlReader.Read(bytes, Recipient, Environment));
    }
    public async Task<InvoiceImportResult> Import(InvoiceUpload input, Guid actor, CancellationToken ct)
    {
        var (bytes, data) = Parse(input); var hash = Convert.ToHexString(SHA256.HashData(bytes));
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await Lock(ct);
        var existing = await db.Set<ReceivedInvoice>().SingleOrDefaultAsync(x => x.AccessKey == data.AccessKey, ct);
        if (existing is not null)
        {
            if (existing.ContentHash != hash) throw new InvoiceRuleException("Esta chave já foi importada com outro arquivo. O original foi preservado; confira a divergência.");
            return new(ToDetail(existing), true);
        }
        var invoice = new ReceivedInvoice(data.AccessKey, Recipient, data.Number, data.SupplierName, data.IssuedAt,
            data.Total, data.AccessKey + ".xml", bytes, hash, JsonSerializer.Serialize(data), actor);
        db.Add(invoice); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return new(ToDetail(invoice), false);
    }
    public async Task<InvoicePage> List(int page, CancellationToken ct, string? purpose = null)
    {
        if (page < 1 || page > 100000) throw new InvoiceRuleException("Página inválida.");
        if (purpose is not null && !InvoicePurposes.All.Contains(purpose)) throw new InvoiceRuleException("Finalidade inválida.");
        var query = db.Set<ReceivedInvoice>().AsNoTracking().Where(x => x.RecipientTaxId == Recipient);
        if (purpose is not null) query = query.Where(x => x.Purpose == purpose);
        return new(await query.OrderByDescending(x => x.CreatedAtUtc).ThenBy(x => x.Id).Skip((page - 1) * 25).Take(25)
            .Select(x => new InvoiceRow(x.Id, x.AccessKey, x.Number, x.SupplierName, x.IssuedAt, x.Total, x.PurchaseId, x.CreatedAtUtc, x.Purpose)).ToListAsync(ct),
            page, await query.CountAsync(ct));
    }
    private async Task<ReceivedInvoice> Find(Guid id, CancellationToken ct) =>
        await db.Set<ReceivedInvoice>().SingleOrDefaultAsync(x => x.Id == id && x.RecipientTaxId == Recipient, ct)
        ?? throw new InvoiceRuleException("Nota não encontrada.");
    public async Task<InvoiceChoices> Choices(CancellationToken ct) => new(
        await db.Set<Supplier>().AsNoTracking().OrderBy(x => x.Name).Select(x => new InvoiceSupplierOption(x.Id, x.Name, x.TaxId)).ToListAsync(ct),
        await db.Set<BarProduct>().AsNoTracking().Where(x => x.Active && x.ControlsStock).OrderBy(x => x.Name)
            .Select(x => new InvoiceProductOption(x.Id, x.Name, x.PurchaseUnit, x.SaleUnit, x.ConversionFactor, x.Version)).ToListAsync(ct));
    public async Task<InvoiceDetail> Detail(Guid id, CancellationToken ct) => ToDetail(await Find(id, ct));
    public async Task<InvoiceDetail> Classify(Guid id, InvoiceClassificationInput input, CancellationToken ct)
    {
        if (!InvoicePurposes.All.Contains(input.Purpose)) throw new InvoiceRuleException("Selecione uma finalidade válida para a nota.");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await Lock(ct);
        var invoice = await Find(id, ct);
        if (invoice.PurchaseId.HasValue) throw new InvoiceRuleException("A nota já gerou uma compra do bar. Confira o vínculo antes de alterar sua finalidade.");
        if (invoice.ReviewVersion != input.ReviewVersion) throw new InvoiceRuleException("A classificação mudou. Atualize a nota antes de continuar.");
        invoice.Classify(input.Purpose);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return ToDetail(invoice);
    }
    public async Task<(string FileName, byte[] Content)> Original(Guid id, CancellationToken ct)
    { var invoice = await Find(id, ct); return (invoice.FileName, invoice.OriginalXml); }
    private static InvoiceDetail ToDetail(ReceivedInvoice invoice) => new(invoice.Id, invoice.FileName,
        JsonSerializer.Deserialize<InvoiceData>(invoice.DataJson)!, invoice.PurchaseId, invoice.Purpose, invoice.ReviewVersion);
    private Task Lock(CancellationToken ct) => db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(2026101401)", ct);
    public async Task<Guid> CreatePurchase(Guid id, InvoicePurchaseInput input, Guid actor, CancellationToken ct)
    {
        if (!input.Confirmed || input.Items is null || input.Items.Count is 0 or > 100) throw new InvoiceRuleException("Confira os itens e confirme a criação da compra.");
        var requestHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(input with { Items = input.Items.OrderBy(x => x.LineNumber).ToArray() }))));
        await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        await Lock(ct);
        var invoice = await Find(id, ct);
        if (invoice.PurchaseId.HasValue)
        {
            if (invoice.PurchaseRequestHash != requestHash) throw new InvoiceRuleException("Esta nota já gerou uma compra com outra conferência. Abra a compra vinculada.");
            return invoice.PurchaseId.Value;
        }
        if (invoice.Purpose != "Bar") throw new InvoiceRuleException("Somente notas classificadas como mercadorias do bar podem gerar compra do bar. Notas mistas exigem separação dos itens.");
        if (invoice.ReviewVersion != input.ReviewVersion) throw new InvoiceRuleException("A classificação mudou. Atualize a nota e confira sua finalidade antes de gerar a compra.");
        var data = JsonSerializer.Deserialize<InvoiceData>(invoice.DataJson)!;
        if (!data.CanCreatePurchase) throw new InvoiceRuleException("Resolva a composição fiscal desta nota por conferência específica. A criação automática está bloqueada.");
        if (input.Items.Count != data.Items.Count || input.Items.Select(x => x.LineNumber).Distinct().Count() != data.Items.Count
            || input.Items.Any(x => data.Items.All(line => line.Number != x.LineNumber))
            || input.Items.Select(x => x.ProductId).Distinct().Count() != input.Items.Count)
            throw new InvoiceRuleException("Associe cada linha da nota a um produto distinto. Linhas repetidas do mesmo produto exigem conferência específica.");
        var purchaseItems = new List<PurchaseItemInput>();
        foreach (var mapping in input.Items)
        {
            var product = await db.Set<BarProduct>().AsNoTracking().SingleOrDefaultAsync(x => x.Id == mapping.ProductId, ct)
                ?? throw new InvoiceRuleException("Produto não encontrado.");
            if (!product.Active || !product.ControlsStock || product.Version != mapping.ProductVersion)
                throw new InvoiceRuleException("O produto foi alterado, está inativo ou não controla estoque. Atualize a conferência.");
            BarRules.Quantity(mapping.PurchaseQuantity);
            var line = data.Items.Single(x => x.Number == mapping.LineNumber);
            var unitCost = decimal.Round(line.Total / mapping.PurchaseQuantity, 2, MidpointRounding.AwayFromZero);
            purchaseItems.Add(new(product.Id, mapping.PurchaseQuantity, unitCost, line.Total));
        }
        var matched = await db.Set<Supplier>().SingleOrDefaultAsync(x => x.TaxId == data.SupplierTaxId, ct);
        Supplier supplier;
        if (input.SupplierId != Guid.Empty)
        {
            supplier = await db.Set<Supplier>().SingleOrDefaultAsync(x => x.Id == input.SupplierId, ct) ?? throw new InvoiceRuleException("Fornecedor não encontrado.");
            if (matched is not null && matched.Id != supplier.Id) throw new InvoiceRuleException("O documento fiscal já pertence a outro fornecedor cadastrado.");
            if (supplier.TaxId is not null && supplier.TaxId != data.SupplierTaxId) throw new InvoiceRuleException("O documento do fornecedor selecionado difere do emitente da nota.");
            supplier.SetTaxId(data.SupplierTaxId);
        }
        else if (matched is not null) supplier = matched;
        else
        {
            if (await db.Set<Supplier>().AnyAsync(x => x.Name == data.SupplierName, ct)) throw new InvoiceRuleException("Já existe fornecedor com esse nome. Selecione-o após conferir sua identidade.");
            supplier = new Supplier(data.SupplierName); supplier.SetTaxId(data.SupplierTaxId); db.Add(supplier);
        }
        await db.SaveChangesAsync(ct);
        if (await db.Set<Purchase>().AnyAsync(x => x.Document == data.AccessKey, ct)) throw new InvoiceRuleException("Já existe compra com esta chave. Confira o cadastro existente para evitar duplicidade.");
        var purchase = await new BarPurchasesService(db).Create(new(supplier.Id, data.AccessKey, purchaseItems,
            data.Freight, data.Discount, "Pending", null, data.IssuedAt), actor, ct);
        if (purchase.Total != data.Total) throw new InvoiceRuleException("O total da compra não coincide com o total da nota.");
        invoice.LinkPurchase(purchase.Id, requestHash);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return purchase.Id;
    }
}
