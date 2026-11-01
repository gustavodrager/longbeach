using System.Globalization;
using System.Text.Json;
using LongBeach.Application.Messaging;
using LongBeach.Contracts.Messaging;
using LongBeach.Domain.Messaging;
using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.Infrastructure.Messaging;

public sealed class MessagingAutomation(LongBeachDbContext db, IMessaging messaging, MessagingContextService context,
    IMessagingAi ai, MessagingScheduleGate gate, TimeProvider time) : IMessagingAutomation
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private sealed record Invitation(Guid ConversationId, Guid OccurrenceId, string Fingerprint, MessagingActivityDto Activity);
    private sealed record PrivateActivity(Guid OccurrenceId, string Fingerprint, string? Confirmation, int? Version);
    private sealed record PrivateReply(Guid CustomerId, IReadOnlyList<PrivateActivity> Activities);
    private static string Describe(MessagingActivityDto activity) => $"{activity.SubjectName} · {activity.Label}, {activity.Date:dd/MM/yyyy} às {activity.StartTime}, {activity.Court}";
    private Task Lock(CancellationToken ct) => db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({MessagingService.ArenaLockKey})", ct);

    public async Task TickAsync(CancellationToken ct)
    {
        var now = time.GetUtcNow();
        if (!gate.Take(now)) return;
        var settings = await messaging.SettingsAsync(ct);
        if (!settings.BotEnabled || !TimeOnly.TryParseExact(settings.ReminderTime, "HH:mm", out var clock)) return;
        var local = TimeZoneInfo.ConvertTime(now, MessagingCalendar.ArenaZone);
        var scheduled = new DateTimeOffset(local.Date.Add(clock.ToTimeSpan()), local.Offset);
        // Never flush yesterday's reminders after an outage. A short same-day recovery window is sufficient.
        if (local < scheduled || local >= scheduled.AddHours(1)) return;
        var date = DateOnly.FromDateTime(local.Date).AddDays(1);
        var conversations = await db.Set<MessagingConversation>().AsNoTracking()
            .Where(row => row.IdentityVerified && row.ConsentForReminders && row.Mode == "Bot").ToArrayAsync(ct);
        foreach (var conversation in conversations)
        {
            var activities = await context.ActivitiesAsync(conversation, ct, date, date);
            foreach (var activity in activities.Where(row => row.Confirmation == "Pending" && (row.Kind == "Class" ? settings.ClassRemindersEnabled : settings.RentalRemindersEnabled)))
            {
                var operation = MessagingCalendar.StableId("reminder", $"{conversation.Id}:{MessagingCalendar.Fingerprint(activity)}");
                await using var tx = await db.Database.BeginTransactionAsync(ct); await Lock(ct);
                var current = await db.Set<MessagingConversation>().SingleAsync(row => row.Id == conversation.Id, ct);
                await db.Entry(current).ReloadAsync(ct);
                if (current.Mode == "Bot" && current.IdentityVerified && current.ConsentForReminders)
                    await InviteAsync(current, activity, operation, ct, true);
                await tx.CommitAsync(ct);
            }
        }
    }
    private async Task<MessageDto> InviteAsync(MessagingConversation conversation, MessagingActivityDto activity, Guid operationId, CancellationToken ct, bool reminder = false)
    {
        var invitationId = MessagingCalendar.StableId("invitation", $"{conversation.Id}:{MessagingCalendar.Fingerprint(activity)}");
        if (!await db.OperationalRecords.AnyAsync(row => row.Id == invitationId, ct))
            db.Add(new OperationalRecord(invitationId, "messagingInvites", "Convite de confirmação", JsonSerializer.Serialize(
                new Invitation(conversation.Id, MessagingCalendar.OccurrenceId(activity), MessagingCalendar.Fingerprint(activity), activity), Json)));
        await db.SaveChangesAsync(ct);
        return await messaging.QueueAutomationAsync(conversation.Id,
            $"Olá! Você vai participar deste encontro?\n{Describe(activity)}\nResponda ‘vou’ ou ‘não vou’. Isso confirma sua intenção; a presença real é registrada pela equipe.",
            reminder ? activity.Kind == "Class" ? "ClassReminder" : "RentalReminder" : "ConfirmationRequest", activity.Kind, invitationId, activity.Date, null, operationId, ct);
    }
    public async Task OnIncomingAsync(Guid conversationId, Guid messageId, CancellationToken ct)
    {
        var message = await db.Set<MessagingMessage>().AsNoTracking().SingleAsync(row => row.Id == messageId && row.ConversationId == conversationId, ct);
        var conversation = await db.Set<MessagingConversation>().SingleAsync(row => row.Id == conversationId, ct);
        var settings = await messaging.SettingsAsync(ct);
        if (!settings.BotEnabled || conversation.Mode != "Bot" || message.IsHistory || message.Direction != "Inbound") return;
        var now = time.GetUtcNow(); var operation = MessagingCalendar.StableId("reply", messageId.ToString());
        if (await db.Set<MessagingMessage>().AnyAsync(row => row.OperationId == operation, ct)) return;
        // Old/offline messages go to the team; opening a new session must never reply to an old inbox.
        if (message.OccurredAtUtc < now.AddMinutes(-15) || message.AttachmentId is not null)
        { conversation.Pause(); await db.SaveChangesAsync(ct); return; }
        if (await db.Set<MessagingMessage>().AnyAsync(row => row.ConversationId == conversationId && row.OccurredAtUtc > message.OccurredAtUtc && (row.Origin == "Staff" || row.Origin == "Phone"), ct)) return;
        var activities = (await context.ActivitiesAsync(conversation, ct)).Where(activity => MessagingCalendar.StartsAt(activity) > now).ToArray();
        var originalActivities = activities;
        var originalCustomer = conversation.CustomerId;
        var originalVerified = conversation.IdentityVerified;
        var faqs = await messaging.FaqsAsync(ct);
        var normalized = message.Text.Trim().ToLowerInvariant().TrimEnd('.', '!', '?');
        var stop = normalized is "parar" or "sair" or "pare" or "não quero lembretes" or "nao quero lembretes";
        var invitations = await SentInvitations(conversationId, message.OccurredAtUtc, ct);
        var validInvitations = invitations.Where(invite => activities.Any(activity => MessagingCalendar.OccurrenceId(activity) == invite.OccurrenceId && MessagingCalendar.Fingerprint(activity) == invite.Fingerprint)).ToArray();
        var answer = normalized is "vou" or "sim" or "confirmo" or "pode confirmar" ? "Going"
            : normalized is "não vou" or "nao vou" or "não" or "nao" ? "NotGoing" : null;
        MessagingAiDecision decision;
        if (stop) decision = new("stop");
        else if (answer is not null && validInvitations.Length == 1)
            decision = new("confirm", ActivityKey: validInvitations[0].OccurrenceId.ToString(), Confirmation: answer);
        else if (answer is not null) decision = new("agenda");
        else
        {
            var exact = faqs.FirstOrDefault(faq => faq.Approved && string.Equals(faq.Question.Trim().TrimEnd('?', '.', '!'), normalized, StringComparison.OrdinalIgnoreCase));
            if (exact is not null) decision = new("faq", exact.Id.ToString());
            else
            {
                try { decision = await ai.DecideAsync(message.Text, faqs, activities, ct); }
                catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException or JsonException) { decision = new("human"); }
            }
        }
        await using var tx = await db.Database.BeginTransactionAsync(ct); await Lock(ct);
        await db.Entry(conversation).ReloadAsync(ct);
        settings = await messaging.SettingsAsync(ct);
        if (conversation.Mode != "Bot" || !settings.BotEnabled) return;
        if (conversation.CustomerId != originalCustomer || conversation.IdentityVerified != originalVerified) return;
        if (await db.Set<MessagingMessage>().AnyAsync(row => row.OperationId == operation, ct)) return;
        // Rebuild current authorizations and schedule after a model request, before performing any action.
        activities = (await context.ActivitiesAsync(conversation, ct)).Where(activity => MessagingCalendar.StartsAt(activity) > time.GetUtcNow()).ToArray();
        string text; string? replyContextKind = null; Guid? replyContextId = null;
        IReadOnlyList<PrivateActivity>? privateActivities = null;
        switch (decision.Action)
        {
            case "stop":
                conversation.Link(conversation.CustomerId, conversation.IdentityVerified, false);
                text = "Os lembretes foram interrompidos para este contato. Você pode continuar falando com a equipe por aqui.";
                break;
            case "faq":
                var approved = await db.Set<MessagingFaq>().AsNoTracking().SingleOrDefaultAsync(faq => faq.Id.ToString() == decision.FaqId && faq.Approved, ct);
                text = approved?.Answer ?? "Vou encaminhar sua dúvida para a equipe da LongBeach.";
                if (approved is null) conversation.Pause();
                else { replyContextKind = "ApprovedFaq"; replyContextId = approved.Id; }
                break;
            case "agenda":
                text = !conversation.IdentityVerified ? "A equipe precisa conferir seu vínculo antes de consultar seus encontros. Vou encaminhar seu atendimento."
                    : activities.Length == 0 ? "Não encontrei encontros futuros vinculados ao seu cadastro. Nossa equipe pode conferir."
                    : "Seus próximos encontros:\n" + string.Join("\n", activities.Take(6).Select(Describe)) + "\nDiga qual encontro você deseja confirmar.";
                if (!conversation.IdentityVerified || activities.Length == 0) conversation.Pause();
                else privateActivities = activities.Take(6).Select(activity => new PrivateActivity(MessagingCalendar.OccurrenceId(activity), MessagingCalendar.Fingerprint(activity), null, null)).ToArray();
                break;
            case "confirm":
                var selected = activities.SingleOrDefault(activity => MessagingCalendar.OccurrenceId(activity).ToString() == decision.ActivityKey);
                if (selected is null || decision.Confirmation is not ("Going" or "NotGoing"))
                { text = "O encontro mudou ou não está disponível para confirmação. Nossa equipe vai conferir."; conversation.Pause(); break; }
                var initial = originalActivities.SingleOrDefault(activity => MessagingCalendar.OccurrenceId(activity) == MessagingCalendar.OccurrenceId(selected));
                var confirmationRecord = await db.OperationalRecords.AsNoTracking().SingleOrDefaultAsync(row => row.Id == MessagingContextService.ConfirmationId(conversation.Id, selected), ct);
                var changedAfterMessage = false;
                if (confirmationRecord is not null)
                {
                    using var savedConfirmation = JsonDocument.Parse(confirmationRecord.Payload);
                    if (savedConfirmation.RootElement.TryGetProperty("updatedAtUtc", out var updated) && updated.TryGetDateTimeOffset(out var updatedAt))
                        changedAfterMessage = updatedAt > message.OccurredAtUtc;
                }
                if (initial is null || initial.Version != selected.Version || MessagingCalendar.Fingerprint(initial) != MessagingCalendar.Fingerprint(selected) || changedAfterMessage)
                { text = "Esta confirmação foi ajustada enquanto sua mensagem era atendida. Nossa equipe vai conferir antes de alterar novamente."; conversation.Pause(); break; }
                if (!validInvitations.Any(invite => invite.OccurrenceId == MessagingCalendar.OccurrenceId(selected) && invite.Fingerprint == MessagingCalendar.Fingerprint(selected)))
                {
                    await InviteAsync(conversation, selected, operation, ct); await tx.CommitAsync(ct); return;
                }
                var confirmed = await context.ConfirmAsync(conversation.Id, new(MessagingCalendar.StableId("confirm", messageId.ToString()), selected.Kind,
                    selected.Id, selected.SubjectId, selected.Date, decision.Confirmation, selected.Version), ct);
                text = $"Registrado: {(confirmed.Confirmation == "Going" ? "você vai" : "você não vai")} ao encontro.\n{Describe(confirmed)}\nA reserva e a presença real não foram alteradas.";
                privateActivities = [new(MessagingCalendar.OccurrenceId(confirmed), MessagingCalendar.Fingerprint(confirmed), confirmed.Confirmation, confirmed.Version)];
                break;
            case "bar":
                var financial = await context.GetAsync(conversationId, true, ct);
                if (financial.BarAccounts.Count == 1)
                {
                    var account = financial.BarAccounts[0];
                    try
                    {
                        var statement = await context.BarStatementAsync(conversationId, account.Id, ct);
                        await messaging.QueueAutomationAsync(conversationId, statement, "BarStatement", "Bar", account.Id, null, null, operation, ct);
                        await tx.CommitAsync(ct); return;
                    }
                    catch (MessagingRuleException)
                    { text = "O vínculo da conta precisa ser conferido. Vou encaminhar seu atendimento para a equipe."; conversation.Pause(); break; }
                }
                text = "Nossa equipe precisa conferir qual conta está vinculada a você. Vou encaminhar o atendimento."; conversation.Pause();
                break;
            default:
                text = "Vou encaminhar sua mensagem para a equipe da LongBeach. Assim que possível, alguém responde por aqui."; conversation.Pause();
                break;
        }
        // Handoff notices are queued before marking the conversation as Team, and are explicitly identified.
        if (conversation.Mode == "Team")
        {
            await db.SaveChangesAsync(ct);
            var notice = new MessagingMessage(conversationId, "Outbound", "Bot", text, time.GetUtcNow(), "Queued", Guid.NewGuid().ToString("N"), operation)
            { Purpose = "Handoff", AutomationProcessed = true };
            db.Add(notice); await db.SaveChangesAsync(ct);
        }
        else
        {
            if (privateActivities is not null && conversation.CustomerId is Guid verifiedCustomer)
            {
                replyContextKind = "PrivateReply"; replyContextId = MessagingCalendar.StableId("private-reply", operation.ToString());
                db.Add(new OperationalRecord(replyContextId.Value, "messagingPrivate", "Contexto autorizado da resposta",
                    JsonSerializer.Serialize(new PrivateReply(verifiedCustomer, privateActivities), Json)));
                await db.SaveChangesAsync(ct);
            }
            await messaging.QueueAutomationAsync(conversationId, text, "Manual", replyContextKind, replyContextId, null, null, operation, ct);
        }
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
    }
    private async Task<Invitation[]> SentInvitations(Guid conversationId, DateTimeOffset receivedAt, CancellationToken ct)
    {
        var ids = await db.Set<MessagingMessage>().AsNoTracking().Where(row => row.ConversationId == conversationId
            && (row.Purpose == "ClassReminder" || row.Purpose == "RentalReminder" || row.Purpose == "ConfirmationRequest") && row.ContextId != null
            && (row.State == "Sent" || row.State == "Delivered" || row.State == "Read") && row.OccurredAtUtc <= receivedAt && row.OccurredAtUtc >= receivedAt.AddDays(-2))
            .Select(row => row.ContextId!.Value).Distinct().ToArrayAsync(ct);
        var invitations = await db.OperationalRecords.AsNoTracking().Where(row => row.Kind == "messagingInvites" && ids.Contains(row.Id)).ToArrayAsync(ct);
        return invitations.Select(row => JsonSerializer.Deserialize<Invitation>(row.Payload, Json)!).Where(invite => invite.ConversationId == conversationId).ToArray();
    }
    public async Task<bool> PrepareOutgoingAsync(Guid messageId, CancellationToken ct)
    {
        var message = await db.Set<MessagingMessage>().SingleAsync(row => row.Id == messageId, ct);
        var conversation = await db.Set<MessagingConversation>().SingleAsync(row => row.Id == message.ConversationId, ct);
        if (message.Purpose == "Handoff") return (await messaging.SettingsAsync(ct)).BotEnabled
            && !await db.Set<MessagingMessage>().AnyAsync(row => row.ConversationId == conversation.Id
                && row.OccurredAtUtc > message.OccurredAtUtc && (row.Origin == "Staff" || row.Origin == "Phone"), ct);
        if (message.Origin == "Bot" && (!(await messaging.SettingsAsync(ct)).BotEnabled || conversation.Mode != "Bot"))
        { message.Suppress("O atendimento automático está pausado."); return false; }
        if (message.Origin == "Bot" && message.ContextKind == "ApprovedFaq")
        {
            var faq = await db.Set<MessagingFaq>().AsNoTracking().SingleOrDefaultAsync(row => row.Id == message.ContextId && row.Approved, ct);
            if (faq is null) { message.Suppress("A resposta deixou de estar aprovada para envio."); return false; }
            message.Text = faq.Answer;
        }
        if (message.Origin == "Bot" && message.ContextKind == "PrivateReply")
        {
            var record = await db.OperationalRecords.AsNoTracking().SingleOrDefaultAsync(row => row.Id == message.ContextId && row.Kind == "messagingPrivate", ct);
            var snapshot = record is null ? null : JsonSerializer.Deserialize<PrivateReply>(record.Payload, Json);
            var currentActivities = await context.ActivitiesAsync(conversation, ct);
            if (snapshot is null || !conversation.IdentityVerified || conversation.CustomerId != snapshot.CustomerId
                || snapshot.Activities.Any(saved => !currentActivities.Any(current => MessagingCalendar.OccurrenceId(current) == saved.OccurrenceId
                    && MessagingCalendar.Fingerprint(current) == saved.Fingerprint
                    && (saved.Version is null || current.Version == saved.Version && current.Confirmation == saved.Confirmation))))
            { message.Suppress("O vínculo ou encontro mudou. Confira o contexto antes de responder."); return false; }
        }
        if (message.Purpose == "BarStatement")
        {
            try { message.Text = await context.BarStatementAsync(conversation.Id, message.ContextId ?? Guid.Empty, ct); }
            catch (MessagingRuleException) { message.Suppress("O vínculo da conta mudou. Confira o responsável antes de enviar."); return false; }
        }
        if (message.Purpose is "ClassReminder" or "RentalReminder" or "ConfirmationRequest")
        {
            if (!conversation.IdentityVerified || message.Purpose != "ConfirmationRequest" && !conversation.ConsentForReminders)
            { message.Suppress("Lembretes não autorizados para este contato."); return false; }
            var record = await db.OperationalRecords.AsNoTracking().SingleOrDefaultAsync(row => row.Id == message.ContextId && row.Kind == "messagingInvites", ct);
            var invite = record is null ? null : JsonSerializer.Deserialize<Invitation>(record.Payload, Json);
            var activity = (await context.ActivitiesAsync(conversation, ct)).SingleOrDefault(item => MessagingCalendar.OccurrenceId(item) == invite?.OccurrenceId);
            var settings = await messaging.SettingsAsync(ct);
            if (activity is null || invite is null || invite.ConversationId != conversation.Id || MessagingCalendar.Fingerprint(activity) != invite.Fingerprint
                || message.Purpose != "ConfirmationRequest" && activity.Confirmation != "Pending" || MessagingCalendar.StartsAt(activity) <= time.GetUtcNow()
                || message.CreatedAtUtc < time.GetUtcNow().AddHours(-1)
                || message.Purpose == "ClassReminder" && !settings.ClassRemindersEnabled || message.Purpose == "RentalReminder" && !settings.RentalRemindersEnabled)
            { message.Suppress("O encontro ou o prazo do lembrete mudou. Confira a agenda."); return false; }
        }
        return true;
    }
}
