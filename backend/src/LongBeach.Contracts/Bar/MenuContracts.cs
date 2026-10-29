namespace LongBeach.Contracts.Bar;

public sealed record MenuDocument(string Title, IReadOnlyList<MenuPage> Pages);
public sealed record MenuPage(string Id, string Title, int DurationSeconds, bool Visible, IReadOnlyList<MenuItem> Items);
public sealed record MenuItem(string Id, string Name, string Description, bool Visible, IReadOnlyList<Guid> ProductIds);
public sealed record MenuSaveInput(int Version, MenuDocument Draft);
public sealed record MenuPublishInput(int Version);
public sealed record MenuManagement(int Version, MenuDocument Draft, PublishedMenu? Published);
public sealed record PublishedMenu(int Version, DateTimeOffset PublishedAtUtc, string Title, IReadOnlyList<PublishedMenuPage> Pages);
public sealed record PublishedMenuPage(string Id, string Title, int DurationSeconds, IReadOnlyList<PublishedMenuItem> Items);
public sealed record PublishedMenuItem(string Id, string Name, string Description, decimal Price);
