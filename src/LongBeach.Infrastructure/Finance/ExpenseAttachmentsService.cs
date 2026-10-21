using System.Text.Json;
using LongBeach.Application.Finance;
using LongBeach.Contracts.Finance;
using LongBeach.Domain.Finance;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace LongBeach.Infrastructure.Finance;

public static class ExpenseAttachmentRegistration
{
    public static IServiceCollection AddExpenseAttachments(this IServiceCollection services) => services.AddScoped<IExpenseAttachments, ExpenseAttachmentsService>();
}

public sealed class ExpenseAttachmentsService(LongBeachDbContext db) : IExpenseAttachments
{
    public async Task<IReadOnlyList<ExpenseAttachmentRow>> List(Guid expenseId, CancellationToken ct)
    {
        await RequireExpense(expenseId, ct);
        return await db.Set<ExpenseAttachment>().AsNoTracking().Where(x => x.ExpenseId == expenseId)
            .OrderBy(x => x.CreatedAtUtc).ThenBy(x => x.Id)
            .Select(x => new ExpenseAttachmentRow(x.Id, x.ExpenseId, x.FileName, x.ContentType, x.Content.Length, x.CreatedAtUtc)).ToListAsync(ct);
    }

    public async Task<ExpenseAttachmentRow> Add(Guid expenseId, ExpenseAttachmentInput input, Guid actor, CancellationToken ct)
    {
        var file = ExpenseAttachmentRules.Read(input);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // The operation lock serializes retries across requests and across expense IDs.
        var operationLock = BitConverter.ToInt64(input.OperationId.ToByteArray(), 0);
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({operationLock})", ct);
        await RequireExpense(expenseId, ct);
        var existing = await db.Set<ExpenseAttachment>().SingleOrDefaultAsync(x => x.OperationId == input.OperationId, ct);
        if (existing is not null)
        {
            if (existing.ExpenseId != expenseId || existing.ContentHash != file.Hash || existing.FileName != file.FileName)
                throw new ExpenseAttachmentRuleException("Este envio já foi registrado com outro comprovante. Recarregue o lançamento.");
            return Row(existing);
        }
        var attachment = new ExpenseAttachment(expenseId, input.OperationId, file.FileName, file.ContentType, file.Content, file.Hash, actor);
        db.Add(attachment);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Row(attachment);
    }

    public async Task<ExpenseAttachmentDownload> Download(Guid expenseId, Guid attachmentId, CancellationToken ct)
    {
        await RequireExpense(expenseId, ct);
        var attachment = await db.Set<ExpenseAttachment>().AsNoTracking().SingleOrDefaultAsync(x => x.Id == attachmentId && x.ExpenseId == expenseId, ct)
            ?? throw new KeyNotFoundException("Comprovante não encontrado.");
        return new(attachment.FileName, attachment.ContentType, Convert.ToBase64String(attachment.Content));
    }

    private async Task RequireExpense(Guid expenseId, CancellationToken ct)
    {
        var record = await db.OperationalRecords.AsNoTracking().SingleOrDefaultAsync(x => x.Id == expenseId && x.Kind == "financeEntries", ct)
            ?? throw new KeyNotFoundException("Despesa não encontrada.");
        using var payload = JsonDocument.Parse(record.Payload);
        if (!payload.RootElement.TryGetProperty("direction", out var direction) || direction.GetString() != "Pagar")
            throw new ExpenseAttachmentRuleException("Comprovantes desta área devem estar vinculados a uma despesa.");
    }

    private static ExpenseAttachmentRow Row(ExpenseAttachment attachment) =>
        new(attachment.Id, attachment.ExpenseId, attachment.FileName, attachment.ContentType, attachment.Content.Length, attachment.CreatedAtUtc);
}
