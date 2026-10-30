using LongBeach.Contracts.Bar;

namespace LongBeach.Application.Bar;

public interface IBarMenu
{
    Task<MenuManagement> Get(CancellationToken ct);
    Task<MenuManagement> Save(MenuSaveInput input, CancellationToken ct);
    Task<MenuManagement> Publish(MenuPublishInput input, CancellationToken ct);
    Task<PublishedMenu?> Published(CancellationToken ct);
}

public sealed class MenuValidationException(IReadOnlyDictionary<string, string[]> errors)
    : Exception(string.Join(" ", errors.Values.SelectMany(messages => messages)))
{
    public IReadOnlyDictionary<string, string[]> Errors { get; } = errors;
}

public sealed class MenuConcurrencyException()
    : Exception("Cardápio alterado por outro usuário. Recarregue antes de salvar ou publicar.");
