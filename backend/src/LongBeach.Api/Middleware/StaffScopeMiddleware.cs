using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;

namespace LongBeach.Api.Middleware;

// Templates limit operations as well as navigation. Shared legacy permissions are
// intentionally insufficient to restore an unchecked menu or action.
public sealed class StaffScopeMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context)
    {
        if (context.User.Identity?.IsAuthenticated != true || !context.User.HasClaim("staff_managed", "true") ||
            context.GetEndpoint()?.Metadata.GetMetadata<IAllowAnonymous>() is not null ||
            StaffApiScope.Allowed(context.User, context.Request.Method, context.Request.Path.Value, context.Request.Query["scope"]))
        {
            await next(context);
            return;
        }
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        await context.Response.WriteAsJsonAsync(new { message = "Seu tipo de acesso não permite esta operação." });
    }
}

public static class StaffApiScope
{
    public static bool Allowed(ClaimsPrincipal user, string method, string? requestPath, string? customerScope = null)
    {
        var path = (requestPath ?? "").TrimEnd('/').ToLowerInvariant();
        var read = HttpMethods.IsGet(method) || HttpMethods.IsHead(method);
        bool Menu(params string[] ids) => ids.Any(id => user.HasClaim("staff_menu", id));
        bool Action(params string[] ids) => ids.Any(id => user.HasClaim("staff_action", id));
        bool Area(string id) => read ? Menu(id) : Menu(id) && Action(id + ".operate");
        bool Bar(params string[] ids) => ids.Any(id => Menu(id) && Action(id));
        bool AnyBar() => Menu("bar.sell", "bar.tabs", "bar.orders", "bar.receive", "bar.cash");
        bool Owner() => user.HasClaim("can_manage_staff", "true");

        if (!path.StartsWith("/api/v1/", StringComparison.Ordinal)) return true;
        if (path.StartsWith("/api/v1/auth/", StringComparison.Ordinal) || path == "/api/v1/auth" ||
            path.StartsWith("/api/v1/me/auth-methods", StringComparison.Ordinal)) return true;
        if (path.StartsWith("/api/v1/staff-access", StringComparison.Ordinal) || path.StartsWith("/api/v1/teaching/access", StringComparison.Ordinal)) return Owner();
        if (path.StartsWith("/api/v1/me/teaching", StringComparison.Ordinal))
        {
            if (!read) return Menu("teaching.attendance") && Action("teaching.presence");
            return Menu("teaching.today", "teaching.classes", "teaching.attendance");
        }
        // Personal client data is a different area. A staff work template does not
        // silently acquire it from the account's previous profile or cached token.
        if (path.StartsWith("/api/v1/me/", StringComparison.Ordinal)) return false;

        if (path.StartsWith("/api/v1/operations/", StringComparison.Ordinal))
        {
            var kind = path["/api/v1/operations/".Length..].Split('/')[0];
            return kind switch
            {
                "team" => Owner() || read && Menu("classes", "enrollments", "presences", "agenda", "recurring", "administration"),
                "students" => read ? Menu("students", "classes", "enrollments", "presences") : Area("students"),
                "classes" => read ? Menu("classes", "enrollments", "presences", "agenda") : Area("classes"),
                "enrollments" => read ? Menu("enrollments", "presences", "classes") : Area("enrollments"),
                "presences" => Area("presences"),
                "courts" => path.Contains("/schedule", StringComparison.Ordinal)
                    ? read && Menu("agenda", "recurring", "classes")
                    : read ? Menu("agenda.settings", "agenda", "classes", "enrollments", "recurring") : Area("agenda.settings"),
                "reservations" => read ? Menu("agenda", "recurring", "classes") : Area("agenda"),
                "rentalgroups" or "rentalmonths" or "rentalattendances" => Area("recurring"),
                "inventory" => Area("materials"),
                "projects" => Area("projects"),
                "maintenance" => Area("maintenance"),
                "financeentries" => Area("finance"),
                _ => false
            };
        }
        if (path.StartsWith("/api/v1/customers", StringComparison.Ordinal))
        {
            if (path.Contains("/merge", StringComparison.Ordinal) || path.Contains("/backfill", StringComparison.Ordinal) || path.EndsWith("/duplicates", StringComparison.Ordinal))
                return Menu("customers") && Action("customers.merge");
            if (path == "/api/v1/customers/lookup" && read || path == "/api/v1/customers" && !read)
            {
                var related = customerScope switch
                {
                    "bar" => read ? AnyBar() : Bar("bar.sell", "bar.tabs"),
                    "students" => read ? Menu("students", "enrollments", "presences", "classes") : Area("students"),
                    "projects" => read ? Menu("projects", "recurring") : Area("projects") || Area("recurring"),
                    "reservations" => read ? Menu("agenda", "recurring") : Area("agenda") || Area("recurring"),
                    "messaging" => read && Menu("messaging", "messaging.sends"),
                    _ => false
                };
                return related || Area("customers");
            }
            return Area("customers");
        }
        if (path.StartsWith("/api/v1/materials", StringComparison.Ordinal)) return Area("materials");
        if (path.StartsWith("/api/v1/rentals/", StringComparison.Ordinal)) return Area("recurring");
        if (path.StartsWith("/api/v1/portal/", StringComparison.Ordinal)) return Area("agenda.requests");
        if (path.StartsWith("/api/v1/imports", StringComparison.Ordinal)) return Area("administration");
        if (path.StartsWith("/api/v1/messaging", StringComparison.Ordinal))
        {
            if (path.Contains("/settings", StringComparison.Ordinal) || path.Contains("/faqs", StringComparison.Ordinal) || path.Contains("/connection", StringComparison.Ordinal)) return Area("messaging.automation");
            if (path.Contains("/sends", StringComparison.Ordinal)) return Area("messaging.sends");
            if (path.EndsWith("/capabilities", StringComparison.Ordinal) || path.Contains("/operations/", StringComparison.Ordinal))
                return read && Menu("messaging", "messaging.sends", "messaging.automation");
            if (path.Contains("/attachments", StringComparison.Ordinal) || path.Contains("/messages/", StringComparison.Ordinal) && path.EndsWith("/cancel", StringComparison.Ordinal))
                return Area("messaging") || Area("messaging.sends");
            return Area("messaging");
        }
        if (path.StartsWith("/api/v1/financial-history", StringComparison.Ordinal)) return read ? Menu("finance", "reports") : Area("finance");
        if (path.StartsWith("/api/v1/received-invoices", StringComparison.Ordinal)) return Menu("stock") && Action("stock.fiscal");
        if (path.StartsWith("/api/v1/expenses", StringComparison.Ordinal) || path.StartsWith("/api/v1/billing", StringComparison.Ordinal)) return Area("finance");
        if (!path.StartsWith("/api/v1/bar/", StringComparison.Ordinal)) return false;

        var bar = path["/api/v1/bar/".Length..];
        if (bar is "catalog" or "categories") return read ? AnyBar() || Menu("stock") : Area("stock");
        if (bar is "tabs/catalog" or "tabs/config" or "tabs/locations" or "tabs/customers" || bar == "payments/config")
            return read && AnyBar();
        if (bar.StartsWith("cash/", StringComparison.Ordinal))
        {
            if ((bar is "cash/current" or "cash/registers" or "cash/sessions" or "cash/locations") && read) return AnyBar();
            if (bar.Contains("/reopen", StringComparison.Ordinal) || bar.Contains("/details", StringComparison.Ordinal) || bar == "cash/history") return Menu("bar.tabs") && Action("bar.supervise");
            return Bar("bar.cash");
        }
        if (bar.StartsWith("tabs", StringComparison.Ordinal))
        {
            if (bar.StartsWith("tabs/reports", StringComparison.Ordinal) || bar.StartsWith("tabs/resources", StringComparison.Ordinal)) return read && Area("reports");
            if (bar.StartsWith("tabs/payments", StringComparison.Ordinal)) return read && Area("reports");
            if (read) return AnyBar(); // Shared readonly comanda data powers selling, orders and receiving.
            if (bar.Contains("/refund", StringComparison.Ordinal)) return Menu("bar.receive") && Action("bar.refund");
            if (bar.Contains("/adjustments", StringComparison.Ordinal) || bar.EndsWith("/reverse", StringComparison.Ordinal)) return Menu("bar.tabs") && Action("bar.supervise");
            if (bar.Contains("/payments", StringComparison.Ordinal)) return Bar("bar.receive");
            if (bar.EndsWith("/close", StringComparison.Ordinal)) return Bar("bar.tabs", "bar.receive");
            if (bar.Contains("/items/", StringComparison.Ordinal)) return Bar("bar.orders");
            if (bar == "tabs") return Bar("bar.sell", "bar.tabs");
            if (bar.EndsWith("/items", StringComparison.Ordinal)) return Bar("bar.sell");
            return Bar("bar.sell", "bar.tabs");
        }
        if (bar.StartsWith("sales", StringComparison.Ordinal))
        {
            if (read) return AnyBar();
            if (bar.Contains("/refund", StringComparison.Ordinal)) return Menu("bar.receive") && Action("bar.refund");
            if (bar.Contains("/discount", StringComparison.Ordinal) || bar.Contains("/courtesy", StringComparison.Ordinal)) return Menu("bar.tabs") && Action("bar.supervise");
            if (bar.Contains("/payments", StringComparison.Ordinal)) return Bar("bar.receive");
            return Bar("bar.sell");
        }
        if (bar is "dashboard" || bar.StartsWith("payments", StringComparison.Ordinal)) return Area("reports");
        if (bar.StartsWith("products", StringComparison.Ordinal) || bar.StartsWith("stock", StringComparison.Ordinal) ||
            bar.StartsWith("counts", StringComparison.Ordinal) || bar.StartsWith("purchases", StringComparison.Ordinal) ||
            bar.StartsWith("suppliers", StringComparison.Ordinal) || bar.StartsWith("recipes", StringComparison.Ordinal) || bar.StartsWith("menu", StringComparison.Ordinal)) return Area("stock");
        return false;
    }
}
