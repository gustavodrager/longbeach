using System.Security.Cryptography;
using LongBeach.Contracts.Finance;
using LongBeach.Domain.Finance;

namespace LongBeach.Application.Finance;

public static class ExpenseAttachmentRules
{
    public const int MaxBytes = 2_000_000;
    public const int MaxBase64Length = (MaxBytes + 2) / 3 * 4;

    public static (string FileName, string ContentType, byte[] Content, string Hash) Read(ExpenseAttachmentInput input)
    {
        if (input.OperationId == Guid.Empty) throw new ExpenseAttachmentRuleException("Identificação do envio inválida. Selecione o comprovante novamente.");
        var name = input.FileName?.Trim();
        if (string.IsNullOrWhiteSpace(name) || name.Length > 180 || name.Any(c => char.IsControl(c) || c is '/' or '\\'))
            throw new ExpenseAttachmentRuleException("Nome do comprovante inválido.");
        if (string.IsNullOrWhiteSpace(input.ContentBase64) || input.ContentBase64.Length > MaxBase64Length)
            throw new ExpenseAttachmentRuleException("Selecione um comprovante PDF, JPEG ou PNG de até 2 MB.");
        byte[] content;
        try { content = Convert.FromBase64String(input.ContentBase64); }
        catch (FormatException) { throw new ExpenseAttachmentRuleException("Comprovante inválido. Selecione o arquivo novamente."); }
        if (content.Length is 0 or > MaxBytes) throw new ExpenseAttachmentRuleException("O comprovante deve ter até 2 MB.");
        var extension = Path.GetExtension(name).ToLowerInvariant();
        var type = extension switch
        {
            ".pdf" when content.AsSpan().StartsWith("%PDF-"u8) => "application/pdf",
            ".png" when content.AsSpan().StartsWith(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }) => "image/png",
            ".jpg" or ".jpeg" when content.Length >= 3 && content[0] == 255 && content[1] == 216 && content[2] == 255 => "image/jpeg",
            _ => throw new ExpenseAttachmentRuleException("O conteúdo deve corresponder a um arquivo PDF, JPEG ou PNG.")
        };
        return (name, type, content, Convert.ToHexString(SHA256.HashData(content)));
    }
}
