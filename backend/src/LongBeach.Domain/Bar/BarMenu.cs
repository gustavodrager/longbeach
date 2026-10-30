using LongBeach.Domain.Common;

namespace LongBeach.Domain.Bar;

public sealed class BarMenu : Entity
{
    public static readonly Guid SingletonId = Guid.Parse("00000000-0000-0000-0000-000000000001");

    private BarMenu() { }
    public BarMenu(string draftJson) : base(SingletonId)
    {
        DraftJson = draftJson;
        Version = 1;
    }

    public string DraftJson { get; private set; } = "";
    public string? PublishedJson { get; private set; }
    public int Version { get; private set; }

    public void SaveDraft(string draftJson)
    {
        DraftJson = draftJson;
        Version++;
    }

    public void Publish(string publishedJson)
    {
        PublishedJson = publishedJson;
        Version++;
    }
}
