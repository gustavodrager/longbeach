using LongBeach.Application.Abstractions;
using LongBeach.Application.Auth;
using LongBeach.Domain.Identity;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.Infrastructure.Persistence;

public sealed class UserRepository(LongBeachDbContext dbContext) : IUserRepository
{
    public Task<User?> FindByIdAsync(
        Guid id,
        CancellationToken cancellationToken = default) =>
        IdentityGraph()
            .SingleOrDefaultAsync(user => user.Id == id, cancellationToken);

    public Task<User?> FindByEmailAsync(
        string normalizedEmail,
        CancellationToken cancellationToken = default) =>
        IdentityGraph()
            .SingleOrDefaultAsync(user => user.NormalizedEmail == normalizedEmail, cancellationToken);

    public Task<User?> FindByRefreshTokenHashAsync(
        string tokenHash,
        CancellationToken cancellationToken = default) =>
        IdentityGraph()
            .SingleOrDefaultAsync(
                user => user.RefreshTokens.Any(token => token.TokenHash == tokenHash),
                cancellationToken);

    public Task AddAsync(User user, CancellationToken cancellationToken = default) =>
        dbContext.Users.AddAsync(user, cancellationToken).AsTask();

    public async Task SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException exception)
        {
            throw new ConcurrencyConflictException(exception);
        }
    }

    private IQueryable<User> IdentityGraph() =>
        dbContext.Users
            .Include(user => user.RefreshTokens)
            .Include(user => user.UserRoles)
                .ThenInclude(userRole => userRole.Role)
                    .ThenInclude(role => role.RolePermissions)
                        .ThenInclude(rolePermission => rolePermission.Permission);
}
