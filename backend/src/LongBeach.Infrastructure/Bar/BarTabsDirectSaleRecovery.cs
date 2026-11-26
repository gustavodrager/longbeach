using LongBeach.Application.Bar;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace LongBeach.Infrastructure.Bar;

public sealed partial class BarTabsService
{
    private const int DirectSaleWriteAttempts = 3;

    private async Task<DirectSaleReceipt> RunDirectSale(
        Guid tabId,
        Guid operationId,
        string fingerprint,
        Func<Task<DirectSaleReceipt>> action,
        CancellationToken ct)
    {
        for (var attempt = 1; ; attempt++)
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                // Run disposes its transaction and clears failed tracked entities before
                // returning here. Every retry starts a fresh transaction with the SAME key.
                // This wrapper is only for local item/stock writes, never payment providers.
                var receipt = await Run(operationId, fingerprint, action, ct);
                if (attempt > 1)
                    logger?.LogInformation(
                        "Direct sale recovered for request {TraceIdentifier}, operation {OperationId}, tab {TabId}, attempt {Attempt}",
                        auditContext?.CorrelationId ?? "system", operationId, tabId, attempt);
                return receipt;
            }
            catch (Exception error) when (!ct.IsCancellationRequested && IsDirectSaleWriteFailure(error))
            {
                var postgres = DirectSalePostgresCause(error);
                var retryable = error is DbUpdateConcurrencyException || postgres?.SqlState is "40001" or "40P01";
                if (!retryable || attempt >= DirectSaleWriteAttempts)
                    throw new DirectSaleWriteException(tabId, operationId, retryable, attempt, error);

                // Exception details can contain customer data or SQL parameter values.
                // Log identifiers and database error codes only.
                logger?.LogWarning(
                    "Retrying direct sale for request {TraceIdentifier}, operation {OperationId}, tab {TabId}, attempt {Attempt}, SQL state {SqlState}, constraint {ConstraintName}, failure {FailureType}",
                    auditContext?.CorrelationId ?? "system", operationId, tabId, attempt,
                    postgres?.SqlState, postgres?.ConstraintName, error.GetType().Name);
                await Task.Delay(TimeSpan.FromMilliseconds(40 * attempt + Random.Shared.Next(40)), ct);
            }
        }
    }

    private static bool IsDirectSaleWriteFailure(Exception error) =>
        error is DbUpdateException || DirectSalePostgresCause(error) is not null;

    private static PostgresException? DirectSalePostgresCause(Exception error)
    {
        for (Exception? cause = error; cause is not null; cause = cause.InnerException)
            if (cause is PostgresException postgres) return postgres;
        return null;
    }
}
