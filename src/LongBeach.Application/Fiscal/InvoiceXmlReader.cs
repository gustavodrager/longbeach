using System.Globalization;
using System.Xml;
using System.Xml.Linq;
using LongBeach.Contracts.Fiscal;

namespace LongBeach.Application.Fiscal;

// Local inspection of a supplied file. No claim of SEFAZ consultation or signature verification.
public static class InvoiceXmlReader
{
    public const int MaximumBytes = 2 * 1024 * 1024;
    private static readonly XNamespace N = "http://www.portalfiscal.inf.br/nfe";
    public static InvoiceData Read(byte[] bytes, string recipient, int environment)
    {
        if (bytes.Length is 0 or > MaximumBytes) throw Error("Envie um XML de até 2 MB.");
        try
        {
            using var stream = new MemoryStream(bytes);
            using var reader = XmlReader.Create(stream, new XmlReaderSettings
            { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null, MaxCharactersInDocument = MaximumBytes });
            var document = XDocument.Load(reader);
            var root = document.Root;
            if (root?.Name != N + "nfeProc" || (string?)root.Attribute("versao") != "4.00")
                throw Error("Envie o XML processado da NF-e 4.00 (nfeProc), com o protocolo de autorização. PDF, NFC-e e NFS-e não são aceitos.");
            var info = One(One(root, "NFe"), "infNFe");
            var protocol = One(One(root, "protNFe"), "infProt");
            var ide = One(info, "ide"); var emit = One(info, "emit"); var dest = One(info, "dest");
            var key = Text(protocol, "chNFe", 44);
            if (!ValidKey(key) || (string?)info.Attribute("Id") != "NFe" + key || (string?)info.Attribute("versao") != "4.00")
                throw Error("Chave de acesso inválida ou diferente entre a nota e o protocolo.");
            if (Text(ide, "mod") != "55" || key.Substring(20, 2) != "55") throw Error("Esta importação aceita somente NF-e de mercadorias, modelo 55.");
            if (Text(protocol, "cStat") is not ("100" or "150")) throw Error("O arquivo não contém protocolo de autorização aceito.");
            if (Text(ide, "tpAmb") != environment.ToString() || Text(protocol, "tpAmb") != environment.ToString())
                throw Error("O ambiente da nota não corresponde ao ambiente fiscal configurado.");
            if (Text(dest, "CNPJ") != recipient) throw Error("A nota não foi emitida para o CNPJ da Arena configurado neste ambiente.");
            var taxId = emit.Element(N + "CNPJ")?.Value ?? emit.Element(N + "CPF")?.Value ?? "";
            if (taxId.Length is not (11 or 14) || taxId.Any(c => !char.IsAsciiLetterOrDigit(c))) throw Error("Documento do fornecedor inválido.");
            var number = Text(ide, "nNF", 9); var series = Text(ide, "serie", 3);
            if (!number.All(char.IsAsciiDigit) || !series.All(char.IsAsciiDigit)
                || key.Substring(6, 14) != taxId.PadLeft(14, '0') || key.Substring(22, 3) != series.PadLeft(3, '0')
                || key.Substring(25, 9) != number.PadLeft(9, '0')) throw Error("Emitente, série ou número não correspondem à chave da nota.");
            var issuedText = Text(ide, "dhEmi", 40);
            if (!DateTimeOffset.TryParse(issuedText, CultureInfo.InvariantCulture, DateTimeStyles.None, out var issued)
                || !(issuedText.EndsWith('Z') || System.Text.RegularExpressions.Regex.IsMatch(issuedText, @"[+-]\d{2}:\d{2}$")))
                throw Error("Data de emissão inválida ou sem fuso horário.");
            if (key.Substring(2, 4) != issued.ToString("yyMM", CultureInfo.InvariantCulture)
                || key[..2] != Text(ide, "cUF") || key.Substring(34, 1) != Text(ide, "tpEmis")
                || key.Substring(35, 8) != Text(ide, "cNF") || key[^1..] != Text(ide, "cDV"))
                throw Error("Os dados de identificação não correspondem à chave da nota.");
            var lines = new List<InvoiceLine>(); var warnings = new List<string>();
            foreach (var det in info.Elements(N + "det"))
            {
                if (!int.TryParse((string?)det.Attribute("nItem"), out var n) || n < 1 || lines.Any(x => x.Number == n)) throw Error("Numeração dos itens inválida ou repetida.");
                var prod = One(det, "prod");
                var qty = Amount(prod, "qCom", 4); var price = Amount(prod, "vUnCom", 10); var total = Amount(prod, "vProd", 2);
                if (qty <= 0) throw Error("Quantidade inválida na nota.");
                if (Math.Abs(decimal.Round(qty * price, 2, MidpointRounding.AwayFromZero) - total) > 0.01m)
                    warnings.Add($"Item {n}: total diferente da quantidade multiplicada pelo valor unitário.");
                if (Text(prod, "indTot") != "1") warnings.Add($"Item {n}: não compõe o total de produtos; exige tratamento específico.");
                var barcode = prod.Element(N + "cEAN")?.Value;
                lines.Add(new(n, Text(prod, "cProd", 60), Text(prod, "xProd", 120), Text(prod, "uCom", 6), qty, price,
                    total, Optional(prod, "vDesc"), Optional(prod, "vFrete"), barcode == "SEM GTIN" ? null : barcode));
            }
            if (lines.Count is 0 or > 990) throw Error("A nota deve conter entre 1 e 990 itens.");
            var totals = One(One(info, "total"), "ICMSTot");
            var products = Amount(totals, "vProd", 2); var freight = Amount(totals, "vFrete", 2);
            var discount = Amount(totals, "vDesc", 2); var invoiceTotal = Amount(totals, "vNF", 2);
            if (lines.Sum(x => x.Total) != products || lines.Sum(x => x.Freight) != freight || lines.Sum(x => x.Discount) != discount)
                warnings.Add("Os totais dos itens diferem dos totais declarados na nota.");
            if (products + freight - discount != invoiceTotal || new[] { "vSeg", "vOutro", "vII", "vIPI", "vIPIDevol", "vST", "vFCPST" }.Any(x => Optional(totals, x) != 0)
                || info.Element(N + "total")?.Element(N + "vNFTot") is not null)
                warnings.Add("A composição fiscal exige conferência específica antes de gerar uma compra neste fluxo.");
            if (Text(ide, "finNFe") != "1" || Text(ide, "tpNF") != "1") warnings.Add("Esta nota não representa uma saída normal do fornecedor; confira a natureza da operação.");
            if (lines.Count > 1 && (freight != 0 || discount != 0)) warnings.Add("Frete ou desconto por item em nota com vários produtos exige rateio específico; confira antes de gerar a compra.");
            if (lines.Count > 100) warnings.Add("O fluxo de compras aceita até 100 itens por compra.");
            return new(key, number, series, taxId, Text(emit, "xNome", 160), recipient, issued.ToUniversalTime(), environment,
                products, freight, discount, invoiceTotal, lines, warnings, warnings.Count == 0);
        }
        catch (Exception e) when (e is XmlException or InvalidOperationException or OverflowException or FormatException)
        { throw Error("XML inválido. Confira o arquivo original da NF-e e seus campos obrigatórios."); }
    }
    public static bool ValidKey(string key)
    {
        if (key.Length != 44 || key.Any(c => !char.IsAsciiLetterOrDigit(c))) return false;
        // Alphanumeric issuer positions use the ASCII-48 weight defined for CNPJ; other fields stay numeric.
        if (key.Where((_, i) => i < 6 || i >= 20).Any(c => !char.IsAsciiDigit(c))) return false;
        var sum = 0; var weight = 2;
        for (var i = 42; i >= 0; i--) { sum += (key[i] - '0') * weight; weight = weight == 9 ? 2 : weight + 1; }
        var digit = 11 - sum % 11; if (digit >= 10) digit = 0;
        return key[43] - '0' == digit;
    }
    private static XElement One(XElement e, string name) => e.Elements(N + name).SingleOrDefault() ?? throw Error($"Campo obrigatório ausente: {name}.");
    private static string Text(XElement e, string name, int max = 60)
    { var value = One(e, name).Value.Trim(); if (value.Length == 0 || value.Length > max) throw Error($"Campo inválido: {name}."); return value; }
    private static decimal Amount(XElement e, string name, int places)
    {
        var text = Text(e, name, 30);
        if (!System.Text.RegularExpressions.Regex.IsMatch(text, @"^\d+(\.\d+)?$")
            || !decimal.TryParse(text, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var value)
            || value < 0 || value > 99999999m || decimal.Round(value, places) != value) throw Error($"Valor inválido: {name}.");
        return value;
    }
    private static decimal Optional(XElement e, string name) => e.Element(N + name) is null ? 0 : Amount(e, name, 2);
    private static InvoiceRuleException Error(string message) => new(message);
}
