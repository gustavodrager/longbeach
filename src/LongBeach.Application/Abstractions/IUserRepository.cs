using LongBeach.Domain.Identity;

namespace LongBeach.Application.Abstractions;

public interface IUserRepository
{
    Task<User?> FindByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<User?> FindByEmailAsync(string normalizedEmail, CancellationToken cancellationToken = default);
    Task<User?> FindByRefreshTokenHashAsync(string tokenHash, CancellationToken cancellationToken = default);
    Task AddAsync(User user, CancellationToken cancellationToken = default);
    Task SaveChangesAsync(CancellationToken cancellationToken = default);
}
