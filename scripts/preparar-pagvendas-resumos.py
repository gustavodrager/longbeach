#!/usr/bin/env python3
"""Converte capturas dos relatórios mensais visíveis do PagVendas, com conciliação de totais.
Entrada: JSON com URL, intervalo e capturas {month,text,rows}. Não acessa sessão ou API privada.
"""
import argparse,calendar,datetime as dt,hashlib,json,re
from decimal import Decimal
from pathlib import Path

def money(text):
    value=text.replace('R$','').replace('\u00a0','').replace(' ','').strip()
    if not re.fullmatch(r'-?\d+(?:\.\d{3})*,\d{2}',value):raise ValueError('Valor de relatório inválido.')
    return int(Decimal(value.replace('.','').replace(',','.'))*100)

def prepare(source,expected_total):
    raw=json.loads(source.read_text());records=[];sum_total=0;seen=set()
    if raw.get('url')!='https://pagvendas.pagseguro.uol.com.br/dashboard/relatorios/tipos-pagamentos':raise ValueError('Origem do relatório não reconhecida.')
    start=dt.date.fromisoformat(raw['rangeStart']);end=dt.date.fromisoformat(raw['rangeEnd'])
    for capture in raw['captures']:
        month=capture['month'];first=dt.date.fromisoformat(month+'-01');last=first.replace(day=calendar.monthrange(first.year,first.month)[1]);through=min(last,end)
        if month in seen or first<start or first>end:raise ValueError('Competência duplicada ou fora do intervalo.')
        seen.add(month)
        if first.strftime('%d/%m/%Y 00:00') not in capture['text'] or through.strftime('%d/%m/%Y 23:59') not in capture['text']:raise ValueError('Período exibido não confere com a competência.')
        rows=capture['rows']
        if len(rows)<3 or rows[0]!='Tipo de PagamentoValor Total' or not rows[-1].startswith('TotalR$'):raise ValueError('Relatório incompleto.')
        subtotal=0
        for index,row in enumerate(rows[1:-1],2):
            label,amount=row.split('R$',1);value=money(amount);subtotal+=value;cell=f'PagVendas {month}!linha{index}'
            state='Fiado na fonte' if label=='Fiado' else 'Parcial até '+through.strftime('%d/%m/%Y') if through<last else 'Venda informada no PagVendas'
            data={'entity':'financial-observation-v1','currency':'BRL','sourceCell':cell,'series':'pagvendas-vendas','metric':'vendas-informadas','label':label,'state':state,'periodStart':first.isoformat(),'periodEnd':last.isoformat(),'grain':'month','amountCents':value,'notes':'Relatório oficial por tipo de pagamento. Totais de vendas; não confirma liquidação bancária. '+raw['url']}
            records.append({'sheetName':month,'rowNumber':index,'recordType':'reference-data','externalId':'finance:'+cell,'data':data})
        if subtotal!=money(rows[-1].split('R$',1)[1]):raise ValueError('Subtotal da competência não confere.')
        sum_total+=subtotal
    cursor=start.replace(day=1)
    while cursor<=end:
        if cursor.strftime('%Y-%m') not in seen:raise ValueError('Competência faltante no intervalo.')
        cursor=(cursor.replace(day=28)+dt.timedelta(days=4)).replace(day=1)
    if sum_total!=expected_total:raise ValueError('Soma mensal diverge do relatório do intervalo completo.')
    return {'sourceName':f'pagvendas-resumos-mensais-{start:%Y-%m}-a-{end:%Y-%m}.json','sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'records':records}
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--total-centavos',type=int,required=True);a=p.parse_args();result=prepare(a.source,a.total_centavos);a.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');a.output.chmod(0o600);print(json.dumps({'records':len(result['records']),'sha256':result['sourceSha256']}))
