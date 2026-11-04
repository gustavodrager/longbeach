namespace LongBeach.Application.Staff;

// Stable account identities are provisioned explicitly, never derived from a person's name or contact.
public sealed class StaffAccessOptions
{
    public const string SectionName = "StaffAccess";
    public Guid[] OwnerUserIds { get; set; } = [];
}
