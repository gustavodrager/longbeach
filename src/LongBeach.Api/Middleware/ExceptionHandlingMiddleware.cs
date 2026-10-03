using LongBeach.Application.Auth;
using Microsoft.AspNetCore.Mvc;

namespace LongBeach.Api.Middleware;

public sealed class ExceptionHandlingMiddleware(
    RequestDelegate next,
    ILogger<ExceptionHandlingMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (AuthenticationFailedException exception)
        {
            await WriteProblemAsync(context, StatusCodes.Status401Unauthorized, "Authentication failed", exception.Message);
        }
        catch (InvalidRefreshTokenException exception)
        {
            await WriteProblemAsync(context, StatusCodes.Status401Unauthorized, "Invalid refresh token", exception.Message);
        }
        catch (CsrfValidationException exception)
        {
            await WriteProblemAsync(context, StatusCodes.Status403Forbidden, "Request rejected", exception.Message);
        }
        catch (CurrentPasswordInvalidException exception)
        {
            await WriteProblemAsync(context, StatusCodes.Status400BadRequest, "Password change rejected", exception.Message);
        }
        catch (WeakPasswordException exception)
        {
            await WriteProblemAsync(context, StatusCodes.Status400BadRequest, "Password does not meet the requirements", exception.Message);
        }
        catch (ConcurrencyConflictException exception)
        {
            await WriteProblemAsync(context, StatusCodes.Status409Conflict, "Concurrent session update", exception.Message);
        }
        catch (BadHttpRequestException exception)
        {
            await WriteProblemAsync(context, StatusCodes.Status400BadRequest, "Invalid request", exception.Message);
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Unhandled error for request {TraceIdentifier}", context.TraceIdentifier);
            await WriteProblemAsync(
                context,
                StatusCodes.Status500InternalServerError,
                "Unexpected error",
                "The request could not be completed.");
        }
    }

    private static Task WriteProblemAsync(HttpContext context, int status, string title, string detail)
    {
        context.Response.StatusCode = status;
        context.Response.ContentType = "application/problem+json";
        return context.Response.WriteAsJsonAsync(new ProblemDetails
        {
            Status = status,
            Title = title,
            Detail = detail,
            Instance = context.Request.Path,
            Extensions = { ["traceId"] = context.TraceIdentifier }
        });
    }
}
