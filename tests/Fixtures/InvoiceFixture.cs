using System.Text;
namespace LongBeach.Testing;
public static class InvoiceFixture
{
    public const string Recipient = "52247131000171";
    public static string Xml(int number = 1)
    {
        // Deliberately fictional test issuer, no real certificate or signature.
        var prefix = "3526101234567800019555001" + number.ToString("D9") + "112345678";
        var weight = 2; var sum = 0;
        for (var i = prefix.Length - 1; i >= 0; i--) { sum += (prefix[i] - '0') * weight; weight = weight == 9 ? 2 : weight + 1; }
        var digit = 11 - sum % 11; if (digit >= 10) digit = 0;
        var key = prefix + digit;
        return $"""
        <?xml version="1.0" encoding="utf-8"?>
        <nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
          <NFe><infNFe Id="NFe{key}" versao="4.00">
            <ide><cUF>35</cUF><cNF>12345678</cNF><mod>55</mod><serie>1</serie><nNF>{number}</nNF><dhEmi>2026-10-13T12:00:00-03:00</dhEmi><tpNF>1</tpNF><tpEmis>1</tpEmis><cDV>{digit}</cDV><tpAmb>2</tpAmb><finNFe>1</finNFe></ide>
            <emit><CNPJ>12345678000195</CNPJ><xNome>Fornecedor fictício de teste</xNome></emit>
            <dest><CNPJ>{Recipient}</CNPJ></dest>
            <det nItem="1"><prod><cProd>TEST-1</cProd><cEAN>SEM GTIN</cEAN><xProd>Água teste caixa com 12</xProd><uCom>CX</uCom><qCom>2.0000</qCom><vUnCom>24.0000000000</vUnCom><vProd>48.00</vProd><vFrete>4.00</vFrete><vDesc>2.00</vDesc><indTot>1</indTot></prod></det>
            <total><ICMSTot><vProd>48.00</vProd><vFrete>4.00</vFrete><vDesc>2.00</vDesc><vNF>50.00</vNF></ICMSTot></total>
          </infNFe></NFe>
          <protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><chNFe>{key}</chNFe><cStat>100</cStat></infProt></protNFe>
        </nfeProc>
        """;
    }
    public static byte[] Bytes(int number = 1) => Encoding.UTF8.GetBytes(Xml(number));
}
