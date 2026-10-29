using LongBeach.Domain.Customers;
using LongBeach.Domain.Identity;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace LongBeach.UnitTests;

public sealed class CustomerRulesTests
{
    [Theory]
    [InlineData("(11) 99999-0000", "11999990000")]
    [InlineData("+55 11 99999-0000", "5511999990000")]
    public void New_contacts_require_valid_phone_but_shared_contact_is_allowed(string input, string expected)
    {
        var one = new Customer("Pessoa sintética", input, null, "directory");
        var two = new Customer("Outra pessoa", input, null, "directory");
        Assert.Equal(expected, one.Phone); Assert.Equal(expected, two.Phone);
        Assert.NotEqual(one.Id, two.Id); Assert.False(one.Incomplete); Assert.Null(one.UserId);
    }
    [Theory]
    [InlineData("")]
    [InlineData("abc")]
    [InlineData("123")]
    public void Missing_invalid_new_phone_is_rejected_and_legacy_remains_explicitly_incomplete(string input)
    {
        Assert.Throws<CustomerRuleException>(() => new Customer("Pessoa", input, null, "directory"));
        var legacy = new Customer("Pessoa", input, null, "students", true);
        Assert.True(legacy.Incomplete);
        legacy.Change("Pessoa corrigida", input, null, "Ativo");
        Assert.True(legacy.Incomplete);
        Assert.Throws<CustomerRuleException>(() => legacy.Change("Pessoa", "123456", null, "Ativo"));
        legacy.Change("Pessoa", "11999990000", null, "Ativo"); Assert.False(legacy.Incomplete);
    }
    [Fact]
    public void Validation_never_truncates_legacy_and_alias_must_be_explicitly_undone()
    {
        Assert.Throws<CustomerRuleException>(() => new Customer("Pessoa", new string('1', 41), null, "students", true));
        Assert.Throws<CustomerRuleException>(() => new Customer("Pessoa", "11999990000", "invalid", "directory"));
        var customer = new Customer("Pessoa", "11999990000", null, "directory");
        var target = Guid.NewGuid(); customer.MergeInto(target);
        Assert.Throws<CustomerRuleException>(() => customer.Change("Outro", "11999990000", null, "Ativo"));
        Assert.Throws<CustomerRuleException>(() => customer.UndoMerge(Guid.NewGuid()));
        customer.UndoMerge(target); Assert.Null(customer.MergedIntoId); Assert.Equal(3, customer.Version);
    }
    [Fact]
    public void Permissions_and_model_preserve_boundaries_and_migration_is_additive()
    {
        Assert.Contains(SystemPermissions.CustomersWrite, ProfileAccess.Permissions([SystemRoles.Operations], SystemPermissions.All));
        Assert.DoesNotContain(SystemPermissions.CustomersMerge, ProfileAccess.Permissions([SystemRoles.Operations], SystemPermissions.All));
        foreach (var role in new[] { SystemRoles.Teacher, SystemRoles.Student, SystemRoles.BarOperator, SystemRoles.Viewer, SystemRoles.Auditor })
            Assert.DoesNotContain(SystemPermissions.CustomersRead, ProfileAccess.Permissions([role], SystemPermissions.All));
        using var db = new LongBeachDbContext(new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql("Host=localhost;Port=1;Database=test;Username=test;Password=test").Options, TimeProvider.System);
        Assert.False(db.Database.HasPendingModelChanges());
        var sql = db.GetService<IMigrator>().GenerateScript("20261027135728_MaterialStockLedger");
        Assert.Contains("CREATE TABLE customers", sql); Assert.Contains("customer_operations_immutable", sql);
        Assert.Contains("ON CONFLICT", sql); Assert.Equal(29, db.Database.GetMigrations().Count());
        Assert.DoesNotContain("UPDATE operational_records", sql, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("UPDATE users", sql, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("DELETE FROM", sql, StringComparison.OrdinalIgnoreCase);
    }
}
