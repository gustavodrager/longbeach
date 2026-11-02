using LongBeach.Domain.Common;

namespace LongBeach.Domain.Customers;

// Keep revoked pairs: absence must never restore an older billing/portal grant.
public sealed class CustomerGuardianAccess : Entity
{
    private CustomerGuardianAccess() { }

    public CustomerGuardianAccess(Guid customerId, Guid userId, bool isGranted) : base(Guid.NewGuid())
    {
        if (customerId == Guid.Empty || userId == Guid.Empty)
            throw new CustomerRuleException("Confira o dependente e a conta do responsável.");
        CustomerId = customerId;
        UserId = userId;
        IsGranted = isGranted;
    }

    public Guid CustomerId { get; private set; }
    public Guid UserId { get; private set; }
    public bool IsGranted { get; private set; }
    public int Version { get; private set; } = 1;

    public void SetGranted(bool value, int expectedVersion)
    {
        if (Version != expectedVersion)
            throw new CustomerRuleException("O acesso deste responsável mudou. Atualize antes de continuar.", 409);
        if (IsGranted == value) return;
        IsGranted = value;
        Version = checked(Version + 1);
    }
}
