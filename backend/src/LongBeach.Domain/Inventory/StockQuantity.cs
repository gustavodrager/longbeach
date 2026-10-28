namespace LongBeach.Domain.Inventory;

public sealed class InventoryRuleException(string message) : Exception(message);

/// <summary>Quantity invariants for Arena material stock.</summary>
public static class StockQuantity
{
    public static decimal Validate(decimal value, bool allowZero = false)
    {
        if (value < 0 || (!allowZero && value == 0) || value > 99999999 || decimal.Round(value, 3) != value)
            throw new InventoryRuleException("Quantidade inválida (até três casas decimais).");
        return value;
    }

    public static decimal Move(decimal before, decimal delta, decimal reserved = 0)
    {
        Validate(before, true);
        Validate(reserved, true);
        if (delta == 0 || decimal.Round(delta, 3) != delta || before + delta < reserved)
            throw new InventoryRuleException("Movimentação inválida ou estoque disponível insuficiente.");
        return Validate(before + delta, true);
    }
}
