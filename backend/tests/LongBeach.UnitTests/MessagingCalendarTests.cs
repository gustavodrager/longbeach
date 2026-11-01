using System.Text.Json;
using LongBeach.Application.Messaging;
using LongBeach.Contracts.Messaging;
using LongBeach.Domain.Customers;
using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.Messaging;

namespace LongBeach.UnitTests;

public sealed class MessagingCalendarTests
{
    private static OperationalRecord Row(Guid id, string kind, object value) => new(id, kind, kind, JsonSerializer.Serialize(value));
    [Fact]
    public void Classes_use_explicit_customer_identity_enrollment_dates_and_occurrence_exceptions()
    {
        var person = Guid.NewGuid(); var other = Guid.NewGuid(); var student = Guid.NewGuid(); var lesson = Guid.NewGuid(); var enrollment = Guid.NewGuid();
        var day = new DateOnly(2026, 11, 2);
        OperationalRecord[] records = [
            Row(student, "students", new { customerId = person, status = "Ativo", phone = "11999990000" }),
            Row(lesson, "classes", new { status = "Ativa", weekDay = 1, startTime = "19:00", endTime = "20:00", startDate = "2026-10-01" }),
            Row(enrollment, "enrollments", new { studentId = student, classId = lesson, status = "Encerrada", startDate = "2026-10-01", endDate = "2026-11-02" })];
        Assert.Single(MessagingCalendar.Build(person, [], records, day, day.AddDays(7)));
        Assert.Empty(MessagingCalendar.Build(other, [], records, day, day));
        Assert.Empty(MessagingCalendar.Build(person, [new CustomerSourceLink("students", student, Guid.Empty, other)], records, day, day));
        Assert.Empty(MessagingCalendar.Build(person, [new CustomerSourceLink("students", student, Guid.Empty, null)], records, day, day));
        var except = records.Append(Row(Guid.NewGuid(), "portalExceptions", new { key = $"class:{enrollment}:{day:yyyy-MM-dd}" })).ToArray();
        Assert.Empty(MessagingCalendar.Build(person, [], except, day, day));
    }
    [Fact]
    public void Monthly_participation_is_per_member_and_uses_actual_reservations_even_for_paused_group()
    {
        var person = Guid.NewGuid(); var group = Guid.NewGuid(); var member = Guid.NewGuid(); var reservation = Guid.NewGuid(); var date = new DateOnly(2026, 11, 2);
        OperationalRecord[] records = [
            Row(group, "rentalGroups", new { status = "Pausado", members = new[] { new { id = member, customerId = person, name = "Integrante fictício", status = "Ativo" } } }),
            Row(reservation, "reservations", new { rentalGroupId = group, date = "2026-11-02", startTime = "20:00", endTime = "21:00", status = "Confirmada" })];
        var activity = Assert.Single(MessagingCalendar.Build(person, [], records, date, date));
        Assert.Empty(MessagingCalendar.Build(person, [new CustomerSourceLink("rentalMembers", member, group, null)], records, date, date));
        Assert.Equal(member, activity.SubjectId); Assert.Equal(reservation, activity.Id);
        records[1].Update("cancelada", JsonSerializer.Serialize(new { rentalGroupId = group, date = "2026-11-02", startTime = "20:00", endTime = "21:00", status = "Cancelada" }));
        Assert.Empty(MessagingCalendar.Build(person, [], records, date, date));
    }
    [Fact]
    public void Time_changes_invalidate_confirmation_but_keep_occurrence_identity()
    {
        var activity = new MessagingActivityDto("Class", Guid.NewGuid(), Guid.NewGuid(), "Aluno fictício", "Aula", new(2026, 11, 2), "19:00", "20:00", "Quadra", "Pending", 0);
        var moved = activity with { StartTime = "20:00", EndTime = "21:00" };
        Assert.Equal(MessagingCalendar.OccurrenceId(activity), MessagingCalendar.OccurrenceId(moved));
        Assert.NotEqual(MessagingCalendar.Fingerprint(activity), MessagingCalendar.Fingerprint(moved));
        Assert.Equal(new DateTimeOffset(2026, 11, 2, 22, 0, 0, TimeSpan.Zero), MessagingCalendar.StartsAt(activity).ToUniversalTime());
    }
    [Fact]
    public void Model_cannot_choose_an_unapproved_answer_or_an_unlinked_activity()
    {
        var faq = new FaqDto(Guid.NewGuid(), "Endereço", "Informação aprovada", true, 1);
        var decision = MessagingAi.ParseDecision(JsonSerializer.Serialize(new { action = "faq", faqId = faq.Id }), [faq], []);
        Assert.Equal("faq", decision.Action);
        Assert.Equal("human", MessagingAi.ParseDecision(JsonSerializer.Serialize(new { action = "faq", faqId = faq.Id }), [faq with { Approved = false }], []).Action);
        Assert.Equal("human", MessagingAi.ParseDecision(JsonSerializer.Serialize(new { action = "confirm", activityKey = Guid.NewGuid(), confirmation = "Going" }), [], []).Action);
        Assert.Equal("human", MessagingAi.ParseDecision("[]", [], []).Action);
        Assert.Equal("human", MessagingAi.ParseDecision("not-json", [], []).Action);
        Assert.Equal("human", MessagingAi.ParseDecision("{\"action\":\"execute_sql\"}", [], []).Action);
    }
}
