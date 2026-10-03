using System.Security.Claims;
using LongBeach.Application.Abstractions;

namespace LongBeach.Api.Infrastructure;

public sealed class HttpAuditContext(IHttpContextAccessor accessor) : IAuditContext
{
    private HttpContext? HttpContext => accessor.HttpContext;

    public Guid? UserId =>
        Guid.TryParse(HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier), out var id)
            ? id
            : null;

    public string? IpAddress => Truncate(HttpContext?.Connection.RemoteIpAddress?.ToString(), 64);
    public string? UserAgent => Truncate(HttpContext?.Request.Headers.UserAgent.ToString(), 1024);
    public string CorrelationId => Truncate(HttpContext?.TraceIdentifier, 100) ?? "system";

    private static string? Truncate(string? value, int maximumLength) =>
        string.IsNullOrEmpty(value) || value.Length <= maximumLength
            ? value
            : value[..maximumLength];
}
