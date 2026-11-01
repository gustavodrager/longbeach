using LongBeach.Application.Messaging;
using Microsoft.Extensions.DependencyInjection;

namespace LongBeach.Infrastructure.Messaging;

public static class MessagingAutomationRegistration
{
    public static IServiceCollection AddMessagingAutomation(this IServiceCollection services)
    {
        services.AddScoped<MessagingContextService>();
        services.AddScoped<IMessagingContext>(provider => provider.GetRequiredService<MessagingContextService>());
        services.AddScoped<IMessagingAutomation, MessagingAutomation>();
        services.AddSingleton<MessagingScheduleGate>();
        services.AddHttpClient<IMessagingAi, MessagingAi>(client => client.Timeout = TimeSpan.FromSeconds(15))
            .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
        return services;
    }
}

public sealed class MessagingScheduleGate
{
    private long lastMinute = long.MinValue;
    public bool Take(DateTimeOffset now) => Interlocked.Exchange(ref lastMinute, now.ToUnixTimeSeconds() / 60) != now.ToUnixTimeSeconds() / 60;
}
