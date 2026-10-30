using System.Collections.Concurrent;
using System.Reflection;
using LongBeach.Application.Abstractions;
using LongBeach.Domain.Common;
using LongBeach.Domain.Identity;

namespace LongBeach.IntegrationTests;

// Synthetic API sessions use an explicit account store, separate from their JWT claims.
// PostgreSQL suites can fall back to the real repository for persisted identities.
internal static class TestSessionUsers
{
    private static readonly ConcurrentDictionary<Guid, User> Accounts = new();
    internal static User Register(Guid id, string role) => Accounts.GetOrAdd(id, key => Create(key, [role]));
    internal static User RegisterLegacy(Guid id, params string[] roles) => Accounts.GetOrAdd(id, key => Create(key, roles));
    internal static User Add(User user) { Accounts[user.Id] = user; return user; }
    internal static User? Find(Guid id) => Accounts.GetValueOrDefault(id);
    internal static IEnumerable<User> All => Accounts.Values;

    private static User Create(Guid id, string[] roles)
    {
        var user = User.Create("Synthetic account", $"{id:N}@example.test", "test-only-hash");
        typeof(Entity).GetProperty(nameof(Entity.Id))!.SetValue(user, id);
        if (roles.Length == 1 && SystemRoles.IsValid(roles[0])) user.AssignRole(new Role(roles[0]));
        else
        {
            var links = (HashSet<UserRole>)typeof(User).GetField("_userRoles", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(user)!;
            foreach (var role in roles)
                links.Add((UserRole)Activator.CreateInstance(typeof(UserRole), BindingFlags.Instance | BindingFlags.NonPublic,
                    null, [user, new Role(role)], null)!);
        }
        return user;
    }
}

internal sealed class TestSessionUserRepository(IUserRepository? persisted = null) : IUserRepository
{
    public Task<User?> FindByIdAsync(Guid id, CancellationToken ct = default) =>
        TestSessionUsers.Find(id) is { } user ? Task.FromResult<User?>(user) : persisted?.FindByIdAsync(id, ct) ?? Task.FromResult<User?>(null);
    public Task<User?> FindForAuthorizationAsync(Guid id, CancellationToken ct = default) =>
        TestSessionUsers.Find(id) is { } user ? Task.FromResult<User?>(user) : persisted?.FindForAuthorizationAsync(id, ct) ?? Task.FromResult<User?>(null);
    public Task<User?> FindByEmailAsync(string email, CancellationToken ct = default) =>
        persisted?.FindByEmailAsync(email, ct) ?? Task.FromResult(TestSessionUsers.All.SingleOrDefault(u => u.NormalizedEmail == email));
    public Task<User?> FindByUsernameAsync(string username, CancellationToken ct = default) =>
        persisted?.FindByUsernameAsync(username, ct) ?? Task.FromResult(TestSessionUsers.All.SingleOrDefault(u => u.NormalizedUsername == username));
    public Task<User?> FindByGoogleSubjectAsync(string subject, CancellationToken ct = default) =>
        persisted?.FindByGoogleSubjectAsync(subject, ct) ?? Task.FromResult(TestSessionUsers.All.SingleOrDefault(u => u.GoogleSubject == subject));
    public Task<User?> FindByRefreshTokenHashAsync(string hash, CancellationToken ct = default) =>
        persisted?.FindByRefreshTokenHashAsync(hash, ct) ?? Task.FromResult(TestSessionUsers.All.SingleOrDefault(u => u.RefreshTokens.Any(t => t.TokenHash == hash)));
    public Task AddAsync(User user, CancellationToken ct = default)
    {
        if (persisted is not null) return persisted.AddAsync(user, ct);
        TestSessionUsers.Add(user); return Task.CompletedTask;
    }
    public Task SaveChangesAsync(CancellationToken ct = default) => persisted?.SaveChangesAsync(ct) ?? Task.CompletedTask;
}
