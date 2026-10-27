using System.Text.Json;
namespace LongBeach.Contracts.Operations;

public sealed record RentalMonthInput(string Month, int GroupVersion, bool CreateCharge = false);
public sealed record RentalMonthPreview(Guid GroupId, string Month, int GroupVersion, string[] Dates, decimal? Amount, string DueDate, string[] Errors, string[] Warnings, Guid? ExistingMonthId);
public sealed record RentalBarLinkInput(Guid ReservationId, Guid? MemberId, int Version = 0);
public sealed record RentalBarSummary(Guid TabId, long Number, string Name, string State, Guid ReservationId, Guid? MemberId, int Version, decimal Total, decimal Paid, decimal Due);
