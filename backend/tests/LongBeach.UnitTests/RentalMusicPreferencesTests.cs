using System.Text.Json;
using System.Text.Json.Nodes;
using LongBeach.Application.Operations;

namespace LongBeach.UnitTests;

public sealed class RentalMusicPreferencesTests
{
    [Theory]
    [InlineData("{}")]
    [InlineData("{\"musicPreferences\":[]}")]
    [InlineData("{\"musicPreferences\":[\"rock\",\"pagode\",\"pop\"]}")]
    [InlineData("{\"musicPreferences\":[\"rock\",\"pop\",\"pagode\",\"samba\",\"sertanejo\",\"mpb\",\"funk\",\"forro-piseiro\",\"rap-hip-hop\",\"trap\",\"eletronica\",\"reggae\",\"axe\",\"gospel\",\"brega-arrocha\"]}")]
    public void Accepts_legacy_empty_and_multiple_known_preferences(string json)
    {
        using var doc = JsonDocument.Parse(json);
        Assert.Null(RentalMusicPreferences.Validate(doc.RootElement));
    }
    [Theory]
    [InlineData("null")]
    [InlineData("\"rock\"")]
    [InlineData("{}")]
    [InlineData("[null]")]
    [InlineData("[1]")]
    [InlineData("[\"rock\",\"rock\"]")]
    [InlineData("[\"Rock\"]")]
    [InlineData("[\"desconhecido\"]")]
    public void Rejects_invalid_shapes_unknown_ids_and_duplicates(string value)
    {
        using var doc = JsonDocument.Parse("{\"musicPreferences\":" + value + "}");
        Assert.NotNull(RentalMusicPreferences.Validate(doc.RootElement));
    }
    [Fact]
    public void Rejects_more_than_fifteen_choices()
    {
        var body = JsonSerializer.SerializeToElement(new { musicPreferences = Enumerable.Repeat("rock", 16) });
        Assert.NotNull(RentalMusicPreferences.Validate(body));
    }
    [Fact]
    public void Omitted_field_is_preserved_while_empty_is_an_explicit_clear()
    {
        const string saved = """{"name":"Grupo","musicPreferences":["rock","pagode"]}""";
        var legacy = JsonNode.Parse("""{"name":"Nome corrigido"}""")!.AsObject();
        RentalMusicPreferences.PreserveOmitted(legacy, saved);
        Assert.Equal(new[] { "rock", "pagode" }, legacy["musicPreferences"]!.AsArray().Select(x => x!.GetValue<string>()));
        var clear = JsonNode.Parse("""{"musicPreferences":[]}""")!.AsObject();
        RentalMusicPreferences.PreserveOmitted(clear, saved); Assert.Empty(clear["musicPreferences"]!.AsArray());
        var invalid = JsonNode.Parse("""{"musicPreferences":null}""")!.AsObject();
        RentalMusicPreferences.PreserveOmitted(invalid, saved);
        Assert.NotNull(RentalMusicPreferences.Validate(JsonSerializer.SerializeToElement(invalid)));
    }
    [Fact]
    public void Legacy_no_op_does_not_manufacture_a_field_or_change_unrelated_data()
    {
        var input = JsonNode.Parse("""{"name":"Grupo","monthlyAmount":400,"members":[]}""")!.AsObject();
        var before = input.ToJsonString(); RentalMusicPreferences.PreserveOmitted(input, before);
        Assert.Equal(before, input.ToJsonString());
    }
}
