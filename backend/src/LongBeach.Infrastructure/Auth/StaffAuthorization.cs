using LongBeach.Application.Staff;
using LongBeach.Contracts.Staff;
using LongBeach.Domain.Identity;
using Microsoft.Extensions.Options;

namespace LongBeach.Infrastructure.Auth;

public sealed class StaffAuthorization(IOptions<StaffAccessOptions> options) : IStaffAuthorization
{
    public bool IsOwner(User user) => user.IsActive && !user.RequiresFirstAccess && (user.LocalPasswordEnabled || user.GoogleSubject is not null) &&
        (user.StaffMembership is null || user.StaffMembership.Enabled && user.StaffMembership.AccessType?.Role == SystemRoles.Manager) && ProfileAccess.IsManagement(user.GetRoleNames()) &&
        options.Value.OwnerUserIds.Contains(user.Id);

    public StaffAuthorizationResult Resolve(User user)
    {
        // A verified owner has the complete management profile. Editable staff
        // templates continue to limit everyone else, including other Managers.
        if (IsOwner(user)) return new(ProfileAccess.Permissions(user.GetRoleNames(), []), true, null);
        if (user.RequiresFirstAccess || !user.IsActive) return new([], false, null);
        var membership = user.StaffMembership;
        if (membership is null) return new(ProfileAccess.Permissions(user.GetRoleNames(), []), false, null);
        var type = membership.AccessType;
        if (!membership.Enabled || type is null || !user.GetRoleNames().SequenceEqual([type.Role]))
            return new([], false, new(type?.Code ?? "", type?.Name ?? "Acesso bloqueado", type?.Role ?? "", [], [], "/conta"));
        try
        {
            var permissions = StaffAccessCatalog.Permissions(type);
            return new(permissions, false, new(type.Code, type.Name, type.Role, type.Menus.ToArray(), type.Actions.ToArray(), StaffAccessCatalog.Home(type.Menus,type.Actions)));
        }
        catch (StaffAccessException) { return new([], false, new(type.Code, type.Name, type.Role, [], [], "/conta")); }
    }
}
