using LongBeach.Contracts.Bar;
using LongBeach.Domain.Cash;
namespace LongBeach.Application.Bar;
public interface IBarCash
{
    Task<IReadOnlyList<CashRegister>> Registers(CancellationToken ct);
    Task<CashRegister> CreateRegister(string name, CancellationToken ct);
    Task<IReadOnlyList<CashSession>> Sessions(CancellationToken ct);
    async Task<IReadOnlyList<CashSession>> Sessions(Guid actor, bool all, CancellationToken ct) => (await Sessions(ct)).Where(x => all || x.OpenedBy == actor).ToArray();
    Task<CashSession> Open(OpenCashInput input, Guid actor, CancellationToken ct);
    Task<CashSession> Move(Guid id, CashMovementInput input, string kind, Guid actor, CancellationToken ct);
    Task<CashClosing> Close(Guid id, CloseCashInput input, Guid actor, bool supervisor, CancellationToken ct);
    Task<CashSession> Reopen(Guid id, string reason, Guid actor, Guid? operationId, CancellationToken ct) => Reopen(id, reason, actor, ct);
    Task<CashSession> Reopen(Guid id, string reason, Guid actor, CancellationToken ct);
}
