using LongBeach.Domain.Common;

namespace LongBeach.Domain.Customers;

public sealed class CustomerRuleException(string message, int statusCode = 400) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}

public sealed class Customer : Entity
{
    private Customer() { }
    public Customer(string name, string phone, string? email, string origin, bool allowIncomplete = false) : base(Guid.NewGuid())
    {
        Origin = Text(origin, 40, "Origem");
        SetContact(name, phone, email, allowIncomplete);
    }
    public string Name { get; private set; } = "";
    public string Phone { get; private set; } = "";
    public string? Email { get; private set; }
    public string Status { get; private set; } = "Ativo";
    public int Version { get; private set; } = 1;
    public string Origin { get; private set; } = "";
    public bool Incomplete { get; private set; }
    public Guid? UserId { get; private set; }
    public Guid? MergedIntoId { get; private set; }

    public static string Text(string? value, int max, string label)
    {
        var text = value?.Trim() ?? "";
        if (text.Length == 0 || text.Length > max || text.Any(char.IsControl)) throw new CustomerRuleException($"{label}: informe de 1 a {max} caracteres.");
        return text;
    }
    public static bool ValidPhone(string? value) => value is { Length: >= 10 and <= 15 } && value.All(char.IsAsciiDigit);
    public static string NormalizePhone(string? value)
    {
        var text = value?.Trim() ?? "";
        if (text.Any(c => !char.IsAsciiDigit(c) && !"+().- ".Contains(c))) return text;
        return new string(text.Where(char.IsAsciiDigit).ToArray());
    }
    private void SetContact(string name, string phone, string? email, bool allowIncomplete)
    {
        name = Text(name, 240, "Nome");
        phone = NormalizePhone(phone);
        if (phone.Length > 40 || !ValidPhone(phone) && !allowIncomplete) throw new CustomerRuleException("Informe um telefone com DDD, de 10 a 15 dígitos.");
        email = string.IsNullOrWhiteSpace(email) ? null : email.Trim();
        if (email is not null && (email.Length > 320 || email.Any(char.IsControl) || !System.Net.Mail.MailAddress.TryCreate(email, out var address) || address.Address != email))
            throw new CustomerRuleException("Confira o e-mail de contato.");
        Name = name; Phone = phone; Email = email; Incomplete = !ValidPhone(phone);
    }
    public void Change(string name, string phone, string? email, string status)
    {
        if (MergedIntoId is not null) throw new CustomerRuleException("Abra o cadastro canônico deste cliente.", 409);
        if (status is not ("Ativo" or "Inativo")) throw new CustomerRuleException("Situação do cliente inválida.");
        var mayRemainIncomplete = Incomplete && NormalizePhone(phone) == Phone;
        SetContact(name, phone, email, mayRemainIncomplete);
        Status = status; Version++;
    }
    public void AssignUser(Guid? userId) { UserId = userId; Version++; }
    public void MergeInto(Guid target)
    {
        if (target == Guid.Empty || target == Id || MergedIntoId is not null) throw new CustomerRuleException("Unificação inválida.", 409);
        MergedIntoId = target; Version++;
    }
    public void UndoMerge(Guid expectedTarget)
    {
        if (MergedIntoId != expectedTarget) throw new CustomerRuleException("A unificação mudou. Atualize a conferência.", 409);
        MergedIntoId = null; Version++;
    }
}

public sealed class CustomerSourceLink : Entity
{
    private CustomerSourceLink() { }
    public CustomerSourceLink(string kind, Guid sourceId, Guid parentId, Guid? customerId) : base(Guid.NewGuid())
    { Kind = kind; SourceId = sourceId; ParentId = parentId; CustomerId = customerId; }
    public string Kind { get; private set; } = "";
    public Guid SourceId { get; private set; }
    public Guid ParentId { get; private set; }
    public Guid? CustomerId { get; private set; }
    public int Version { get; private set; } = 1;
    public void Replace(Guid? customerId) { CustomerId = customerId; Version++; }
}

public sealed class CustomerSourceChange : Entity
{
    private CustomerSourceChange() { }
    public CustomerSourceChange(Guid linkId, Guid? before, Guid? after) : base(Guid.NewGuid()) { LinkId = linkId; BeforeCustomerId = before; AfterCustomerId = after; }
    public Guid LinkId { get; private set; }
    public Guid? BeforeCustomerId { get; private set; }
    public Guid? AfterCustomerId { get; private set; }
}

public sealed class CustomerOperation : Entity
{
    private CustomerOperation() { }
    public CustomerOperation(Guid operationId, string kind, string fingerprint, string response) : base(operationId)
    { Kind = kind; Fingerprint = fingerprint; ResponseJson = response; }
    public string Kind { get; private set; } = "";
    public string Fingerprint { get; private set; } = "";
    public string ResponseJson { get; private set; } = "";
}

public sealed class CustomerMerge : Entity
{
    private CustomerMerge() { }
    public CustomerMerge(Guid source, Guid target, Guid? transferredUser, string reason) : base(Guid.NewGuid())
    { SourceId = source; TargetId = target; TransferredUserId = transferredUser; Reason = reason; }
    public Guid SourceId { get; private set; }
    public Guid TargetId { get; private set; }
    public Guid? TransferredUserId { get; private set; }
    public string Reason { get; private set; } = "";
    public bool Undone { get; private set; }
    public void Undo() { if (Undone) throw new CustomerRuleException("Esta unificação já foi desfeita.", 409); Undone = true; }
}
