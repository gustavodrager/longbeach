using System.Text.Json.Serialization;

namespace LongBeach.Contracts.Inventory;

public sealed record MaterialMovementInput(Guid OperationId, int? ExpectedVersion, string Kind,
    [property: JsonRequired] decimal Quantity, string Reason, string Destination);
public sealed record MaterialMovementRow(Guid Id, Guid MaterialId, string Kind, decimal Before, decimal Quantity,
    decimal After, string Unit, string Location, string Reason, string Destination, Guid ActorId, string? ActorName, DateTimeOffset OccurredAt);
public sealed record MaterialHistory(IReadOnlyList<MaterialMovementRow> Items, int Page, int Total);
public sealed record MaterialOperationResult(string Payload, MaterialMovementRow Movement);
