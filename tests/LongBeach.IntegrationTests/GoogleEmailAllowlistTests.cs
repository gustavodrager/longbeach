using LongBeach.Application.Auth;

namespace LongBeach.IntegrationTests;

public sealed class GoogleEmailAllowlistTests
{
    [Fact]
    public void Contains_accepts_multiple_emails_with_whitespace_and_case_differences()
    {
        const string configured = "gustavodrager@gmail.com; quebranunca@gmail.com";

        Assert.True(GoogleEmailAllowlist.Contains(configured, "GustavoDrager@gmail.com "));
        Assert.True(GoogleEmailAllowlist.Contains(configured, " QUEBRANUNCA@gmail.com"));
    }

    [Fact]
    public void Contains_rejects_unlisted_or_missing_emails()
    {
        const string configured = "gustavodrager@gmail.com,quebranunca@gmail.com";

        Assert.False(GoogleEmailAllowlist.Contains(configured, "other@gmail.com"));
        Assert.False(GoogleEmailAllowlist.Contains(configured, null));
        Assert.Empty(GoogleEmailAllowlist.Parse(" ; , "));
    }
}
