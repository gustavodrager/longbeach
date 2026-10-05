using System.Text.Json.Nodes;
using LongBeach.Application.Operations;
using LongBeach.Contracts.Operations;

namespace LongBeach.UnitTests;

public sealed class RecurringReservationTests
{
    private static RecurringReservationInput Request(int weeks = 12) => RecurringReservationBatch.Normalize(new(Guid.NewGuid(), "  Grupo semanal  ", Guid.NewGuid(), "2026-10-04", "18:00", "19:00", weeks, "Visitante", "", 80, ""));
    [Fact]
    public void Calendar_expansion_is_finite_individual_and_deterministic()
    {
        var input = Request(); Assert.Null(RecurringReservationBatch.ValidateInput(input));
        var rows = RecurringReservationBatch.Expand(input); var replay = RecurringReservationBatch.Expand(input);
        Assert.Equal(12, rows.Length); Assert.Equal("2026-12-20", rows[^1]["date"]!.GetValue<string>());
        Assert.Equal(12, rows.Select(row => row["id"]!.GetValue<string>()).Distinct().Count());
        Assert.Equal(rows.Select(row => row["id"]!.GetValue<string>()), replay.Select(row => row["id"]!.GetValue<string>()));
        Assert.All(rows, row => Assert.Equal(input.OperationId.ToString(), row["groupId"]!.GetValue<string>()));
        Assert.Equal(1, rows[0]["occurrenceIndex"]!.GetValue<int>()); Assert.Equal(12, rows[^1]["occurrenceIndex"]!.GetValue<int>());
        Assert.NotEqual(input.OperationId, Guid.Parse(rows[0]["id"]!.GetValue<string>()));
    }
    [Theory]
    [InlineData(0)] [InlineData(13)]
    public void Group_cannot_create_an_unbounded_or_empty_schedule(int weeks) => Assert.Contains("1 a 12", RecurringReservationBatch.ValidateInput(Request(weeks)));
    [Fact]
    public void Replay_fingerprint_uses_amount_value_instead_of_decimal_formatting()
    {
        var input = Request(2);
        Assert.Equal(RecurringReservationBatch.Fingerprint(input), RecurringReservationBatch.Fingerprint(input with { Amount = 80.00m }));
        Assert.NotEqual(RecurringReservationBatch.Fingerprint(input), RecurringReservationBatch.Fingerprint(input with { Weeks = 3 }));
    }
    [Fact]
    public void Individual_edit_preserves_its_group_origin()
    {
        var saved = RecurringReservationBatch.Expand(Request(2))[0];
        var incoming = JsonNode.Parse(saved.ToJsonString())!.AsObject(); incoming.Remove("groupId"); incoming.Remove("groupTitle"); incoming.Remove("occurrenceIndex");
        Assert.Null(RecurringReservationBatch.ValidateMetadata(incoming, saved.ToJsonString()));
        Assert.Equal(saved["groupId"]!.GetValue<string>(), incoming["groupId"]!.GetValue<string>());
        incoming["groupId"] = Guid.NewGuid().ToString();
        Assert.Contains("preservado", RecurringReservationBatch.ValidateMetadata(incoming, saved.ToJsonString()));
        Assert.Contains("cadastro", RecurringReservationBatch.ValidateMetadata(saved, null));
    }
    [Fact]
    public void Reservation_value_is_hidden_and_cannot_be_erased_by_reception()
    {
        var saved = RecurringReservationBatch.Expand(Request(2))[0].ToJsonString();
        var visible = JsonNode.Parse(OperationalRecordAccess.VisiblePayload(saved, "reservations", false))!.AsObject();
        Assert.False(visible["costsVisible"]!.GetValue<bool>()); Assert.Equal(0, visible["amount"]!.GetValue<int>());
        visible["name"] = "Nome corrigido";
        var update = OperationalRecordAccess.PrepareWrite(visible.ToJsonString(), saved, "reservations", false, false);
        Assert.True(update.Allowed); Assert.Equal(80, update.Body["amount"]!.GetValue<decimal>());
    }
}
