using LongBeach.Domain.Common;
namespace LongBeach.Domain.Fiscal;

public static class InvoicePurposes
{
    public static readonly IReadOnlyCollection<string> All = ["Unclassified", "Bar", "Materials", "Equipment", "Maintenance", "Other", "Mixed"];
}

public sealed class ReceivedInvoice : Entity
{
    private ReceivedInvoice() { }
    public ReceivedInvoice(string key, string recipient, string number, string supplier, DateTimeOffset issued,
        decimal total, string fileName, byte[] original, string hash, string data, Guid actor) : base(Guid.NewGuid())
    {
        AccessKey = key; RecipientTaxId = recipient; Number = number; SupplierName = supplier;
        IssuedAt = issued; Total = total; FileName = fileName; OriginalXml = original;
        ContentHash = hash; DataJson = data; ImportedBy = actor;
    }
    public string AccessKey { get; private set; } = "";
    public string RecipientTaxId { get; private set; } = "";
    public string Number { get; private set; } = "";
    public string SupplierName { get; private set; } = "";
    public DateTimeOffset IssuedAt { get; private set; }
    public decimal Total { get; private set; }
    public string FileName { get; private set; } = "";
    public byte[] OriginalXml { get; private set; } = [];
    public string ContentHash { get; private set; } = "";
    public string DataJson { get; private set; } = "";
    public Guid ImportedBy { get; private set; }
    public Guid? PurchaseId { get; private set; }
    public string? PurchaseRequestHash { get; private set; }
    public string Purpose { get; private set; } = "Unclassified";
    public int ReviewVersion { get; private set; } = 1;
    public void Classify(string purpose)
    {
        if (!InvoicePurposes.All.Contains(purpose)) throw new ArgumentException("Finalidade inválida.");
        if (PurchaseId.HasValue) throw new InvalidOperationException("A nota já está vinculada a uma compra.");
        Purpose = purpose; ReviewVersion++;
    }
    public void LinkPurchase(Guid id, string requestHash)
    {
        if (Purpose != "Bar" || PurchaseId.HasValue) throw new InvalidOperationException("A nota deve ser classificada para o bar e ainda não possuir compra.");
        PurchaseId = id; PurchaseRequestHash = requestHash; ReviewVersion++;
    }
}
