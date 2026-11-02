using System.Security.Cryptography;
using LongBeach.Application.Abstractions;
using LongBeach.Application.Auth;
using LongBeach.Contracts.Auth;
using LongBeach.Domain.Customers;
using LongBeach.Domain.Identity;
using LongBeach.Infrastructure.Customers;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace LongBeach.Infrastructure.Auth;

public sealed class ClientAccessService(LongBeachDbContext db, IPasswordHasher passwords, TimeProvider time) : IClientAccess
{
    private const string Activation = "Activation", Recovery = "Recovery";
    private CustomerService Registry => new(db, time);
    private static void Require(bool value, string message, int status = 400)
    { if (!value) throw new CustomerRuleException(message, status); }
    private static string Secret() => Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
    private static string Hash(string token) => Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(token)));
    private static bool TokenShape(string? token) => token is { Length: 64 } && token.All(char.IsAsciiHexDigit);
    private async Task<T> Write<T>(Func<Task<T>> action, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // Same order for registration, activation, method changes and customer association.
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(724031906)", ct);
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(724031907)", ct);
        try
        {
            var result = await action();
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return result;
        }
        catch (DbUpdateException error) when (error.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        { throw new CustomerRuleException("Este acesso já está em uso. Entre com sua conta ou peça à gestão para conferir o vínculo.", 409); }
        catch (DbUpdateConcurrencyException)
        { throw new CustomerRuleException("O acesso mudou. Atualize a página antes de continuar.", 409); }
    }
    private async Task<Customer> Customer(Guid id, CancellationToken ct)
    {
        var item = await db.Set<Customer>().SingleOrDefaultAsync(x => x.Id == id, ct);
        Require(item is not null && item.MergedIntoId is null, "Abra o cadastro atual deste cliente.", 409);
        Require(item!.Status == "Ativo", "Ative o cadastro antes de preparar o acesso.", 409);
        return item;
    }
    private async Task<User> UserAccount(Guid id, CancellationToken ct)
    {
        var user = await db.Users.Include(x => x.UserRoles).ThenInclude(x => x.Role)
            .Include(x => x.RefreshTokens).SingleOrDefaultAsync(x => x.Id == id, ct);
        Require(user is not null && user.IsActive && !user.RequiresFirstAccess && ProfileAccess.HasValidProfile(user.GetRoleNames()),
            "Conta de acesso indisponível. Peça à gestão para conferir.", 409);
        return user!;
    }
    private async Task<bool> Guardian(Guid id, CancellationToken ct) => (await CustomerGuardianScope.Load(db, ct)).Controlled(id);
    private static void Version(Customer customer, int expected) => Require(customer.Version == expected, "Este cliente mudou. Atualize antes de continuar.", 409);
    private async Task CheckUsername(string username, Guid? own, CancellationToken ct)
    {
        Require(!string.IsNullOrWhiteSpace(username) && System.Text.RegularExpressions.Regex.IsMatch(username.Trim().ToLowerInvariant(), "^[a-z][a-z0-9._-]{2,63}$"),
            "Usuário: use de 3 a 64 letras, números, pontos, hífens ou sublinhados, começando por uma letra.");
        var normal = User.NormalizeEmail(username);
        Require(!await db.Users.AnyAsync(x => x.NormalizedUsername == normal && x.Id != own, ct), "Este usuário está indisponível. Escolha outro.", 409);
    }
    private static void ValidateGoogle(VerifiedGoogleIdentity google) => Require(!string.IsNullOrWhiteSpace(google.Subject)
        && google.Subject.Length <= 255 && !string.IsNullOrWhiteSpace(google.Email) && google.Email.Length <= 320, "Não foi possível confirmar o Google.", 401);
    private async Task<User> NewLocal(string name, string username, string password, CancellationToken ct)
    {
        await CheckUsername(username, null, ct); PasswordPolicy.EnsureStrong(password);
        var user = User.Create(name[..Math.Min(name.Length, 160)], $"{Guid.NewGuid():N}@unlinked.longbeach.invalid", passwords.Hash(password));
        user.SetUsername(username); user.AssignRole(await db.Roles.SingleAsync(x => x.Name == SystemRoles.Student, ct));
        db.Users.Add(user); return user;
    }
    private async Task<User> GoogleUser(VerifiedGoogleIdentity google, string name, CancellationToken ct)
    {
        ValidateGoogle(google);
        var existing = await db.Users.SingleOrDefaultAsync(x => x.GoogleSubject == google.Subject, ct);
        if (existing is not null) return await UserAccount(existing.Id, ct);
        Require(!await db.Users.AnyAsync(x => x.NormalizedEmail == User.NormalizeEmail(google.Email), ct),
            "Já existe uma conta para esse acesso. Entre nela para vincular o Google.", 409);
        var hash = passwords.Hash(Secret());
        var user = User.Create(name[..Math.Min(name.Length, 160)], google.Email, hash);
        user.LinkGoogle(google.Subject, google.Email); user.DisableLocalPassword(hash);
        user.AssignRole(await db.Roles.SingleAsync(x => x.Name == SystemRoles.Student, ct)); db.Users.Add(user); return user;
    }
    public Task Register(ClientRegistrationInput input, CancellationToken ct) => Write(async () =>
    {
        // Contact e-mail is not a verified login identity. Local sign-in uses the unique username.
        var contact = new Customer(input.Name, input.Phone, input.Email, "public");
        var user = await NewLocal(contact.Name, input.Username, input.Password, ct);
        db.Add(contact);
        await Registry.EnsureSourceAsync(new("users", user.Id, null, contact.Name, contact.Phone, contact.Email, contact.Id), ct);
        return true;
    }, ct);
    public Task RegisterGoogle(GoogleRegistrationInput input, VerifiedGoogleIdentity google, CancellationToken ct) => Write(async () =>
    {
        var contact = new Customer(input.Name, input.Phone, google.Email, "public-google");
        var user = await GoogleUser(google, contact.Name, ct);
        // Existing linked identities are never overwritten by a repeated public signup.
        var existing = await db.Set<Customer>().SingleOrDefaultAsync(x => x.UserId == user.Id, ct);
        if (existing is not null)
        {
            Require(existing.MergedIntoId is null && existing.Status == "Ativo", "Peça à gestão para conferir seu cadastro.", 409);
            if (existing.Incomplete) existing.Change(contact.Name, contact.Phone, contact.Email, existing.Status);
            return true;
        }
        Require(user.GetRoleNames().SequenceEqual([SystemRoles.Student]), "Use sua área pessoal para concluir o cadastro.", 409);
        db.Add(contact);
        await Registry.EnsureSourceAsync(new("users", user.Id, null, contact.Name, contact.Phone, contact.Email, contact.Id), ct);
        return true;
    }, ct);
    public async Task<CustomerAccessStatus> Status(Guid customer, CancellationToken ct)
    {
        var person = await db.Set<Customer>().AsNoTracking().SingleOrDefaultAsync(x => x.Id == customer, ct)
            ?? throw new CustomerRuleException("Cliente não encontrado.", 404);
        Require(person.MergedIntoId is null, "Abra o cadastro atual deste cliente.", 409);
        var guardian = await Guardian(customer, ct);
        var user = person.UserId is Guid id ? await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct) : null;
        var invite = await db.Set<ClientAccessChallenge>().AsNoTracking().Where(x => x.CustomerId == customer && x.Purpose == Activation
            && x.ConsumedAtUtc == null && x.RevokedAtUtc == null && x.ExpiresAtUtc > time.GetUtcNow() && x.CustomerVersion == person.Version)
            .OrderByDescending(x => x.ExpiresAtUtc).FirstOrDefaultAsync(ct);
        var state = person.Status != "Ativo" || user is { IsActive: false } ? "Blocked" : guardian ? "Guardian" : user is { RequiresFirstAccess: true } ? "FirstAccess" : user is not null ? "Active" : invite is not null ? "Invited" : "Pending";
        return new(state, user?.Id, user?.Username, user?.GoogleSubject is not null, user?.LocalPasswordEnabled ?? false, invite?.ExpiresAtUtc);
    }
    public Task<AccessIssued> Issue(Guid customer, AccessIssueInput input, Guid actor, bool recovery, CancellationToken ct) => Write(async () =>
    {
        var person = await Customer(customer, ct); Version(person, input.ExpectedVersion);
        Require(input.IdentityConfirmed, "Confirme a identidade antes de preparar o acesso.");
        Require(!await Guardian(customer, ct), "Este cadastro usa o acesso do responsável.", 409);
        User? user = null;
        if (recovery)
        {
            Require(person.UserId is not null, "Este cliente ainda precisa ativar o acesso.", 409);
            user = await UserAccount(person.UserId!.Value, ct);
            // Customer recovery must not become a way to take over an internal profile.
            Require(user.GetRoleNames().SequenceEqual([SystemRoles.Student]), "A recuperação de contas da equipe exige o procedimento administrativo próprio.", 409);
        }
        else Require(person.UserId is null, "Este cliente já possui conta. Use a recuperação de acesso.", 409);
        await RevokeChallenges(customer, ct);
        var token = Secret(); var purpose = recovery ? Recovery : Activation;
        var expires = time.GetUtcNow().Add(recovery ? TimeSpan.FromMinutes(30) : TimeSpan.FromDays(7));
        db.Add(new ClientAccessChallenge(customer, user?.Id, purpose, Hash(token), expires, actor, person.Version, user?.CredentialVersion));
        // Deliberately no replay receipt: only the hash can be stored, never the returned secret.
        return new AccessIssued(token, expires, purpose);
    }, ct);
    private async Task RevokeChallenges(Guid customer, CancellationToken ct)
    {
        foreach (var row in await db.Set<ClientAccessChallenge>().Where(x => x.CustomerId == customer && x.ConsumedAtUtc == null && x.RevokedAtUtc == null).ToListAsync(ct))
            row.Revoke(time.GetUtcNow());
    }
    public Task Revoke(Guid customer, AccessIssueInput input, CancellationToken ct) => Write(async () =>
    { var person = await Customer(customer, ct); Version(person, input.ExpectedVersion); await RevokeChallenges(customer, ct); return true; }, ct);
    private async Task<(ClientAccessChallenge Challenge, Customer Person)> Challenge(string token, string? purpose, CancellationToken ct)
    {
        Require(TokenShape(token), "Link inválido ou expirado. Peça um novo à gestão.", 400);
        var hash = Hash(token);
        var challenge = await db.Set<ClientAccessChallenge>().SingleOrDefaultAsync(x => x.TokenHash == hash, ct);
        Require(challenge is not null && challenge.Usable(time.GetUtcNow()) && (purpose is null || challenge.Purpose == purpose),
            "Link inválido ou expirado. Peça um novo à gestão.", 400);
        var person = await Customer(challenge!.CustomerId, ct);
        Require(person.Version == challenge.CustomerVersion && person.UserId == challenge.UserId && !await Guardian(person.Id, ct),
            "O vínculo deste acesso mudou. Peça um novo link à gestão.", 409);
        if (challenge.UserId is Guid id)
        {
            var user = await UserAccount(id, ct);
            Require(user.CredentialVersion == challenge.CredentialVersion, "Link inválido ou expirado. Peça um novo à gestão.", 400);
            Require(user.GetRoleNames().SequenceEqual([SystemRoles.Student]), "A recuperação desta conta exige conferência administrativa.", 409);
        }
        return (challenge, person);
    }
    public async Task<AccessInspection> Inspect(string token, CancellationToken ct)
    { var (row, _) = await Challenge(token, null, ct); return new(row.Purpose, row.ExpiresAtUtc); }
    public Task Activate(AccessActivationInput input, CancellationToken ct) => Write(async () =>
    {
        var (row, person) = await Challenge(input.Token, Activation, ct);
        var user = await NewLocal(person.Name, input.Username, input.Password, ct);
        await Registry.EnsureSourceAsync(new("users", user.Id, null, person.Name, person.Phone, person.Email, person.Id, person.Incomplete), ct);
        row.Consume(time.GetUtcNow()); await RevokeChallenges(person.Id, ct); return true;
    }, ct);
    public Task ActivateGoogle(string token, VerifiedGoogleIdentity google, CancellationToken ct) => Write(async () =>
    {
        var (row, person) = await Challenge(token, Activation, ct);
        var user = await GoogleUser(google, person.Name, ct);
        var other = await db.Set<Customer>().SingleOrDefaultAsync(x => x.UserId == user.Id, ct);
        Require(other is null || other.Id == person.Id, "Essa conta pertence a outro cadastro. Peça à gestão para conferir o vínculo.", 409);
        Require(user.GetRoleNames().SequenceEqual([SystemRoles.Student]), "Use uma conta de cliente para ativar o convite.", 409);
        await Registry.EnsureSourceAsync(new("users", user.Id, null, person.Name, person.Phone, person.Email, person.Id, person.Incomplete), ct);
        row.Consume(time.GetUtcNow()); await RevokeChallenges(person.Id, ct); return true;
    }, ct);
    public Task Recover(AccessActivationInput input, CancellationToken ct) => Write(async () =>
    {
        var (row, person) = await Challenge(input.Token, Recovery, ct);
        var user = await UserAccount(row.UserId!.Value, ct);
        await CheckUsername(input.Username, user.Id, ct); PasswordPolicy.EnsureStrong(input.Password);
        user.SetUsername(input.Username); user.SetLocalPassword(passwords.Hash(input.Password));
        user.InvalidateCredentials(time.GetUtcNow(), null, "Assisted customer access recovery");
        row.Consume(time.GetUtcNow()); await RevokeChallenges(person.Id, ct); return true;
    }, ct);
    public async Task<AuthMethods> Methods(Guid user, CancellationToken ct)
    { var person = await UserAccount(user, ct); return new(person.Username, person.GoogleSubject is not null, person.LocalPasswordEnabled); }
    public async Task<AccessReadiness> Readiness(CancellationToken ct)
    {
        var scope = await CustomerGuardianScope.Load(db, ct);
        var people = scope.Customers.Values.Where(x => x.MergedIntoId is null).ToArray();
        var users = await db.Users.AsNoTracking().Include(x => x.UserRoles).ThenInclude(x => x.Role).ToArrayAsync(ct);
        var clientUsers = users.Where(x => x.GetRoleNames().SequenceEqual([SystemRoles.Student])).ToArray();
        var linkedUsers = people.Where(x => x.UserId is not null).Select(x => x.UserId!.Value).ToHashSet();
        var review = new List<AccessReviewItem>();
        foreach (var person in people)
        {
            if (person.Incomplete) review.Add(new("IncompleteCustomer", person.Id, person.UserId));
            if (person.UserId is null && !scope.Controlled(person.Id)) review.Add(new("PendingAccess", person.Id, null));
            if (person.UserId is Guid userId && users.SingleOrDefault(x => x.Id == userId) is { IsActive: false })
                review.Add(new("InactiveAccount", person.Id, userId));
            if (scope.Controlled(person.Id)) review.Add(new("ReviewGuardianAuthorization", person.Id, null));
        }
        foreach (var user in clientUsers.Where(x => !linkedUsers.Contains(x.Id))) review.Add(new("ClientWithoutCustomer", null, user.Id));
        var sharedPhones = people.Where(x => LongBeach.Domain.Customers.Customer.ValidPhone(x.Phone)).GroupBy(x => x.Phone).Where(x => x.Count() > 1).SelectMany(x => x);
        var sharedEmails = people.Where(x => !string.IsNullOrWhiteSpace(x.Email)).GroupBy(x => x.Email!, StringComparer.OrdinalIgnoreCase).Where(x => x.Count() > 1).SelectMany(x => x);
        foreach (var person in sharedPhones.Concat(sharedEmails).DistinctBy(x => x.Id)) review.Add(new("ReviewSharedContact", person.Id, person.UserId));
        var studentSources = await db.Set<CustomerSourceLink>().AsNoTracking().Where(x => x.Kind == "students" && x.CustomerId != null).ToArrayAsync(ct);
        var billedStudents = await db.Set<LongBeach.Domain.Billing.BillingAccount>().AsNoTracking().Where(x => x.StudentId != null).Select(x => new { x.StudentId, x.UserId }).ToArrayAsync(ct);
        foreach (var source in studentSources)
        {
            var customer = scope.Canonical(source.CustomerId!.Value);
            if (customer != Guid.Empty && billedStudents.Any(x => x.StudentId == source.SourceId && x.UserId != scope.Customers[customer].UserId))
                review.Add(new("ReviewSchoolResponsible", customer, null));
        }
        return new(time.GetUtcNow(), people.Length, people.Count(x => x.UserId is not null),
            people.Count(x => x.UserId is null && !scope.Controlled(x.Id)), people.Count(x => scope.Controlled(x.Id)),
            clientUsers.Count(x => !linkedUsers.Contains(x.Id)), review.Distinct().OrderBy(x => x.Reason).ThenBy(x => x.CustomerId).ThenBy(x => x.UserId).ToArray());
    }
    public Task ChangeMethods(Guid user, AuthMethodsInput input, VerifiedGoogleIdentity? google, string? ip, CancellationToken ct) => Write(async () =>
    {
        var person = await UserAccount(user, ct);
        var passwordValid = person.LocalPasswordEnabled && passwords.Verify(input.CurrentPassword ?? "", person.PasswordHash) != PasswordHashVerificationResult.Failed;
        if (google is not null) ValidateGoogle(google);
        var ownGoogle = google is not null && person.GoogleSubject == google.Subject;
        if (input.Action == "password")
        {
            Require(passwordValid || ownGoogle, "Confirme seu acesso atual antes de definir a senha.");
            var username = input.Username ?? person.Username ?? ""; await CheckUsername(username, user, ct);
            PasswordPolicy.EnsureStrong(input.NewPassword ?? "");
            Require(passwords.Verify(input.NewPassword!, person.PasswordHash) == PasswordHashVerificationResult.Failed, "Escolha uma senha diferente da atual.");
            person.SetUsername(username); person.SetLocalPassword(passwords.Hash(input.NewPassword!));
        }
        else if (input.Action == "google")
        {
            Require(passwordValid && google is not null, "Confirme a senha atual e a conta Google.");
            Require(person.GoogleSubject is null || ownGoogle, "Esta conta já possui outro Google vinculado.", 409);
            Require(!await db.Users.AnyAsync(x => x.Id != user && (x.GoogleSubject == google!.Subject || x.NormalizedEmail == User.NormalizeEmail(google.Email)), ct),
                "O Google já pertence a outra conta. Peça à gestão para conferir.", 409);
            person.LinkGoogle(google!.Subject, google.Email);
        }
        else throw new CustomerRuleException("Escolha o método de acesso.");
        person.InvalidateCredentials(time.GetUtcNow(), ip, "Authentication method changed");
        // Outstanding recovery links cannot undo a subsequent authenticated change.
        var customer = await db.Set<Customer>().SingleOrDefaultAsync(x => x.UserId == user, ct);
        if (customer is not null) await RevokeChallenges(customer.Id, ct);
        return true;
    }, ct);
}
