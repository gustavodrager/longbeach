using System.Text.Json;
using System.Text.Json.Serialization;

namespace LongBeach.Contracts.Staff;

public sealed record StaffAccessSummary(string TypeId, string Name, string Role, string[] Menus, string[] Actions, string HomePath);
public sealed record StaffMenuDefinition(string Id, string Label, string Area, string Path, string[] TypeIds);
public sealed record StaffActionDefinition(string Id, string Label, string MenuId, string[] TypeIds, string[]? RequiresActions = null);
public sealed record StaffAccessCatalogResponse(StaffMenuDefinition[] Menus, StaffActionDefinition[] Actions);
public sealed record StaffAccessTypeSummary(string Id, string Name, string Role, string[] Menus, string[] Actions, int MemberCount, int Version);
public sealed record StaffAccessTypeInput(string Name, string[] Menus, string[] Actions, int Version);
public sealed record StaffAccountChoice(Guid Id, string Name, string? Username, string? PhoneLogin, string Role, bool IsActive, bool GoogleLinked, bool LocalPasswordEnabled, Guid? LinkedTeamId);
public sealed record StaffMemberAccessStatus(Guid TeamId, Guid? UserId, string? TypeId, string? PhoneLogin, string? Username, bool IsActive, bool RequiresFirstAccess, DateTimeOffset? InitialAccessExpiresAtUtc, bool GoogleLinked, bool LocalPasswordEnabled, int Version, bool IsOwner);
public sealed record StaffAccessContext(StaffAccessTypeSummary[] Types, StaffAccessCatalogResponse Catalog, StaffMemberAccessStatus[] Members, StaffAccountChoice[] Accounts);
public sealed record StaffMemberAccessInput(string Mode, string TypeId, string? PhoneLogin = null, string? Username = null, Guid? UserId = null, int Version = 0);
public sealed record StaffMemberInput(JsonElement Member, StaffMemberAccessInput Access, Guid OperationId);
public sealed record StaffMemberCommand(int Version, Guid OperationId);
public sealed record StaffMemberResult(JsonElement Member, StaffMemberAccessStatus Access,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? InitialPassword = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] DateTimeOffset? InitialPasswordExpiresAtUtc = null);
