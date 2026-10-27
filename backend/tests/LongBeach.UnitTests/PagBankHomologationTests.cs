using LongBeach.Infrastructure.Bootstrap;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

namespace LongBeach.UnitTests;

public class PagBankHomologationTests
{
    private static IConfiguration Config(string? key = null, string? value = null)
    {
        var values = new Dictionary<string, string?>
        {
            ["Homologation:Enabled"] = "true",
            ["ConnectionStrings:LongBeach"] = "Host=localhost;Database=longbeach_pagbank_homolog;Username=test",
            ["Payments:PagBank:BaseUrl"] = "https://sandbox.api.pagseguro.com/"
        };
        if (key is not null) values[key] = value;
        return new ConfigurationBuilder().AddInMemoryCollection(values).Build();
    }

    [Fact]
    public void AllowsOnlyIsolatedStaging() => PagBankHomologation.Validate(Config(), new EnvironmentStub());

    [Fact]
    public void NotificationHintsAreOptInAndNeverAvailableInProduction()
    {
        Assert.False(PagBankHomologation.AllowsNotificationHints(Config(), new EnvironmentStub()));
        var config = Config("Homologation:AllowUnsignedNotificationHints", "true");
        Assert.True(PagBankHomologation.AllowsNotificationHints(config, new EnvironmentStub()));
        Assert.False(PagBankHomologation.AllowsNotificationHints(config, new EnvironmentStub { EnvironmentName = "Production" }));
        var productionUrl = new ConfigurationBuilder().AddConfiguration(config).AddInMemoryCollection(new Dictionary<string, string?>
            { ["Payments:PagBank:BaseUrl"] = "https://api.pagseguro.com/" }).Build();
        Assert.False(PagBankHomologation.AllowsNotificationHints(productionUrl, new EnvironmentStub()));
    }

    [Theory]
    [InlineData("https://sandbox.api.assinaturas.pagseguro.com/", "sandbox-test", true)]
    [InlineData("https://api.assinaturas.pagseguro.com/", "sandbox-test", false)]
    [InlineData("https://sandbox.api.assinaturas.pagseguro.com/", "", false)]
    public void SubscriptionsRequireExplicitSandboxAndCredential(string url, string token, bool allowed)
    {
        var config = new ConfigurationBuilder().AddConfiguration(Config()).AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Payments:PagBankSubscriptions:Enabled"] = "true",
            ["Payments:PagBankSubscriptions:BaseUrl"] = url,
            ["Payments:PagBankSubscriptions:Token"] = token
        }).Build();
        if (allowed) PagBankHomologation.Validate(config, new EnvironmentStub());
        else Assert.Throws<InvalidOperationException>(() => PagBankHomologation.Validate(config, new EnvironmentStub()));
    }

    [Theory]
    [InlineData("Production")]
    [InlineData("Development")]
    [InlineData("Test")]
    public void RejectsOtherEnvironments(string name)
    {
        var env = new EnvironmentStub { EnvironmentName = name };
        Assert.False(PagBankHomologation.Enabled(Config(), env));
        Assert.Throws<InvalidOperationException>(() => PagBankHomologation.Validate(Config(), env));
    }

    [Theory]
    [InlineData("ConnectionStrings:LongBeach", "Host=localhost;Database=production;Username=test")]
    [InlineData("Payments:PagBank:BaseUrl", "https://api.pagseguro.com/")]
    [InlineData("Integrations:PagBankEdi:Enabled", "true")]
    [InlineData("Payments:PagBankSubscriptions:Enabled", "true")]
    [InlineData("DemoMode:PublicOperationalData", "true")]
    public void RejectsUnsafeConfiguration(string key, string value) =>
        Assert.Throws<InvalidOperationException>(() => PagBankHomologation.Validate(Config(key, value), new EnvironmentStub()));

    [Fact]
    public void ExistingEnvironmentsAreUnchangedWhenDisabled()
    {
        var config = Config("Homologation:Enabled", "false");
        var env = new EnvironmentStub { EnvironmentName = "Production" };
        PagBankHomologation.Validate(config, env);
        Assert.False(PagBankHomologation.Enabled(config, env));
    }

    private sealed class EnvironmentStub : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Staging";
        public string ApplicationName { get; set; } = "Test";
        public string ContentRootPath { get; set; } = ".";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
