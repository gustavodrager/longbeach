using System.Text.Json.Nodes;
using LongBeach.Application.Operations;
namespace LongBeach.UnitTests;
public sealed class ClassScheduleDefaultsTests
{
    [Fact]
    public void New_class_begins_on_server_creation_date()
    {
        var body = JsonNode.Parse("{\"startDate\":\"2035-01-01\",\"status\":\"Pausada\"}")!.AsObject();
        ClassScheduleDefaults.Prepare(body, null, new DateOnly(2026, 11, 13));
        Assert.Equal("2026-11-13", body["startDate"]!.ToString());
        Assert.Equal("Ativa", body["status"]!.ToString());
    }
    [Theory]
    [InlineData("{\"startDate\":\"2025-01-01\"}", "2025-01-01")]
    [InlineData("{}", null)]
    public void Editing_does_not_move_historical_start(string previous, string? expected)
    {
        var body = new JsonObject { ["startDate"] = "2035-01-01" };
        ClassScheduleDefaults.Prepare(body, previous, new DateOnly(2026, 11, 13));
        Assert.Equal(expected, body["startDate"]?.ToString());
    }
}
