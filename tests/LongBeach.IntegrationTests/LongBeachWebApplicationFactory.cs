using LongBeach.Application.Auth;
using LongBeach.Contracts.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace LongBeach.IntegrationTests;

public sealed class LongBeachWebApplicationFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Test");
        builder.ConfigureAppConfiguration((_, configuration) =>
        {
            configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:LongBeach"] = "Host=localhost;Port=1;Database=test;Username=test;Password=test",
                ["Authentication:Jwt:Issuer"] = "LongBeach.Tests",
                ["Authentication:Jwt:Audience"] = "LongBeach.Tests.Client",
                ["Authentication:Jwt:SigningKey"] = "integration-tests-only-signing-key-with-more-than-32-characters",
                ["Database:MigrateOnStartup"] = "false",
                ["Authorization:SeedOnStartup"] = "false",
                ["HealthChecks:DatabaseEnabled"] = "false",
                ["Cors:AllowedOrigins:0"] = "https://longbeach.test",
                ["Authentication:MobileAllowedOrigins:0"] = "capacitor://localhost",
                ["Authentication:MobileAllowedOrigins:1"] = "https://localhost"
            });
        });

        builder.ConfigureServices(services =>
        {
            services.AddSingleton<IAuthService, StubAuthService>();
        });
    }

    private sealed class StubAuthService : IAuthService
    {
        private static readonly DateTimeOffset ExpiresAt =
            new(2026, 10, 1, 12, 15, 0, TimeSpan.Zero);

        public Task<AuthSession> LoginAsync(
            string email,
            string password,
            string? ipAddress,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(Session(email));

        public Task<AuthSession> LoginWithGoogleAsync(
            string email,
            string? ipAddress,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(Session(email));

        public Task<AuthSession> RefreshAsync(
            string refreshToken,
            string? csrfToken,
            bool requireCsrf,
            string? ipAddress,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(Session("owner@longbeach.test"));

        public Task LogoutAsync(
            string refreshToken,
            string? csrfToken,
            bool requireCsrf,
            string? ipAddress,
            CancellationToken cancellationToken = default) => Task.CompletedTask;

        public Task ChangePasswordAsync(
            Guid userId,
            string currentPassword,
            string newPassword,
            string? ipAddress,
            CancellationToken cancellationToken = default) => Task.CompletedTask;

        private static AuthSession Session(string email) =>
            new(
                new AuthResponse(
                    "access-token",
                    ExpiresAt,
                    "csrf-token",
                    new UserSummary(
                        Guid.Parse("11111111-1111-1111-1111-111111111111"),
                        "Arena Owner",
                        email,
                        ["Owner"],
                        ["users:manage"])),
                "refresh-token",
                ExpiresAt.AddDays(30),
                "csrf-token");
    }
}
