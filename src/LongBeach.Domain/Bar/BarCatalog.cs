using LongBeach.Domain.Common;

namespace LongBeach.Domain.Bar;

public sealed class BarRuleException(string message) : Exception(message);

public static class BarRules
{
    public static string Text(string? value, int max, string label)
    {
        var text = value?.Trim() ?? "";
        if (text.Length == 0 || text.Length > max) throw new BarRuleException($"{label}: informe de 1 a {max} caracteres.");
        return text;
    }
    public static decimal Money(decimal value)
    {
        if (value < 0 || value > 99999999 || decimal.Round(value, 2) != value) throw new BarRuleException("Valor monetário inválido (até duas casas decimais).");
        return value;
    }
    public static decimal Cost(decimal value) { if(value<0||value>99999999||decimal.Round(value,6)!=value)throw new BarRuleException("Custo inválido (até seis casas decimais).");return value; }
    public static decimal Quantity(decimal value, bool allowZero = false)
    {
        if (value < 0 || (!allowZero && value == 0) || value > 99999999 || decimal.Round(value, 3) != value) throw new BarRuleException("Quantidade inválida (até três casas decimais).");
        return value;
    }
}

public sealed class BarProductCategory : Entity
{
    private BarProductCategory() { }
    public BarProductCategory(string name) : base(Guid.NewGuid()) => Rename(name);
    public string Name { get; private set; } = "";
    public void Rename(string name) => Name = BarRules.Text(name, 100, "Categoria");
}

public sealed class BarProduct : Entity
{
    private BarProduct() { }
    public BarProduct(string code, string name, string shortName, Guid categoryId, string saleUnit,
        string purchaseUnit, decimal conversionFactor, decimal salePrice, decimal averageCost,
        decimal minimumStock, bool controlsStock, bool favorite, int displayOrder) : base(Guid.NewGuid())
    {
        Code = BarRules.Text(code, 40, "Código").ToUpperInvariant();
        Change(name, shortName, categoryId, saleUnit, purchaseUnit, conversionFactor, salePrice, averageCost,
            minimumStock, controlsStock, favorite, displayOrder, true);
    }
    public string Code { get; private set; } = "";
    public string Name { get; private set; } = "";
    public string ShortName { get; private set; } = "";
    public Guid CategoryId { get; private set; }
    public string SaleUnit { get; private set; } = "";
    public string PurchaseUnit { get; private set; } = "";
    public decimal ConversionFactor { get; private set; }
    public decimal SalePrice { get; private set; }
    public decimal AverageCost { get; private set; }
    public decimal LastCost { get; private set; }
    public decimal MinimumStock { get; private set; }
    public bool ControlsStock { get; private set; }
    public bool Favorite { get; private set; }
    public int DisplayOrder { get; private set; }
    public bool Active { get; private set; }
    public string? Barcode { get; private set; }
    public string? ImageUrl { get; private set; }
    public Guid? MainSupplierId { get; private set; }
    public int Version { get; private set; }

    public void Change(string name, string shortName, Guid categoryId, string saleUnit, string purchaseUnit,
        decimal conversionFactor, decimal salePrice, decimal averageCost, decimal minimumStock,
        bool controlsStock, bool favorite, int displayOrder, bool active)
    {
        Name = BarRules.Text(name, 160, "Produto");
        ShortName = BarRules.Text(shortName, 80, "Nome no PDV");
        if (categoryId == Guid.Empty) throw new BarRuleException("Categoria obrigatória.");
        CategoryId = categoryId;
        SaleUnit = BarRules.Text(saleUnit, 20, "Unidade de venda");
        PurchaseUnit = BarRules.Text(purchaseUnit, 20, "Unidade de compra");
        ConversionFactor = BarRules.Quantity(conversionFactor);
        SalePrice = BarRules.Money(salePrice);
        AverageCost = BarRules.Cost(averageCost);
        MinimumStock = BarRules.Quantity(minimumStock, true);
        ControlsStock = controlsStock;
        Favorite = favorite;
        if (displayOrder < 0) throw new BarRuleException("Ordem inválida.");
        DisplayOrder = displayOrder;
        Active = active;
        Version++;
    }

    public void SetMetadata(string? barcode,string? imageUrl,Guid? supplierId)
    {
        Barcode=string.IsNullOrWhiteSpace(barcode)?null:BarRules.Text(barcode,80,"Código de barras");
        if(!string.IsNullOrWhiteSpace(imageUrl))
        {
            if(imageUrl.Length>1000||!Uri.TryCreate(imageUrl,UriKind.Absolute,out var uri)||uri.Scheme!="https"||!string.IsNullOrEmpty(uri.UserInfo))throw new BarRuleException("Imagem exige URL HTTPS sem credenciais.");
            ImageUrl=imageUrl;
        }else ImageUrl=null;
        MainSupplierId=supplierId;Version++;
    }
    public void ReceiveCost(decimal currentQuantity, decimal received, decimal unitCost)
    {
        BarRules.Quantity(received);
        BarRules.Cost(unitCost);
        AverageCost = decimal.Round((currentQuantity * AverageCost + received * unitCost) / (currentQuantity + received), 6);
        LastCost = unitCost;
        Version++;
    }
}
