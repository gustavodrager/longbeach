using System.Security.Cryptography;
using LongBeach.Application.Abstractions;
using LongBeach.Application.Auth;
using LongBeach.Domain.Identity;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace LongBeach.Infrastructure.Auth;

public sealed class GoogleClientRegistration(LongBeachDbContext db, IPasswordHasher passwords) : IGoogleClientRegistration
{
    public async Task EnsureClientAsync(string subject, string email, string? name, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(subject) || subject.Length > 255 ||
            string.IsNullOrWhiteSpace(email) || email.Length > 320)
            throw new AuthenticationFailedException();

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        // Serialize first registrations across API instances. Database unique indexes also
        // protect against identity provisioning performed by other administration workflows.
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(724031906)", cancellationToken);
        var normalizedEmail = User.NormalizeEmail(email);
        if (await db.Users.AnyAsync(user => user.GoogleSubject == subject || user.NormalizedEmail == normalizedEmail, cancellationToken))
        {
            // Never attach by name/email or change roles, status or an existing Google link.
            // AuthService decides whether this existing identity can sign in.
            await transaction.CommitAsync(cancellationToken);
            return;
        }

        var role = await db.Roles.SingleAsync(role => role.Name == SystemRoles.Student, cancellationToken);
        var displayName = string.IsNullOrWhiteSpace(name) ? "Cliente Long Beach" : name.Trim();
        if (displayName.Length > 160) displayName = displayName[..160];
        var user = User.Create(displayName, email, passwords.Hash(Convert.ToBase64String(RandomNumberGenerator.GetBytes(48))));
        user.LinkGoogle(subject, email);
        user.DisableLocalPassword(user.PasswordHash);
        user.AssignRole(role);
        db.Users.Add(user);
        await new LongBeach.Infrastructure.Customers.CustomerService(db, TimeProvider.System).EnsureSourceAsync(
            new("users", user.Id, null, displayName, "", email, AllowIncomplete: true), cancellationToken);
        try
        {
            // The standard save interceptor audits creation and the role assignment.
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            throw new AuthenticationFailedException();
        }
    }
}
