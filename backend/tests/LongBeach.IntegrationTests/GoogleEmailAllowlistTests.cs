using LongBeach.Application.Auth;

namespace LongBeach.IntegrationTests;

public sealed class GoogleEmailAllowlistTests
{
    [Fact]
    public void Contains_accepts_multiple_emails_with_whitespace_and_case_differences()
    {
        const string configured = "fixture-1@longbeach.test; fixture-2@longbeach.test";

        Assert.True(GoogleEmailAllowlist.Contains(configured, "FIXTURE-1@LONGBEACH.TEST "));
        Assert.True(GoogleEmailAllowlist.Contains(configured, " fixture-2@longbeach.test"));
    }

    [Fact]
    public void Contains_rejects_unlisted_or_missing_emails()
    {
        const string configured = "fixture-1@longbeach.test,fixture-2@longbeach.test";

        Assert.False(GoogleEmailAllowlist.Contains(configured, "fixture-3@longbeach.test"));
        Assert.False(GoogleEmailAllowlist.Contains(configured, null));
        Assert.Empty(GoogleEmailAllowlist.Parse(" ; , "));
    }
}
