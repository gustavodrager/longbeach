using System.Reflection;
using System.Text.Json;
using LongBeach.Application.Billing;
using LongBeach.Application.Messaging;
using LongBeach.Contracts.Billing;
using LongBeach.Contracts.Messaging;
using LongBeach.Domain.Billing;
using LongBeach.Domain.Customers;
using LongBeach.Domain.Identity;
using LongBeach.Domain.Messaging;
using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.Messaging;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.IntegrationTests;

public sealed class PostgresTheoryAttribute : TheoryAttribute
{
    public PostgresTheoryAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("LONG_BEACH_TEST_DATABASE_URL")))
            Skip = "PostgreSQL exclusivo de teste não configurado.";
    }
}

public sealed class MessagingAutomationPostgresTests
{
    private sealed class Clock(DateTimeOffset now) : TimeProvider { public override DateTimeOffset GetUtcNow() => now; }
    private sealed class HumanAi : IMessagingAi
    {
        public bool Configured => true;
        public Task<MessagingAiDecision> DecideAsync(string text, IReadOnlyList<FaqDto> faqs, IReadOnlyList<MessagingActivityDto> activities, CancellationToken ct) => Task.FromResult(new MessagingAiDecision("human"));
    }
    private sealed class ScriptedAi(Func<Task<MessagingAiDecision>> decide) : IMessagingAi
    {
        public bool Configured => true;
        public Task<MessagingAiDecision> DecideAsync(string text, IReadOnlyList<FaqDto> faqs, IReadOnlyList<MessagingActivityDto> activities, CancellationToken ct) => decide();
    }
    public class BillingProxy : DispatchProxy
    {
        public decimal Amount { get; set; } = 45;
        public decimal Paid { get; set; }
        public decimal Pending { get; set; }
        protected override object? Invoke(MethodInfo? method, object?[]? arguments)
        {
            if (method?.Name != "Account") throw new NotSupportedException();
            return Task.FromResult(new AccountDto((Guid)arguments![0]!, "Bar", Guid.NewGuid(), "Comanda fictícia", null,
                Amount, Paid, Pending, Math.Max(0, Amount - Paid - Pending), "Open", [], false, (Guid)arguments[1]!, null, null));
        }
    }
    private static OperationalRecord Row(Guid id, string kind, object value) => new(id, kind, kind, JsonSerializer.Serialize(value));
    private static async Task<(Customer Customer, MessagingConversation Conversation, User Actor)> Contact(IsolatedMaterialDatabase isolated)
    {
        var actor = User.Create("Equipe fictícia", $"{Guid.NewGuid():N}@example.test", "synthetic-password-hash");
        var customer = new Customer("Aluno fictício", "11999990000", null, "manual");
        var conversation = new MessagingConversation("5511999990000@s.whatsapp.net", "5511999990000", "Aluno fictício", customer.Id);
        conversation.Link(customer.Id, true, true);
        isolated.Context.AddRange(actor, customer, conversation); await isolated.Context.SaveChangesAsync();
        return (customer, conversation, actor);
    }
    [PostgresFact]
    public async Task Rsvp_is_idempotent_and_never_writes_real_attendance_or_cancels_a_reservation()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create(); var (customer, conversation, _) = await Contact(isolated);
        var now = new DateTimeOffset(2026, 11, 1, 21, 0, 0, TimeSpan.Zero); var clock = new Clock(now);
        var student = Guid.NewGuid(); var lesson = Guid.NewGuid(); var enrollment = Guid.NewGuid();
        isolated.Context.AddRange(
            Row(student, "students", new { customerId = customer.Id, status = "Ativo" }),
            Row(lesson, "classes", new { status = "Ativa", weekDay = 1, startTime = "19:00", endTime = "20:00" }),
            Row(enrollment, "enrollments", new { studentId = student, classId = lesson, status = "Ativa", startDate = "2026-10-01" }));
        await isolated.Context.SaveChangesAsync();
        var service = new MessagingService(isolated.Context, clock); var context = new MessagingContextService(isolated.Context, service, null!, clock);
        var input = new SaveMessagingConfirmationInput(Guid.NewGuid(), "Class", enrollment, student, new(2026, 11, 2), "NotGoing");
        var result = await context.ConfirmAsync(conversation.Id, input, default);
        Assert.Equal("NotGoing", result.Confirmation);
        Assert.Equal(result, await context.ConfirmAsync(conversation.Id, input, default));
        Assert.Empty(await isolated.Context.OperationalRecords.Where(row => row.Kind == "presences" || row.Kind == "rentalAttendances" || row.Kind == "financeEntries").ToArrayAsync());
        Assert.Single(await isolated.Context.OperationalRecords.Where(row => row.Kind == "messagingRsvps").ToArrayAsync());
        var second = input with { OperationId = Guid.NewGuid(), Status = "Going", ExpectedVersion = result.Version };
        Assert.Equal("Going", (await context.ConfirmAsync(conversation.Id, second, default)).Confirmation);
        await Assert.ThrowsAsync<MessagingRuleException>(() => context.ConfirmAsync(conversation.Id, input with { OperationId = Guid.NewGuid() }, default));
    }
    [PostgresFact]
    public async Task Daily_reminder_is_once_per_occurrence_and_is_suppressed_after_schedule_change()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create(); var (customer, conversation, _) = await Contact(isolated);
        var clock = new Clock(new(2026, 11, 1, 21, 0, 0, TimeSpan.Zero));
        var student = Guid.NewGuid(); var lesson = Guid.NewGuid(); var enrollment = Guid.NewGuid();
        isolated.Context.AddRange(
            Row(student, "students", new { customerId = customer.Id, status = "Ativo" }),
            Row(lesson, "classes", new { status = "Ativa", weekDay = 1, startTime = "19:00", endTime = "20:00" }),
            Row(enrollment, "enrollments", new { studentId = student, classId = lesson, status = "Ativa", startDate = "2026-10-01" }),
            new MessagingSettings { BotEnabled = true, ClassRemindersEnabled = true });
        await isolated.Context.SaveChangesAsync();
        var service = new MessagingService(isolated.Context, clock); var context = new MessagingContextService(isolated.Context, service, null!, clock);
        MessagingAutomation Automation() => new(isolated.Context, service, context, new HumanAi(), new MessagingScheduleGate(), clock);
        await Automation().TickAsync(default); await Automation().TickAsync(default);
        var reminder = Assert.Single(await isolated.Context.Set<MessagingMessage>().ToArrayAsync());
        Assert.Equal("ClassReminder", reminder.Purpose);
        var lessonRow = await isolated.Context.OperationalRecords.SingleAsync(row => row.Id == lesson);
        lessonRow.Update("Mudança de horário", JsonSerializer.Serialize(new { status = "Ativa", weekDay = 1, startTime = "20:00", endTime = "21:00" }));
        await isolated.Context.SaveChangesAsync();
        Assert.False(await Automation().PrepareOutgoingAsync(reminder.Id, default));
        Assert.Equal("Cancelled", reminder.State);
        Assert.True(conversation.IdentityVerified);
    }
    [PostgresFact]
    public async Task Statement_is_recalculated_before_send_and_an_unrelated_account_is_rejected()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create(); var (customer, conversation, actor) = await Contact(isolated);
        customer.AssignUser(actor.Id);
        var account = new BillingAccount("Bar", Guid.NewGuid(), actor.Id, null, actor.Id);
        var other = User.Create("Outro cliente", "other@example.test", "synthetic");
        var otherAccount = new BillingAccount("Bar", Guid.NewGuid(), other.Id, null, actor.Id);
        isolated.Context.AddRange(account, other, otherAccount); await isolated.Context.SaveChangesAsync();
        var billing = DispatchProxy.Create<IBilling, BillingProxy>(); var proxy = (BillingProxy)(object)billing;
        var clock = new Clock(new(2026, 11, 1, 21, 0, 0, TimeSpan.Zero)); var service = new MessagingService(isolated.Context, clock);
        var context = new MessagingContextService(isolated.Context, service, billing, clock);
        var message = await context.SendBarStatementAsync(conversation.Id, new(Guid.NewGuid(), account.Id), actor.Id, default);
        Assert.Contains("45,00", message.Text);
        proxy.Amount = 15;
        var automation = new MessagingAutomation(isolated.Context, service, context, new HumanAi(), new MessagingScheduleGate(), clock);
        Assert.True(await automation.PrepareOutgoingAsync(message.Id, default));
        Assert.Contains("15,00", (await isolated.Context.Set<MessagingMessage>().SingleAsync(row => row.Id == message.Id)).Text);
        proxy.Amount = 100; proxy.Paid = 20; proxy.Pending = 80;
        var pendingText = await context.BarStatementAsync(conversation.Id, account.Id, default);
        Assert.Contains("Saldo em aberto neste momento: R$ 80,00", pendingText.Replace('\u00a0', ' '));
        Assert.Contains("Aguardando confirmação de pagamento: R$ 80,00", pendingText.Replace('\u00a0', ' '));
        Assert.Contains("Disponível para novo pagamento: R$ 0,00", pendingText.Replace('\u00a0', ' '));
        var denied = await Assert.ThrowsAsync<MessagingRuleException>(() => context.BarStatementAsync(conversation.Id, otherAccount.Id, default));
        Assert.Equal(403, denied.StatusCode);
        conversation.Link(customer.Id, false, false); await isolated.Context.SaveChangesAsync();
        Assert.False(await automation.PrepareOutgoingAsync(message.Id, default));
    }
    [PostgresFact]
    public async Task Unknown_question_hands_off_once_and_history_never_generates_a_reply()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create(); var (_, conversation, _) = await Contact(isolated);
        var clock = new Clock(new(2026, 11, 1, 21, 0, 0, TimeSpan.Zero));
        isolated.Context.Add(new MessagingSettings { BotEnabled = true });
        var incoming = new MessagingMessage(conversation.Id, "Inbound", "Customer", "Preciso da equipe", clock.GetUtcNow(), "Received", "incoming-synthetic");
        isolated.Context.Add(incoming); await isolated.Context.SaveChangesAsync();
        var service = new MessagingService(isolated.Context, clock); var context = new MessagingContextService(isolated.Context, service, null!, clock);
        var automation = new MessagingAutomation(isolated.Context, service, context, new HumanAi(), new MessagingScheduleGate(), clock);
        await automation.OnIncomingAsync(conversation.Id, incoming.Id, default); await automation.OnIncomingAsync(conversation.Id, incoming.Id, default);
        Assert.Equal("Team", conversation.Mode);
        var reply = Assert.Single(await isolated.Context.Set<MessagingMessage>().Where(row => row.Direction == "Outbound").ToArrayAsync());
        Assert.True(await automation.PrepareOutgoingAsync(reply.Id, default));
        conversation.Act("resume-bot", Guid.NewGuid()); incoming.IsHistory = true; await isolated.Context.SaveChangesAsync();
        await automation.OnIncomingAsync(conversation.Id, incoming.Id, default);
        Assert.Single(await isolated.Context.Set<MessagingMessage>().Where(row => row.Direction == "Outbound").ToArrayAsync());
    }
    [PostgresTheory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Private_agenda_reply_revalidates_identity_and_occurrence_before_transport(bool revokeIdentity)
    {
        await using var isolated = await IsolatedMaterialDatabase.Create(); var (customer, conversation, _) = await Contact(isolated);
        var clock = new Clock(new(2026, 11, 1, 21, 0, 0, TimeSpan.Zero));
        var student = Guid.NewGuid(); var lesson = Guid.NewGuid(); var enrollment = Guid.NewGuid();
        isolated.Context.AddRange(new MessagingSettings { BotEnabled = true },
            Row(student, "students", new { customerId = customer.Id, status = "Ativo" }),
            Row(lesson, "classes", new { status = "Ativa", weekDay = 1, startTime = "19:00", endTime = "20:00" }),
            Row(enrollment, "enrollments", new { studentId = student, classId = lesson, status = "Ativa", startDate = "2026-10-01" }));
        var incoming = new MessagingMessage(conversation.Id, "Inbound", "Customer", "Qual é minha agenda?", clock.GetUtcNow(), "Received", "agenda-input");
        isolated.Context.Add(incoming); await isolated.Context.SaveChangesAsync();
        var service = new MessagingService(isolated.Context, clock); var context = new MessagingContextService(isolated.Context, service, null!, clock);
        var automation = new MessagingAutomation(isolated.Context, service, context, new ScriptedAi(() => Task.FromResult(new MessagingAiDecision("agenda"))), new(), clock);
        await automation.OnIncomingAsync(conversation.Id, incoming.Id, default);
        var reply = Assert.Single(await isolated.Context.Set<MessagingMessage>().Where(row => row.Direction == "Outbound").ToArrayAsync());
        Assert.Equal("PrivateReply", reply.ContextKind);
        Assert.True(await automation.PrepareOutgoingAsync(reply.Id, default));
        if (revokeIdentity) conversation.Link(null, false, false);
        else (await isolated.Context.OperationalRecords.SingleAsync(row => row.Id == lesson)).Update("Remarcada", JsonSerializer.Serialize(new { status = "Ativa", weekDay = 1, startTime = "20:00", endTime = "21:00" }));
        await isolated.Context.SaveChangesAsync();
        Assert.False(await automation.PrepareOutgoingAsync(reply.Id, default)); Assert.Equal("Cancelled", reply.State);
    }
    [PostgresFact]
    public async Task Delayed_model_does_not_overwrite_a_newer_confirmation_from_the_team()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create(); var (customer, conversation, _) = await Contact(isolated);
        var clock = new Clock(new(2026, 11, 1, 21, 0, 0, TimeSpan.Zero));
        var student = Guid.NewGuid(); var lesson = Guid.NewGuid(); var enrollment = Guid.NewGuid();
        isolated.Context.AddRange(new MessagingSettings { BotEnabled = true },
            Row(student, "students", new { customerId = customer.Id, status = "Ativo" }),
            Row(lesson, "classes", new { status = "Ativa", weekDay = 1, startTime = "19:00", endTime = "20:00" }),
            Row(enrollment, "enrollments", new { studentId = student, classId = lesson, status = "Ativa", startDate = "2026-10-01" }));
        var incoming = new MessagingMessage(conversation.Id, "Inbound", "Customer", "Vou à aula de amanhã às 19h", clock.GetUtcNow(), "Received", "confirmation-input");
        isolated.Context.Add(incoming); await isolated.Context.SaveChangesAsync();
        var service = new MessagingService(isolated.Context, clock); var context = new MessagingContextService(isolated.Context, service, null!, clock);
        var activity = (await context.ActivitiesAsync(conversation, default)).First();
        var ai = new ScriptedAi(async () =>
        {
            await context.ConfirmAsync(conversation.Id, new(Guid.NewGuid(), "Class", enrollment, student, new(2026, 11, 2), "NotGoing"), default);
            return new("confirm", ActivityKey: MessagingCalendar.OccurrenceId(activity).ToString(), Confirmation: "Going");
        });
        var automation = new MessagingAutomation(isolated.Context, service, context, ai, new(), clock);
        await automation.OnIncomingAsync(conversation.Id, incoming.Id, default);
        Assert.Equal("NotGoing", (await context.ActivitiesAsync(conversation, default)).First().Confirmation);
        Assert.Equal("Team", conversation.Mode);
    }
    [PostgresFact]
    public async Task Bar_authorization_rejection_hands_off_instead_of_repeating_automatic_processing()
    {
        await using var isolated = await IsolatedMaterialDatabase.Create(); var (customer, conversation, actor) = await Contact(isolated);
        customer.AssignUser(actor.Id);
        customer.Change(customer.Name, customer.Phone, null, "Inativo");
        isolated.Context.AddRange(new BillingAccount("Bar", Guid.NewGuid(), actor.Id, null, actor.Id), new MessagingSettings { BotEnabled = true });
        var clock = new Clock(new(2026, 11, 1, 21, 0, 0, TimeSpan.Zero));
        var incoming = new MessagingMessage(conversation.Id, "Inbound", "Customer", "Pode mandar minha conta?", clock.GetUtcNow(), "Received", "bar-handoff-input");
        isolated.Context.Add(incoming); await isolated.Context.SaveChangesAsync();
        var billing = DispatchProxy.Create<IBilling, BillingProxy>(); var service = new MessagingService(isolated.Context, clock);
        var context = new MessagingContextService(isolated.Context, service, billing, clock);
        var automation = new MessagingAutomation(isolated.Context, service, context, new ScriptedAi(() => Task.FromResult(new MessagingAiDecision("bar"))), new(), clock);
        await automation.OnIncomingAsync(conversation.Id, incoming.Id, default);
        Assert.Equal("Team", conversation.Mode);
        var reply = Assert.Single(await isolated.Context.Set<MessagingMessage>().Where(row => row.Direction == "Outbound").ToArrayAsync());
        Assert.Equal("Handoff", reply.Purpose); Assert.DoesNotContain("45,00", reply.Text);
    }
}
