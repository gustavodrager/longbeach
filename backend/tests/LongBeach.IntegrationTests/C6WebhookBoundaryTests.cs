using System.Net;
using System.Text;

namespace LongBeach.IntegrationTests;

public sealed class C6WebhookBoundaryTests
{
    [Fact]
    public async Task Batch_with_more_than_five_hints_does_not_trigger_queries_or_bank_requests()
    {
        await using var factory = new LongBeachWebApplicationFactory(); using var client = factory.CreateClient();
        var body = System.Text.Json.JsonSerializer.Serialize(new { pix = Enumerable.Range(0, 6).Select(_ => new { txid = Guid.NewGuid().ToString("N") }) });
        var response = await client.PostAsync("/api/v1/integrations/c6/pix/webhook", new StringContent(body, Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
    }

    [Theory]
    [InlineData("{\"pix\":[]}", HttpStatusCode.Accepted)]
    [InlineData("{\"pix\":[{\"txid\":\"invalid\",\"valor\":\"999.00\"}]}", HttpStatusCode.Accepted)]
    [InlineData("{", HttpStatusCode.BadRequest)]
    [InlineData("{\"service\":\"PIX\",\"key\":\"test-pix-key\",\"information\":\"{\"}", HttpStatusCode.BadRequest)]
    [InlineData("{\"service\":\"PIX\",\"key\":\"test-pix-key\",\"information\":\"{\\\"pix\\\":[]}\"}", HttpStatusCode.Accepted)]
    [InlineData("{\"service\":\"PIX\",\"information\":{\"pix\":[]}}", HttpStatusCode.Accepted)]
    public async Task Public_callback_ignores_unusable_hints_without_bank_or_database_access(string body, HttpStatusCode expected)
    {
        await using var factory = new LongBeachWebApplicationFactory(); using var client = factory.CreateClient();
        var response = await client.PostAsync("/api/v1/integrations/c6/pix/webhook", new StringContent(body, Encoding.UTF8, "application/json"));
        Assert.Equal(expected, response.StatusCode);
    }

    [Fact]
    public async Task Oversized_public_callback_is_rejected_before_processing()
    {
        await using var factory = new LongBeachWebApplicationFactory(); using var client = factory.CreateClient();
        var response = await client.PostAsync("/api/v1/integrations/c6/pix/webhook", new StringContent(new string('x', 65537), Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, response.StatusCode);
    }
}
