using System.Net;
using System.Text;
using System.Text.Json;
using LongBeach.Infrastructure.Messaging;
using Microsoft.Extensions.Configuration;

namespace LongBeach.UnitTests;

public sealed class MessagingAiTests
{
    private sealed class ModelHandler : HttpMessageHandler
    {
        public string ReceivedText { get; private set; } = "";
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            using var payload = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(cancellationToken));
            ReceivedText = payload.RootElement.GetProperty("input")[0].GetProperty("content").GetString()!;
            return new(HttpStatusCode.OK)
            {
                Content = new StringContent(JsonSerializer.Serialize(new
                {
                    output = new[] { new { type = "function_call", name = "route_arena_message", arguments = "{\"action\":\"human\",\"faqId\":null,\"activityKey\":null,\"confirmation\":null}" } }
                }), Encoding.UTF8, "application/json")
            };
        }
    }
    [Fact]
    public async Task Model_receives_the_entire_message_including_a_final_change_of_intent()
    {
        using var handler = new ModelHandler(); using var client = new HttpClient(handler);
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        { ["Messaging:Ai:Enabled"] = "true", ["Messaging:Ai:ApiKey"] = "synthetic-model-only-not-a-real-key" }).Build();
        var service = new MessagingAi(client, config);
        var text = new string('a', 5000) + "\nCorreção: não vou à aula amanhã e não quero mais lembretes.";
        var decision = await service.DecideAsync(text, [], [], default);
        Assert.Equal(text, handler.ReceivedText); Assert.Equal("human", decision.Action);
    }
}
