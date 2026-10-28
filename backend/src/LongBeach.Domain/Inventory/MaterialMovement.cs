using LongBeach.Domain.Common;

namespace LongBeach.Domain.Inventory;

/// <summary>An immutable receipt; existing legacy quantity is the first receipt's Before, not an invented opening transaction.</summary>
public sealed class MaterialMovement : Entity
{
    private MaterialMovement() { }
    public MaterialMovement(Guid operationId, Guid materialId, Guid actorId, int expectedVersion,
        string kind, decimal requestedQuantity, decimal before, string unit, string location,
        string reason, string destination) : base(operationId)
    {
        if (operationId == Guid.Empty || materialId == Guid.Empty || actorId == Guid.Empty || expectedVersion < 0)
            throw new InventoryRuleException("Operação, material, responsável e versão são obrigatórios.");
        if (kind is not ("Receipt" or "Consumption" or "Loss" or "Count"))
            throw new InventoryRuleException("Tipo de movimentação inválido.");
        StockQuantity.Validate(requestedQuantity, kind == "Count");
        Reason = Text(reason, 500, "Motivo");
        Destination = Text(destination, 160, "Área ou responsável pelo destino");
        Unit = Text(unit, 20, "Unidade");
        Location = Text(location, 160, "Local de armazenamento");
        MaterialId = materialId; ActorId = actorId; ExpectedVersion = expectedVersion;
        Kind = kind; RequestedQuantity = requestedQuantity; Before = before;
        Quantity = kind switch { "Count" => requestedQuantity - before, "Receipt" => requestedQuantity, _ => -requestedQuantity };
        if (kind == "Count" && Quantity == 0) throw new InventoryRuleException("A contagem já corresponde ao saldo atual; nenhum ajuste é necessário.");
        After = StockQuantity.Move(before, Quantity);
    }
    public Guid MaterialId { get; private set; }
    public Guid ActorId { get; private set; }
    public int ExpectedVersion { get; private set; }
    public string Kind { get; private set; } = "";
    public decimal RequestedQuantity { get; private set; }
    public decimal Before { get; private set; }
    public decimal Quantity { get; private set; }
    public decimal After { get; private set; }
    public string Unit { get; private set; } = "";
    public string Location { get; private set; } = "";
    public string Reason { get; private set; } = "";
    public string Destination { get; private set; } = "";
    public static string Text(string? value, int max, string label)
    {
        var text = value?.Trim() ?? "";
        return text.Length is > 0 && text.Length <= max ? text : throw new InventoryRuleException($"{label}: informe de 1 a {max} caracteres.");
    }
}
