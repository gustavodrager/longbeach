using LongBeach.Application.Auth;
using Microsoft.Extensions.DependencyInjection;

namespace LongBeach.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddSingleton(TimeProvider.System);
        services.AddScoped<IAuthService, AuthService>();
        return services;
    }
}
