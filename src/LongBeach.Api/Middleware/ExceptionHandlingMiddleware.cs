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
        catch (LongBeach.Domain.Bar.BarPaymentConfirmationPendingException exception)
        {
            context.Response.StatusCode = StatusCodes.Status502BadGateway;
            await context.Response.WriteAsJsonAsync(new ProblemDetails
            {
                Status = StatusCodes.Status502BadGateway,
                Title = "Confirmação externa pendente",
                Detail = exception.Message,
                Instance = context.Request.Path,
                Extensions = { ["traceId"] = context.TraceIdentifier, ["paymentId"] = exception.PaymentId, ["operationId"] = exception.OperationId }
            });
        }
        catch (LongBeach.Domain.Bar.BarTabAccessException exception)
        {
            var status = exception.Failure switch
            {
                LongBeach.Domain.Bar.BarTabAccessFailure.Invalid => StatusCodes.Status401Unauthorized,
                LongBeach.Domain.Bar.BarTabAccessFailure.Forbidden => StatusCodes.Status403Forbidden,
                _ => StatusCodes.Status410Gone
            };
            await WriteProblemAsync(context, status, "Acesso à comanda indisponível", exception.Message);
        }
        catch (LongBeach.Application.Finance.FinancialRuleException exception)
        {
            await WriteProblemAsync(context, 400, "Conferência financeira rejeitada", exception.Message);
        }
        catch (LongBeach.Domain.Bar.BarRuleException exception)
        {
            await WriteProblemAsync(context, 400, "Operação do Bar rejeitada", exception.Message);
        }
        catch (Exception exception) when (IsSerializationConflict(exception))
        {
            await WriteProblemAsync(context,409,"Operação concorrente","Recarregue os dados e repita com a mesma chave de operação.");
        }
        catch (Microsoft.EntityFrameworkCore.DbUpdateConcurrencyException)
        {
            await WriteProblemAsync(context,409,"Operação concorrente","Recarregue os dados e repita com a mesma chave de operação.");
        }
        catch (Microsoft.EntityFrameworkCore.DbUpdateException)
        {
            await WriteProblemAsync(context, 409, "Conflito de gravação", "Recarregue os dados e verifique duplicidade ou alteração concorrente.");
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

    private static bool IsSerializationConflict(Exception exception)
    {
        for (Exception? cause = exception; cause is not null; cause = cause.InnerException)
            if (cause is Npgsql.PostgresException postgres && postgres.SqlState is "40001" or "40P01") return true;
        return false;
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
