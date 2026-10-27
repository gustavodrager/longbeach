using System.Net;
using System.Text;
using System.Text.Json;
using LongBeach.Application.Billing;
using LongBeach.Contracts.Billing;
using LongBeach.Domain.Bar;
using LongBeach.Infrastructure.Payments;
using Microsoft.Extensions.Configuration;

namespace LongBeach.UnitTests;

public sealed class PagBankRecurringGatewayTests
{
    private const string TaxId = "12345678909";
    private static SubscribeInput Input(Guid operation) => new(operation, "Pagador teste", "teste@example.invalid", TaxId, "11999999999", "new-encrypted-card", true, 10, new(2026, 10, 13), "987");
    private static PagBankRecurringGateway Gateway(HttpClient http) => new(http, new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
    {
        ["Payments:PagBankSubscriptions:Token"] = "test-token", ["Payments:PagBankSubscriptions:Enabled"] = "true"
    }).Build());
    private static HttpResponseMessage Json(object value, HttpStatusCode status = HttpStatusCode.OK) => new(status) { Content = new StringContent(JsonSerializer.Serialize(value), Encoding.UTF8, "application/json") };
    private static object State(Guid reference) => new { id = "SUBS_found", reference_id = reference.ToString(), status = "ACTIVE", amount = new { value = 1000, currency = "BRL" } };
    private sealed class Handler(Func<HttpRequestMessage, Task<HttpResponseMessage>> send) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => send(request);
    }

    [Fact]
    public async Task Existing_customer_receives_new_encrypted_card_before_subscription_and_separate_stable_keys()
    {
        var reference = Guid.NewGuid(); var operation = Guid.NewGuid(); var requests = new List<(string Path, string Key)>();
        using var http = new HttpClient(new Handler(async request =>
        {
            var path = request.RequestUri!.AbsolutePath; var key = request.Headers.GetValues("x-idempotency-key").Single(); requests.Add((path, key));
            using var json = JsonDocument.Parse(await request.Content!.ReadAsStringAsync()); var body = json.RootElement;
            if (request.Method == HttpMethod.Put)
            {
                Assert.Equal("/customers/CUST_owned/billing_info", path);
                Assert.Equal(JsonValueKind.Array, body.ValueKind); Assert.Single(body.EnumerateArray());
                Assert.Equal("CREDIT_CARD", body[0].GetProperty("type").GetString());
                Assert.Equal("new-encrypted-card", body[0].GetProperty("card").GetProperty("encrypted").GetString());
                Assert.False(body[0].GetProperty("card").TryGetProperty("security_code", out _));
                return Json(new { id = "CUST_owned" });
            }
            Assert.Equal(HttpMethod.Post, request.Method); Assert.Equal("/subscriptions", path);
            Assert.Equal(reference.ToString(), body.GetProperty("reference_id").GetString());
            Assert.Single(body.GetProperty("customer").EnumerateObject()); Assert.Equal("CUST_owned", body.GetProperty("customer").GetProperty("id").GetString());
            Assert.Equal("987", body.GetProperty("payment_method")[0].GetProperty("card").GetProperty("security_code").GetString());
            Assert.Equal(operation.ToString("N"), key);
            return Json(State(reference));
        }));
        var gateway = Gateway(http); var customer = new RecurringCustomer("CUST_owned", "owned-reference", TaxId);
        await gateway.CreateForCustomer(reference, operation, "PLAN_test", Input(operation), customer, default);
        await gateway.CreateForCustomer(reference, operation, "PLAN_test", Input(operation), customer, default);
        Assert.Equal(4, requests.Count); Assert.NotEqual(requests[0].Key, requests[1].Key);
        Assert.Matches("^[A-Za-z0-9]+$", requests[0].Key); Assert.Equal(requests[0], requests[2]); Assert.Equal(requests[1], requests[3]);
    }

    [Theory]
    [InlineData(400, "invalid_card", true)]
    [InlineData(409, "invalid_parameter", true)]
    [InlineData(409, "idempotency_key_validation", false)]
    [InlineData(500, "invalid_parameter", false)]
    public async Task Card_update_failure_never_creates_subscription(int status, string error, bool definitive)
    {
        var calls = 0; var operation = Guid.NewGuid();
        using var http = new HttpClient(new Handler(request =>
        {
            calls++; Assert.Equal(HttpMethod.Put, request.Method);
            return Task.FromResult(Json(new { error_messages = new[] { new { error, parameter_name = "billing_info.card" } } }, (HttpStatusCode)status));
        }));
        var exception = await Record.ExceptionAsync(() => Gateway(http).CreateForCustomer(Guid.NewGuid(), operation, "PLAN_test", Input(operation), new("CUST_owned", "owned", TaxId), default));
        if (definitive) Assert.IsType<RecurringCreationRejectedException>(exception); else Assert.IsType<BarRuleException>(exception);
        Assert.Equal(1, calls);
    }

    [Fact]
    public async Task Existing_customer_with_other_tax_id_never_changes_card()
    {
        using var http = new HttpClient(new Handler(_ => throw new InvalidOperationException("Must not contact provider")));
        await Assert.ThrowsAsync<BarRuleException>(() => Gateway(http).CreateForCustomer(Guid.NewGuid(), Guid.NewGuid(), "PLAN_test", Input(Guid.NewGuid()), new("CUST_other", "owned", "98765432100"), default));
    }

    [Fact]
    public async Task Find_customer_uses_header_and_all_pages_before_accepting_exact_document()
    {
        var calls = 0;
        using var http = new HttpClient(new Handler(request =>
        {
            Assert.Equal(TaxId, request.Headers.GetValues("q").Single());
            Assert.DoesNotContain(TaxId, request.RequestUri!.Query); calls++;
            if (calls == 1)
            {
                Assert.Equal("?offset=0&limit=100", request.RequestUri.Query);
                return Task.FromResult(Json(new { customers = Enumerable.Range(0, 100).Select(n => new { id = "CUST_" + n, reference_id = "another", tax_id = "98765432100" }), result_set = new { total = 101 } }));
            }
            Assert.Equal("?offset=100&limit=100", request.RequestUri.Query);
            return Task.FromResult(Json(new { customers = new[] { new { id = "CUST_target", reference_id = "owned-reference", tax_id = TaxId } }, result_set = new { total = 101 } }));
        }));
        Assert.Equal(new("CUST_target", "owned-reference", TaxId), await Gateway(http).FindCustomer(TaxId, default)); Assert.Equal(2, calls);
    }

    [Fact]
    public async Task Customer_lookup_rejects_ambiguous_or_inconsistent_pages()
    {
        using var ambiguous = new HttpClient(new Handler(_ => Task.FromResult(Json(new { customers = new[] { new { id = "CUST_a", reference_id = "one", tax_id = TaxId }, new { id = "CUST_b", reference_id = "two", tax_id = TaxId } } }))));
        await Assert.ThrowsAsync<BarRuleException>(() => Gateway(ambiguous).FindCustomer(TaxId, default));
        var calls = 0;
        using var repeated = new HttpClient(new Handler(_ => Task.FromResult(Json(new { customers = new[] { new { id = "CUST_repeat", reference_id = "owned", tax_id = ++calls == 1 ? TaxId : "98765432100" } }, result_set = new { total = 2 } }))));
        await Assert.ThrowsAsync<BarRuleException>(() => Gateway(repeated).FindCustomer(TaxId, default));
    }

    [Fact]
    public async Task Customer_lookup_does_not_match_partial_or_masked_document()
    {
        using var http = new HttpClient(new Handler(_ => Task.FromResult(Json(new { customers = new[] { new { id = "CUST_masked", reference_id = "owned", tax_id = "123******09" } } }))));
        Assert.Null(await Gateway(http).FindCustomer(TaxId, default));
    }

    [Fact]
    public async Task Subscription_lookup_paginates_exact_reference_then_gets_authoritative_resource()
    {
        var reference = Guid.NewGuid(); var calls = 0;
        using var http = new HttpClient(new Handler(request =>
        {
            calls++; Assert.False(request.Headers.Contains("q"));
            if (calls == 1)
            {
                Assert.Equal("/subscriptions?offset=0&limit=100", request.RequestUri!.PathAndQuery);
                return Task.FromResult(Json(new { subscriptions = Enumerable.Range(0, 100).Select(n => new { id = "SUBS_" + n, reference_id = reference + "-other" }), result_set = new { total = 101 } }));
            }
            if (calls == 2)
            {
                Assert.Equal("/subscriptions?offset=100&limit=100", request.RequestUri!.PathAndQuery);
                return Task.FromResult(Json(new { subscriptions = new[] { new { id = "SUBS_found", reference_id = reference.ToString() } }, result_set = new { total = 101 } }));
            }
            Assert.Equal("/subscriptions/SUBS_found", request.RequestUri!.AbsolutePath); return Task.FromResult(Json(State(reference)));
        }));
        Assert.Equal(new("SUBS_found", reference.ToString(), "ACTIVE", 1000, "BRL"), await Gateway(http).FindSubscription(reference, default)); Assert.Equal(3, calls);
    }

    [Fact]
    public async Task Subscription_lookup_rejects_ambiguity_and_detail_mismatch()
    {
        var reference = Guid.NewGuid();
        using var ambiguous = new HttpClient(new Handler(_ => Task.FromResult(Json(new { subscriptions = new[] { new { id = "SUBS_one", reference_id = reference.ToString() }, new { id = "SUBS_two", reference_id = reference.ToString() } } }))));
        await Assert.ThrowsAsync<BarRuleException>(() => Gateway(ambiguous).FindSubscription(reference, default));
        using var mismatched = new HttpClient(new Handler(request => Task.FromResult(request.RequestUri!.AbsolutePath == "/subscriptions"
            ? Json(new { subscriptions = new[] { new { id = "SUBS_found", reference_id = reference.ToString() } } }) : Json(State(Guid.NewGuid())))));
        await Assert.ThrowsAsync<BarRuleException>(() => Gateway(mismatched).FindSubscription(reference, default));
    }

    [Theory]
    [InlineData(400, "{\"error_messages\":[{\"error\":\"invalid_card\"}]}", true)]
    [InlineData(409, "{\"error_messages\":[{\"error\":\"invalid_parameter\",\"parameter_name\":\"customer.tax_id\"}]}", true)]
    [InlineData(400, "{\"error_messages\":[{\"code\":\"40002\",\"description\":\"invalid_parameter\"}]}", true)]
    [InlineData(400, "{\"error_messages\":[{\"error\":\"unknown\",\"description\":\"invalid_parameter\"}]}", false)]
    [InlineData(409, "{\"error_messages\":[{\"error\":\"idempotency_key_validation\"}]}", false)]
    [InlineData(409, "{\"error_messages\":[{\"error\":\"invalid_parameter\",\"parameter_name\":\"x-idempotency-key\"}]}", false)]
    [InlineData(400, "{\"error_messages\":[{\"error\":\"invalid_card\"},{\"error\":\"unknown\"}]}", false)]
    [InlineData(400, "not json", false)]
    [InlineData(400, "[]", false)]
    [InlineData(500, "{\"error_messages\":[{\"error\":\"invalid_card\"}]}", false)]
    [InlineData(401, "{\"error_messages\":[{\"error\":\"invalid_card\"}]}", false)]
    public async Task Only_unambiguous_creation_validation_is_terminal(int status, string response, bool definitive)
    {
        using var http = new HttpClient(new Handler(_ => Task.FromResult(new HttpResponseMessage((HttpStatusCode)status) { Content = new StringContent(response) })));
        var operation = Guid.NewGuid(); var error = await Record.ExceptionAsync(() => Gateway(http).Create(Guid.NewGuid(), operation, "PLAN_test", Input(operation), default));
        if (definitive) Assert.IsType<RecurringCreationRejectedException>(error); else Assert.IsType<BarRuleException>(error);
        Assert.DoesNotContain(response, error!.Message);
    }

    [Fact]
    public async Task Read_failure_or_network_timeout_is_not_creation_rejection()
    {
        using var read = new HttpClient(new Handler(_ => Task.FromResult(Json(new { error_messages = new[] { new { error = "invalid_parameter" } } }, HttpStatusCode.BadRequest))));
        await Assert.ThrowsAsync<BarRuleException>(() => Gateway(read).Get("SUBS_unknown", default));
        using var timeout = new HttpClient(new Handler(_ => throw new TaskCanceledException("Timed out")));
        var operation = Guid.NewGuid(); await Assert.ThrowsAsync<TaskCanceledException>(() => Gateway(timeout).Create(Guid.NewGuid(), operation, "PLAN_test", Input(operation), default));
    }
}
