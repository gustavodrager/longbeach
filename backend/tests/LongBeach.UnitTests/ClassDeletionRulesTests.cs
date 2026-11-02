using System.Text.Json;
using LongBeach.Application.Operations;

namespace LongBeach.UnitTests;

public sealed class ClassDeletionRulesTests
{
    private static readonly Guid ClassId = Guid.Parse("c9f61e45-110e-49ab-9b53-c6712e459b02");
    private static JsonElement Json(string value) => JsonSerializer.Deserialize<JsonElement>(value);

    [Theory]
    [InlineData("{\"studentIds\":[]}")]
    [InlineData("{}")]
    public void Empty_classes_without_links_can_be_deleted(string lesson)
    {
        Assert.Null(ClassDeletionRules.Validate(ClassId, Json(lesson), [Json("{\"id\":\"" + ClassId + "\"}"), Json("{\"classId\":\"" + Guid.NewGuid() + "\"}")]));
    }

    [Theory]
    [InlineData("[\"8e958963-5bfc-424f-85e4-161a4865d7ee\"]")]
    [InlineData("null")]
    [InlineData("\"invalid\"")]
    public void Legacy_rosters_and_unreadable_rosters_are_preserved(string students)
    {
        Assert.Equal(ClassDeletionRules.LinkedRecordsMessage,
            ClassDeletionRules.Validate(ClassId, Json("{\"studentIds\":" + students + "}"), []));
    }

    [Theory]
    [InlineData("classId", "Ativa")]
    [InlineData("classId", "Encerrada")]
    [InlineData("classId", "Presente")]
    [InlineData("classId", "Ausente")]
    [InlineData("classId", "Cancelada")]
    [InlineData("sourceId", "Cancelado")]
    public void All_direct_links_block_deletion_regardless_of_status(string key, string status)
    {
        var reference = JsonSerializer.SerializeToElement(new Dictionary<string, string> { [key] = ClassId.ToString(), ["status"] = status });
        Assert.Equal(ClassDeletionRules.LinkedRecordsMessage, ClassDeletionRules.Validate(ClassId, Json("{}"), [reference]));
    }

    [Theory]
    [InlineData("C9F61E45-110E-49AB-9B53-C6712E459B02")]
    [InlineData("c9f61e45110e49ab9b53c6712e459b02")]
    [InlineData("{c9f61e45-110e-49ab-9b53-c6712e459b02}")]
    public void Nested_history_and_equivalent_guid_formats_keep_their_links(string id)
    {
        var history = JsonSerializer.SerializeToElement(new { history = new[] { new { classId = id } } });
        Assert.Equal(ClassDeletionRules.LinkedRecordsMessage, ClassDeletionRules.Validate(ClassId, Json("{}"), [history]));
    }

    [Fact]
    public void Names_notes_and_non_reference_ids_do_not_block_an_empty_class()
    {
        var unrelated = JsonSerializer.SerializeToElement(new { id = ClassId, name = ClassId.ToString(), notes = ClassId.ToString(), courtId = ClassId, sourceId = "not-a-guid" });
        Assert.Null(ClassDeletionRules.Validate(ClassId, Json("{}"), [unrelated]));
    }
}
