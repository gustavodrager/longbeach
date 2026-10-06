import importlib.util
from pathlib import Path
import tempfile
import unittest
from xml.sax.saxutils import escape
import zipfile

spec = importlib.util.spec_from_file_location('catalogo', Path(__file__).with_name('preparar-catalogo-pagvendas.py'))
catalogo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalogo)


class ExportValidationTests(unittest.TestCase):
    def package(self, rows, formula=False):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'catalogo-ficticio.xlsx'
            xml_rows = []
            for number, values in enumerate([catalogo.HEADERS, *rows], 1):
                cells = ''.join(f'<c r="{chr(65 + column)}{number}" t="inlineStr"><is><t>{escape(value)}</t></is>'
                    + ('<f>1+1</f>' if formula and number == 2 and column == 3 else '') + '</c>'
                    for column, value in enumerate(values))
                xml_rows.append(f'<row r="{number}">{cells}</row>')
            with zipfile.ZipFile(source, 'w') as workbook:
                namespace = catalogo.NS['x']
                workbook.writestr('xl/workbook.xml', f'<workbook xmlns="{namespace}"><sheets><sheet name="Sheet1"/></sheets></workbook>')
                workbook.writestr('xl/worksheets/sheet1.xml', f'<worksheet xmlns="{namespace}"><sheetData>{"".join(xml_rows)}</sheetData></worksheet>')
            return catalogo.prepare(source)

    def test_preserves_external_identity_provenance_and_exact_cents(self):
        package = self.package([['001', 'Água teste', '1.23', '5.49', '', '']])
        record = package['records'][0]
        self.assertEqual(('pagvendas:001', 2), (record['externalId'], record['rowNumber']))
        self.assertEqual((123, 549), (record['data']['preco_custo_centavos'], record['data']['preco_venda_centavos']))
        self.assertEqual(64, len(package['sourceSha256']))
        self.assertNotIn('estoque', record['data'])

    def test_rejects_subcent_negative_and_nonfinite_prices(self):
        for price in ('1.001', '-1', 'NaN', 'Infinity'):
            with self.subTest(price=price), self.assertRaises(ValueError):
                self.package([['1', 'Produto teste', '0', price, '', '']])

    def test_rejects_case_insensitive_duplicate_codes(self):
        with self.assertRaises(ValueError):
            self.package([['abc', 'Produto teste', '0', '1', '', ''], ['ABC', 'Outro teste', '0', '2', '', '']])

    def test_rejects_formulas_in_export(self):
        with self.assertRaises(ValueError):
            self.package([['1', 'Produto teste', '0', '2', '', '']], formula=True)


if __name__ == '__main__':
    unittest.main()
