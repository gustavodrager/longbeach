#!/usr/bin/env python3
"""Converte a exportação XLSX PagVendas em lote de staging Long Beach, sem importar saldos."""
import argparse
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zipfile

NS = {'x': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
HEADERS = ['Código', 'Descrição', 'Preço de Custo', 'Preço de Venda', 'Categoria', 'Código de Barras']


def cents(value):
    amount = Decimal(value or '0')
    if not amount.is_finite() or amount < 0 or amount > 99999999 or amount * 100 != (amount * 100).to_integral_value():
        raise ValueError('Preço inválido: informe valor positivo com até duas casas decimais.')
    return int(amount * 100)


def prepare(source):
    records, codes = [], set()
    with zipfile.ZipFile(source) as workbook:
        sheets = ET.fromstring(workbook.read('xl/workbook.xml')).findall('x:sheets/x:sheet', NS)
        if len(sheets) != 1 or sheets[0].get('name') != 'Sheet1':
            raise ValueError('Esperada a exportação PagVendas com uma única aba Sheet1.')
        strings = []
        if 'xl/sharedStrings.xml' in workbook.namelist():
            strings = [''.join(item.itertext()) for item in ET.fromstring(workbook.read('xl/sharedStrings.xml'))]
        sheet = ET.fromstring(workbook.read('xl/worksheets/sheet1.xml'))
        for index, row in enumerate(sheet.findall('x:sheetData/x:row', NS)):
            values = [''] * 6
            for cell in row.findall('x:c', NS):
                if cell.find('x:f', NS) is not None:
                    raise ValueError('A exportação deve conter valores, sem fórmulas.')
                match = re.fullmatch(r'([A-F])\d+', cell.get('r', ''))
                if not match:
                    raise ValueError('Coluna inesperada na exportação.')
                value = cell.findtext('x:v', default='', namespaces=NS)
                if cell.get('t') == 's': value = strings[int(value)]
                if cell.get('t') == 'inlineStr': value = ''.join(cell.find('x:is', NS).itertext())
                values[ord(match[1]) - ord('A')] = value
            if index == 0:
                if values != HEADERS: raise ValueError('Cabeçalho PagVendas não reconhecido.')
                continue
            if not any(values): continue
            code, name, cost, price, category, barcode = values
            if not re.fullmatch(r'[A-Za-z0-9._-]{1,37}', code) or code.upper() in codes:
                raise ValueError('Código ausente, inválido ou duplicado.')
            codes.add(code.upper())
            if not name.strip() or len(name.strip()) > 160 or len(category.strip()) > 100 or len(barcode.strip()) > 80:
                raise ValueError('Nome, categoria ou código de barras inválido.')
            records.append({'sheetName': 'Sheet1', 'rowNumber': int(row.get('r')), 'recordType': 'reference-data',
                'externalId': 'pagvendas:' + code, 'data': {'entity': 'bar-product', 'source': 'PagVendas - Long Beach Arena Ltda',
                'currency': 'BRL', 'codigo_pagvendas': code, 'nome': name, 'preco_custo_centavos': cents(cost),
                'preco_venda_centavos': cents(price), 'categoria': category or None, 'codigo_barras': barcode or None}})
    if not 1 <= len(records) <= 2000: raise ValueError('A exportação deve conter entre 1 e 2000 produtos.')
    return {'sourceName': source.name, 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'records': records}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    package = prepare(args.source)
    args.output.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'linhas': len(package['records']), 'sha256': package['sourceSha256']}))
