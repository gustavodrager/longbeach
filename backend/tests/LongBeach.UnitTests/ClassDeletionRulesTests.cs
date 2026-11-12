using System.Text.Json;
using LongBeach.Application.Operations;

namespace LongBeach.UnitTests;

public sealed class ClassDeletionRulesTests
{
    private static readonly Guid Actor = Guid.Parse("c9f61e45-110e-49ab-9b53-c6712e459b02");
    private static readonly DateTimeOffset DeletedAt = DateTimeOffset.Parse("2026-11-12T19:30:00Z");
    private static JsonElement Json(string value) => JsonSerializer.Deserialize<JsonElement>(value);

    [Theory]
    [InlineData("[]")]
    [InlineData("[\"8e958963-5bfc-424f-85e4-161a4865d7ee\"]")]
    [InlineData("null")]
    [InlineData("\"invalid\"")]
    public void Deletion_keeps_legacy_rosters_and_source_history_without_interpreting_or_erasing_them(string students)
    {
        var source = Json("{\"name\":\"Turma histórica\",\"status\":\"Ativa\",\"version\":3,\"studentIds\":" + students + ",\"history\":[{\"note\":\"origem preservada\"}]}");
        var archived = JsonSerializer.SerializeToElement(ClassDeletionRules.Archive(source, Actor, DeletedAt));
        Assert.True(ClassDeletionRules.IsDeleted(archived));
        Assert.Equal("Encerrada", archived.GetProperty("status").GetString());
        Assert.Equal("Ativa", archived.GetProperty("deletedPreviousStatus").GetString());
        Assert.Equal("2026-11-12", archived.GetProperty("deletedEffectiveDate").GetString());
        Assert.Equal(Actor, archived.GetProperty("deletedBy").GetGuid());
        Assert.Equal(4, archived.GetProperty("version").GetInt32());
        Assert.Equal(source.GetProperty("studentIds").GetRawText(), archived.GetProperty("studentIds").GetRawText());
        Assert.Equal(source.GetProperty("history").GetRawText(), archived.GetProperty("history").GetRawText());
        Assert.False(ClassDeletionRules.IsDeleted(source));
    }

    [Theory]
    [InlineData("2026-11-01", "2026-11-12", false)]
    [InlineData("2026-11-12", "2026-11-12", false)]
    [InlineData("2026-12-01", "2026-12-01", true)]
    public void Closing_enrollment_preserves_its_start_and_marks_future_cancellations(string start, string end, bool cancelledBeforeStart)
    {
        var source = JsonSerializer.SerializeToElement(new { startDate = start, monthlyAmount = 150, version = 2, status = "Ativa" });
        var closed = JsonSerializer.SerializeToElement(ClassDeletionRules.CloseEnrollment(source, DeletedAt));
        Assert.Equal(start, closed.GetProperty("startDate").GetString());
        Assert.Equal(end, closed.GetProperty("endDate").GetString());
        Assert.Equal("Encerrada", closed.GetProperty("status").GetString());
        Assert.True(ClassDeletionRules.Flag(closed, "closedByClassDeletion"));
        Assert.Equal(cancelledBeforeStart, ClassDeletionRules.Flag(closed, "cancelledBeforeStart"));
        Assert.Equal(150, closed.GetProperty("monthlyAmount").GetInt32());
        Assert.Equal(3, closed.GetProperty("version").GetInt32());
    }

    [Theory]
    [InlineData("2026-11-05", "18:00", true)]
    [InlineData("2026-11-12", "16:29", true)]
    [InlineData("2026-11-12", "16:30", false)]
    [InlineData("2026-11-12", "18:00", false)]
    [InlineData("2026-11-19", "06:00", false)]
    [InlineData("2026-10-29", "06:00", false)]
    public void Schedule_keeps_only_occurrences_that_started_before_deletion_in_the_arena_timezone(string day, string start, bool expected)
    {
        var lesson = JsonSerializer.SerializeToElement(new { status = "Ativa", startDate = "2026-11-01", startTime = start });
        var archived = JsonSerializer.SerializeToElement(ClassDeletionRules.Archive(lesson, Actor, DeletedAt));
        Assert.Equal(expected, ClassDeletionRules.IsScheduledOn(archived, DateOnly.Parse(day)));
    }

    [Theory]
    [InlineData("Pausada")]
    [InlineData("Encerrada")]
    public void Deleting_an_inactive_class_does_not_invent_past_schedule_occurrences(string status)
    {
        var lesson = JsonSerializer.SerializeToElement(new { status, startTime = "06:00" });
        var archived = JsonSerializer.SerializeToElement(ClassDeletionRules.Archive(lesson, Actor, DeletedAt));
        Assert.False(ClassDeletionRules.IsScheduledOn(archived, new DateOnly(2026, 11, 5)));
    }

    [Fact]
    public void Deletion_date_uses_the_arena_day_at_a_utc_midnight_boundary()
        => Assert.Equal(new DateOnly(2026, 11, 11), ClassDeletionRules.LocalDate(DateTimeOffset.Parse("2026-11-12T02:30:00Z")));
}
