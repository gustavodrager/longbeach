using LongBeach.Api.Middleware;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
namespace LongBeach.IntegrationTests;
public sealed class BarConcurrencyResponseTests
{
    [Theory]
    [InlineData("40001")]
    [InlineData("40P01")]
    public async Task Wrapped_postgres_conflicts_return_retryable_409_without_exposing_database_details(string sqlState)
    {
        var error=new InvalidOperationException("transient failure",new Npgsql.PostgresException("database internals","ERROR","ERROR",sqlState));
        var middleware=new ExceptionHandlingMiddleware(_=>Task.FromException(error),NullLogger<ExceptionHandlingMiddleware>.Instance);
        using var services=new ServiceCollection().AddOptions().BuildServiceProvider();
        var context=new DefaultHttpContext {RequestServices=services}; context.Response.Body=new MemoryStream();
        await middleware.InvokeAsync(context); Assert.Equal(409,context.Response.StatusCode);
        context.Response.Body.Position=0; var body=await new StreamReader(context.Response.Body).ReadToEndAsync();
        using var document=System.Text.Json.JsonDocument.Parse(body); Assert.Contains("mesma chave de operação",document.RootElement.GetProperty("detail").GetString()); Assert.DoesNotContain("database internals",body);
    }
}
