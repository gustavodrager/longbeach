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
