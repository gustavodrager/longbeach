using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using LongBeach.Application.Billing;
using LongBeach.Application.Messaging;
using LongBeach.Contracts.Messaging;
using LongBeach.Domain.Billing;
using LongBeach.Domain.Customers;
using LongBeach.Domain.Messaging;
using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.Infrastructure.Messaging;

public sealed class MessagingContextService(LongBeachDbContext db, IMessaging messaging, IBilling billing, TimeProvider time) : IMessagingContext
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly string[] CalendarKinds = ["students", "classes", "enrollments", "rentalGroups", "reservations", "courts", "portalExceptions"];
    public async Task<MessagingContextDto> GetAsync(Guid conversationId, bool canViewBar, CancellationToken ct)
    {
        var conversation = await db.Set<MessagingConversation>().AsNoTracking().SingleOrDefaultAsync(row => row.Id == conversationId, ct)
            ?? throw new MessagingRuleException("Conversa não encontrada.", 404);
        var customer = conversation.CustomerId is Guid id ? await db.Set<Customer>().AsNoTracking().SingleOrDefaultAsync(row => row.Id == id && row.MergedIntoId == null, ct) : null;
        if (customer is null || !conversation.IdentityVerified)
            return new(customer?.Id, customer?.Name, [], false, conversation.ConsentForReminders, [], [], false);
        var activities = await ActivitiesAsync(conversation, ct);
        var accounts = new List<MessagingBarAccountDto>();
        if (canViewBar && customer.UserId is Guid owner && await db.Users.AnyAsync(user => user.Id == owner && user.IsActive, ct))
        {
            var owned = await db.Set<BillingAccount>().AsNoTracking().Where(account => account.Kind == "Bar" && account.UserId == owner).Select(account => account.Id).ToArrayAsync(ct);
            foreach (var accountId in owned)
            {
                var account = await billing.Account(accountId, owner, ct);
                var outstanding = Math.Max(0, account.Total - account.Paid);
                if (outstanding <= 0 && account.Pending <= 0) continue;
                accounts.Add(new(account.Id, account.Title, outstanding, $"/atendimento/comandas/{account.SourceId}", account.Pending, account.Payable));
            }
        }
        var profiles = activities.Select(activity => activity.Kind == "Class" ? "Aluno" : "Mensalista")
            .Concat(accounts.Count > 0 ? ["Bar"] : Array.Empty<string>()).Distinct().ToArray();
        return new(customer.Id, customer.Name, profiles, true, conversation.ConsentForReminders, activities, accounts, canViewBar);
    }
    public async Task<IReadOnlyList<MessagingActivityDto>> ActivitiesAsync(MessagingConversation conversation, CancellationToken ct, DateOnly? from = null, DateOnly? until = null)
    {
        if (!conversation.IdentityVerified || conversation.CustomerId is not Guid customerId
            || !await db.Set<Customer>().AnyAsync(customer => customer.Id == customerId && customer.MergedIntoId == null && customer.Status == "Ativo", ct)) return [];
        var links = await db.Set<CustomerSourceLink>().AsNoTracking().Where(link => link.Kind == "students" || link.Kind == "rentalMembers").ToArrayAsync(ct);
        var records = await db.OperationalRecords.AsNoTracking().Where(row => CalendarKinds.Contains(row.Kind)).ToListAsync(ct);
        var today = MessagingCalendar.Today(time.GetUtcNow());
        var activities = MessagingCalendar.Build(customerId, links, records, from ?? today, until ?? today.AddDays(14));
        var rsvps = await db.OperationalRecords.AsNoTracking().Where(row => row.Kind == "messagingRsvps").ToArrayAsync(ct);
        var saved = rsvps.ToDictionary(row => row.Id, row => JsonSerializer.Deserialize<JsonElement>(row.Payload));
        return activities.Select(activity =>
        {
            var key = ConfirmationId(conversation.Id, activity);
            if (!saved.TryGetValue(key, out var value) || MessagingCalendar.Text(value, "fingerprint") != MessagingCalendar.Fingerprint(activity)) return activity;
            var status = MessagingCalendar.Text(value, "status");
            return activity with { Confirmation = status is "Going" or "NotGoing" ? status : "Pending", Version = value.TryGetProperty("version", out var version) ? version.GetInt32() : 0 };
        }).ToArray();
    }
    public static Guid ConfirmationId(Guid conversationId, MessagingActivityDto activity) => MessagingCalendar.StableId("rsvp", $"{conversationId}:{MessagingCalendar.OccurrenceId(activity)}");
    public async Task<MessagingActivityDto> ConfirmAsync(Guid conversationId, SaveMessagingConfirmationInput input, CancellationToken ct)
    {
        if (input.OperationId == Guid.Empty || input.Status is not ("Going" or "NotGoing")) throw new MessagingRuleException("Confira a confirmação e a identificação da operação.");
        var fingerprint = JsonSerializer.Serialize(new { conversationId, input }, Json);
        await using var transaction = db.Database.CurrentTransaction is null ? await db.Database.BeginTransactionAsync(ct) : null;
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({0x4c424d5347L})", ct);
        var previous = await db.OperationalRecords.SingleOrDefaultAsync(row => row.Id == input.OperationId, ct);
        if (previous is not null)
        {
            using var record = JsonDocument.Parse(previous.Payload);
            if (previous.Kind != "messagingRsvpOps" || MessagingCalendar.Text(record.RootElement, "fingerprint") != fingerprint)
                throw new MessagingRuleException("Esta operação já foi utilizada. Confira a mesma confirmação.", 409);
            return record.RootElement.GetProperty("result").Deserialize<MessagingActivityDto>(Json)!;
        }
        var conversation = await db.Set<MessagingConversation>().AsNoTracking().SingleOrDefaultAsync(row => row.Id == conversationId, ct)
            ?? throw new MessagingRuleException("Conversa não encontrada.", 404);
        var activity = (await ActivitiesAsync(conversation, ct)).SingleOrDefault(row => row.Kind == input.Kind && row.Id == input.ActivityId && row.SubjectId == input.SubjectId && row.Date == input.Date)
            ?? throw new MessagingRuleException("O encontro não está disponível para este contato. Confira o vínculo e a agenda.", 409);
        if (MessagingCalendar.StartsAt(activity) <= time.GetUtcNow()) throw new MessagingRuleException("O encontro já começou. A equipe registra a presença real separadamente.", 409);
        MessagingRules.Version(activity.Version, input.ExpectedVersion);
        var result = activity with { Confirmation = input.Status, Version = activity.Version + 1 };
        var id = ConfirmationId(conversationId, activity);
        var payload = JsonSerializer.Serialize(new { conversationId, customerId = conversation.CustomerId, occurrenceId = MessagingCalendar.OccurrenceId(activity), fingerprint = MessagingCalendar.Fingerprint(activity), status = input.Status, version = result.Version, updatedAtUtc = time.GetUtcNow() }, Json);
        var existing = await db.OperationalRecords.SingleOrDefaultAsync(row => row.Id == id, ct);
        if (existing is null) db.Add(new OperationalRecord(id, "messagingRsvps", "Confirmação antecipada", payload));
        else existing.Update("Confirmação antecipada", payload);
        db.Add(new OperationalRecord(input.OperationId, "messagingRsvpOps", "Operação de confirmação", JsonSerializer.Serialize(new { fingerprint, result }, Json)));
        await db.SaveChangesAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        return result;
    }
    public async Task<MessageDto> SendBarStatementAsync(Guid conversationId, SendMessagingBarStatementInput input, Guid actor, CancellationToken ct)
    {
        // The queue revalidates and regenerates this statement immediately before transport.
        var text = await BarStatementAsync(conversationId, input.AccountId, ct);
        return await messaging.SendAsync(conversationId, new(input.OperationId, text, Purpose: "BarStatement", ContextKind: "Bar", ContextId: input.AccountId), actor, ct);
    }
    public async Task<string> BarStatementAsync(Guid conversationId, Guid accountId, CancellationToken ct)
    {
        var conversation = await db.Set<MessagingConversation>().AsNoTracking().SingleOrDefaultAsync(row => row.Id == conversationId, ct);
        if (conversation is not { IdentityVerified: true, CustomerId: not null }) throw new MessagingRuleException("A gestão precisa conferir o vínculo deste contato antes de enviar uma conta.", 403);
        var customer = await db.Set<Customer>().AsNoTracking().SingleOrDefaultAsync(row => row.Id == conversation.CustomerId && row.MergedIntoId == null && row.Status == "Ativo", ct);
        if (customer?.UserId is not Guid owner || !await db.Users.AnyAsync(user => user.Id == owner && user.IsActive, ct)
            || !await db.Set<BillingAccount>().AnyAsync(account => account.Id == accountId && account.Kind == "Bar" && account.UserId == owner, ct))
            throw new MessagingRuleException("Esta conta não está vinculada ao responsável autorizado deste contato.", 403);
        var account = await billing.Account(accountId, owner, ct);
        var culture = CultureInfo.GetCultureInfo("pt-BR");
        var amount = Math.Max(0, account.Total - account.Paid).ToString("C", culture);
        var pending = account.Pending > 0 ? $"\nAguardando confirmação de pagamento: {account.Pending.ToString("C", culture)}.\nDisponível para novo pagamento: {account.Payable.ToString("C", culture)}." : "";
        return $"LongBeach · {account.Title}\nSaldo em aberto neste momento: {amount}.{pending}\nConfira os detalhes na sua área: https://longbeach.quebranunca.com.br/minha-area/pagamentos?conta={account.Id}\nSe precisar, nossa equipe pode ajudar.";
    }
}
