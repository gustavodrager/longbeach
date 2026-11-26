using System.Text.Json;
using LongBeach.Api.Middleware;
using LongBeach.Application.Bar;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace LongBeach.IntegrationTests;

public sealed class DirectSaleWriteProblemTests
{
    [Theory]
    [InlineData(true, "direct_sale_retryable_conflict", "40001", 3)]
    [InlineData(false, "direct_sale_write_failed", "23505", 1)]
    public async Task Direct_sale_problem_identifies_recovery_and_logs_identifiers_without_database_values(
        bool retryable, string code, string sqlState, int attempts)
    {
        var tabId = Guid.NewGuid(); var operationId = Guid.NewGuid();
        var postgres = new PostgresException("sensitive-database-value", "ERROR", "ERROR", sqlState,
            detail: "sensitive-detail-value", constraintName: "test_constraint");
        var error = new DirectSaleWriteException(tabId, operationId, retryable, attempts,
            new DbUpdateException("sensitive-outer-value", postgres));
        var logger = new CaptureLogger();
        var middleware = new ExceptionHandlingMiddleware(_ => Task.FromException(error), logger);
        using var services = new ServiceCollection().AddOptions().BuildServiceProvider();
        await using var body = new MemoryStream();
        var context = new DefaultHttpContext { RequestServices = services, TraceIdentifier = "direct-sale-trace" };
        context.Request.Path = $"/api/v1/bar/tabs/{tabId}/items";
        context.Response.Body = body;

        await middleware.InvokeAsync(context);
        Assert.Equal(StatusCodes.Status409Conflict, context.Response.StatusCode);
        body.Position = 0;
        using var document = await JsonDocument.ParseAsync(body);
        var payload = document.RootElement;
        Assert.Equal(code, payload.GetProperty("code").GetString());
        Assert.Equal(retryable, payload.GetProperty("retryable").GetBoolean());
        Assert.Equal("unconfirmed", payload.GetProperty("outcome").GetString());
        Assert.Equal(operationId, payload.GetProperty("operationId").GetGuid());
        Assert.Equal(context.TraceIdentifier, payload.GetProperty("traceId").GetString());
        Assert.False(payload.TryGetProperty("sqlState", out _));
        Assert.False(payload.TryGetProperty("constraintName", out _));
        Assert.Equal(retryable ? "1" : "", context.Response.Headers.RetryAfter.ToString());
        Assert.DoesNotContain("sensitive-", payload.GetRawText());

        var log = Assert.Single(logger.Rows);
        Assert.Null(log.Exception);
        Assert.Equal(context.TraceIdentifier, log.Fields["TraceIdentifier"]);
        Assert.Equal(operationId, log.Fields["OperationId"]);
        Assert.Equal(tabId, log.Fields["TabId"]);
        Assert.Equal(sqlState, log.Fields["SqlState"]);
        Assert.Equal("test_constraint", log.Fields["ConstraintName"]);
        Assert.Equal(attempts, log.Fields["Attempts"]);
        Assert.DoesNotContain("sensitive-", log.Message);
    }

    private sealed class CaptureLogger : ILogger<ExceptionHandlingMiddleware>
    {
        public sealed record Row(string Message, Dictionary<string, object?> Fields, Exception? Exception);
        public List<Row> Rows { get; } = [];
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            Rows.Add(new(formatter(state, exception), ((IEnumerable<KeyValuePair<string, object?>>)state!).ToDictionary(row => row.Key, row => row.Value), exception));
    }
}
