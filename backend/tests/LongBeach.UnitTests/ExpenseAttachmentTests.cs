using System.Text;
using LongBeach.Application.Finance;
using LongBeach.Contracts.Finance;
using LongBeach.Domain.Finance;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace LongBeach.UnitTests;

public sealed class ExpenseAttachmentTests
{
    [Theory]
    [InlineData("comprovante.pdf", "JVBERi0xLjcK", "application/pdf")]
    [InlineData("comprovante.PNG", "iVBORw0KGgo=", "image/png")]
    [InlineData("comprovante.jpeg", "/9j/", "image/jpeg")]
    public void Detects_permitted_content_and_preserves_original_bytes(string name, string base64, string contentType)
    {
        var file = ExpenseAttachmentRules.Read(new(Guid.NewGuid(), name, base64));
        Assert.Equal(name, file.FileName);
        Assert.Equal(contentType, file.ContentType);
        Assert.Equal(Convert.FromBase64String(base64), file.Content);
        Assert.Equal(64, file.Hash.Length);
    }

    [Theory]
    [InlineData("foto.png", "JVBERi0xLjcK")]
    [InlineData("pagina.pdf", "PGh0bWw+")]
    [InlineData("pagina.html", "JVBERi0xLjcK")]
    [InlineData("../arquivo.pdf", "JVBERi0xLjcK")]
    [InlineData("C:\\arquivo.pdf", "JVBERi0xLjcK")]
    [InlineData("arquivo.pdf", "nao-base64")]
    [InlineData("arquivo.pdf", "")]
    public void Rejects_disallowed_names_or_content(string name, string base64) =>
        Assert.Throws<ExpenseAttachmentRuleException>(() => ExpenseAttachmentRules.Read(new(Guid.NewGuid(), name, base64)));

    [Fact]
    public void Rejects_missing_operation_and_excessive_file_size()
    {
        Assert.Throws<ExpenseAttachmentRuleException>(() => ExpenseAttachmentRules.Read(new(Guid.Empty, "arquivo.pdf", "JVBERi0xLjcK")));
        var content = new byte[ExpenseAttachmentRules.MaxBytes + 1];
        Encoding.ASCII.GetBytes("%PDF-1.7").CopyTo(content, 0);
        Assert.Throws<ExpenseAttachmentRuleException>(() => ExpenseAttachmentRules.Read(new(Guid.NewGuid(), "arquivo.pdf", Convert.ToBase64String(content))));
    }

    [Fact]
    public void Attachment_migration_is_current_and_protects_document_storage()
    {
        using var db = new LongBeachDbContext(new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql("Host=localhost;Database=longbeach;Username=test;Password=test").Options, TimeProvider.System);
        Assert.False(db.Database.HasPendingModelChanges());
        var sql = db.GetService<IMigrator>().GenerateScript();
        Assert.Contains("CREATE TABLE expense_attachments", sql);
        Assert.Contains("IX_expense_attachments_OperationId", sql);
        Assert.Contains("FK_expense_attachments_operational_records_ExpenseId", sql);
    }

    [Fact]
    public void Existing_documents_and_payment_history_cannot_be_changed_or_deleted()
    {
        using var db = new LongBeachDbContext(new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql("Host=localhost;Database=longbeach;Username=test;Password=test").Options, TimeProvider.System);
        var attachment = new ExpenseAttachment(Guid.NewGuid(), Guid.NewGuid(), "original.pdf", "application/pdf", "%PDF-1.7"u8.ToArray(), new string('A', 64), Guid.NewGuid());
        db.Attach(attachment);
        db.Entry(attachment).Property(x => x.Content).CurrentValue = "%PDF-1.7 changed"u8.ToArray();
        Assert.Throws<BarRuleException>(() => db.SaveChanges());
        db.ChangeTracker.Clear();
        var payment = new OperationalRecord(Guid.NewGuid(), "expensePayments", "Pagamento", "{}");
        db.Attach(payment); db.Remove(payment);
        Assert.Throws<BarRuleException>(() => db.SaveChanges());
    }
}
