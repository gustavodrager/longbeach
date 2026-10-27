using System.Text;
using LongBeach.Application.Fiscal;
using LongBeach.Testing;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
namespace LongBeach.UnitTests;
public sealed class InvoiceXmlReaderTests
{
    [Fact]
    public void Reads_items_totals_identity_and_offset_without_claiming_online_verification()
    {
        var data = InvoiceXmlReader.Read(InvoiceFixture.Bytes(), InvoiceFixture.Recipient, 2);
        Assert.Equal(50, data.Total); Assert.Equal(48, data.ProductsTotal); Assert.Equal(4, data.Freight); Assert.Equal(2, data.Discount);
        Assert.Equal(DateTimeOffset.Parse("2026-10-13T15:00:00Z"), data.IssuedAt);
        Assert.True(data.CanCreatePurchase); Assert.Empty(data.Warnings);
        Assert.Equal(2, data.Items[0].Quantity); Assert.Equal("CX", data.Items[0].Unit); Assert.Null(data.Items[0].Barcode);
    }
    [Theory]
    [InlineData("<mod>55</mod>", "<mod>65</mod>")]
    [InlineData("<CNPJ>52247131000171</CNPJ>", "<CNPJ>11111111000191</CNPJ>")]
    [InlineData("<cStat>100</cStat>", "<cStat>101</cStat>")]
    [InlineData("<tpAmb>2</tpAmb>", "<tpAmb>1</tpAmb>")]
    [InlineData("<serie>1</serie>", "<serie>2</serie>")]
    [InlineData("<qCom>2.0000</qCom>", "<qCom>-2</qCom>")]
    [InlineData("<qCom>2.0000</qCom>", "<qCom>2,00</qCom>")]
    [InlineData("<vProd>48.00</vProd>", "<vProd>48.001</vProd>")]
    [InlineData("<dest>", "<dest><CNPJ>52247131000171</CNPJ>")]
    [InlineData("2026-10-13T12:00:00-03:00", "2026-10-13T12:00:00")]
    public void Rejects_wrong_document_or_inconsistent_identity(string before, string after) =>
        Assert.Throws<InvoiceRuleException>(() => InvoiceXmlReader.Read(Encoding.UTF8.GetBytes(InvoiceFixture.Xml().Replace(before, after)), InvoiceFixture.Recipient, 2));
    [Fact]
    public void Rejects_external_entities_large_files_and_missing_protocol()
    {
        Assert.Throws<InvoiceRuleException>(() => InvoiceXmlReader.Read(Encoding.UTF8.GetBytes("<!DOCTYPE nfeProc [<!ENTITY x SYSTEM 'file:///etc/passwd'>]><nfeProc>&x;</nfeProc>"), InvoiceFixture.Recipient, 2));
        Assert.Throws<InvoiceRuleException>(() => InvoiceXmlReader.Read(new byte[InvoiceXmlReader.MaximumBytes + 1], InvoiceFixture.Recipient, 2));
        Assert.Throws<InvoiceRuleException>(() => InvoiceXmlReader.Read(Encoding.UTF8.GetBytes("<NFe/>"), InvoiceFixture.Recipient, 2));
    }
    [Theory]
    [InlineData("<vNF>50.00</vNF>", "<vNF>51.00</vNF>")]
    [InlineData("<vUnCom>24.0000000000</vUnCom>", "<vUnCom>20.00</vUnCom>")]
    [InlineData("<indTot>1</indTot>", "<indTot>0</indTot>")]
    [InlineData("<finNFe>1</finNFe>", "<finNFe>4</finNFe>")]
    [InlineData("</ICMSTot>", "<vIPI>5.00</vIPI></ICMSTot>")]
    public void Preserves_special_notes_but_blocks_purchase_generation(string before, string after)
    {
        var data = InvoiceXmlReader.Read(Encoding.UTF8.GetBytes(InvoiceFixture.Xml().Replace(before, after)), InvoiceFixture.Recipient, 2);
        Assert.False(data.CanCreatePurchase); Assert.NotEmpty(data.Warnings);
    }
    [Fact]
    public void Migration_and_snapshot_include_unique_key_and_document_protection()
    {
        using var db = new LongBeachDbContext(new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql("Host=localhost;Database=unused").Options, TimeProvider.System);
        Assert.False(db.Database.HasPendingModelChanges());
        var sql = db.GetService<IMigrator>().GenerateScript();
        Assert.Contains("received_invoices", sql); Assert.Contains("IX_received_invoices_AccessKey", sql);
        Assert.Contains("invoice_immutable_document", sql);
    }
}
