/// <reference types="node" />
import { webcrypto } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prepareBankStatement } from './bankStatementImport'
const bytes = (value: string) => new TextEncoder().encode(value)
const ofx = (changes = '') => `<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL<BANKACCTFROM><BANKID>000<ACCTID>0012345</BANKACCTFROM><BANKTRANLIST><STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261025013000[-3:BRT]<TRNAMT>100.25<FITID>pix-1<MEMO>Pix recebido</STMTTRN><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261025<TRNAMT>-10.20<FITID>saida-2<MEMO>Pagamento</STMTTRN>${changes}</BANKTRANLIST><LEDGERBAL><BALAMT>90.05<DTASOF>20261025</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`
beforeEach(() => vi.stubGlobal('crypto', webcrypto))

describe('preparação de extratos', () => {
  it.each(['c6', 'pagbank'] as const)('lê OFX %s sem consultar provedor, com sinal e saldo datado separados', async bank => {
    const result = await prepareBankStatement({ name: 'extrato.ofx', bytes: bytes(ofx()), bank })
    expect(result.sourceSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(result.records.map(row => [row.data.series, row.data.metric, row.data.amountCents, row.data.periodStart])).toEqual([
      [`${bank}-conta`, 'entradas-extrato', 10025, '2026-10-25'], [`${bank}-conta`, 'saidas-extrato', -1020, '2026-10-25'], ['saldos', bank === 'c6' ? 'Saldo C6' : 'Saldo Pagbank', 9005, '2026-10-25'],
    ])
    expect(result.records.every(row => row.externalId === `finance:${row.data.sourceCell}` && row.recordType === 'reference-data')).toBe(true)
  })
  it('mantém a identidade da transação entre OFX e CSV da mesma conta, preservando zeros', async () => {
    const original = await prepareBankStatement({ name: 'a.ofx', bytes: bytes(ofx()), bank: 'c6' })
    const csv = await prepareBankStatement({ name: 'b.csv', bytes: bytes('Data;Descrição;Valor;ID;Saldo\n25/10/2026;Pix recebido;100,25;pix-1;90,05'), bank: 'c6', account: '0012345' })
    expect(csv.records[0].data).toEqual(original.records[0].data)
    expect(csv.records[1].data).toEqual(original.records[2].data)
    const other = await prepareBankStatement({ name: 'b.csv', bytes: bytes('Data;Valor;ID\n25/10/2026;100,25;pix-1'), bank: 'c6', account: '12345' })
    expect(other.records[0].data.sourceCell).not.toBe(original.records[0].data.sourceCell)
  })
  it('lê CSV entre aspas, descrição multilinha e valores em centavos sem somar saldos', async () => {
    const result = await prepareBankStatement({ name: 'extrato.csv', bank: 'pagbank', account: '123', bytes: bytes('Data;Descrição;Valor;ID;Saldo\r\n24/10/2026;"Compra; loja\nsegunda linha";"-1.234,56";a;\r\n25/10/2026;Pix;0,10;b;100,00') })
    expect(result.records.map(row => row.data.amountCents)).toEqual([-123456, 10, 10000])
    expect(result.records[0].data.label).toBe('Compra; loja\nsegunda linha')
  })
  it('importa um arquivo só de saldo inclusive zero ou negativo sem inventar movimentos', async () => {
    const result = await prepareBankStatement({ name: 'saldo.csv', bank: 'c6', account: '123', bytes: bytes('Data;Saldo\n24/10/2026;0,00\n25/10/2026;-10,00') })
    expect(result.records.every(row => row.data.grain === 'snapshot')).toBe(true)
    expect(result.records.map(row => row.data.amountCents)).toEqual([0, -1000])
  })
  it('deduplica IDs iguais dentro do arquivo e recusa interpretações diferentes', async () => {
    const input = { name: 'extrato.csv', bank: 'c6' as const, account: '123' }
    const row = '25/10/2026;10,00;id-a'
    expect((await prepareBankStatement({ ...input, bytes: bytes(`Data;Valor;ID\n${row}\n${row}`) })).records).toHaveLength(1)
    await expect(prepareBankStatement({ ...input, bytes: bytes(`Data;Valor;ID\n${row}\n25/10/2026;11,00;id-a`) })).rejects.toThrow('valores diferentes')
    await expect(prepareBankStatement({ ...input, bytes: bytes('Data;Saldo\n25/10/2026;10,00\n25/10/2026;11,00') })).rejects.toThrow('uma única posição')
  })
  it.each([
    ['Data;Valor;ID\n31/02/2026;1,00;a', 'Data inválida'],
    ['Data;Valor;ID\n20261025not-a-date;1,00;a', 'Data inválida'],
    ['Data;Valor;ID\n25/10/2026;0,00;a', 'valor zero'],
    ['Data;Valor;ID\n25/10/2026;1.234;a', 'ambíguo'],
    ['Data;Valor\n25/10/2026;1,00', 'ID da transação'],
    ['Data;Valor;ID\n25/10/2026;1,00', 'colunas'],
    ['Data;Valor;Valor\n25/10/2026;1,00;2,00', 'colunas duplicadas'],
  ])('recusa CSV inválido antes de enviar: %s', async (text, message) => {
    await expect(prepareBankStatement({ name: 'a.csv', bytes: bytes(text), bank: 'c6', account: '123' })).rejects.toThrow(message)
  })
  it('recusa OFX sem BRL/ID/conta, múltiplas contas, tipo incorreto e excesso de tamanho', async () => {
    const input = { name: 'a.ofx', bank: 'pagbank' as const }
    for (const text of [ofx().replace('BRL', 'USD'), ofx().replace('<FITID>pix-1', ''), ofx().replace('<ACCTID>0012345', ''), ofx() + ofx()]) await expect(prepareBankStatement({ ...input, bytes: bytes(text) })).rejects.toThrow()
    await expect(prepareBankStatement({ ...input, name: 'a.pdf', bytes: bytes('pdf') })).rejects.toThrow('OFX ou CSV')
    await expect(prepareBankStatement({ ...input, bytes: new Uint8Array(5_000_001) })).rejects.toThrow('5 MB')
  })
  it('recusa OFX truncado em vez de descartar movimentos ou escolher um saldo entre vários', async () => {
    const input = { name: 'a.ofx', bank: 'pagbank' as const }
    await expect(prepareBankStatement({ ...input, bytes: bytes(ofx().replace('</STMTTRN>', '')) })).rejects.toThrow('transações incompletas')
    await expect(prepareBankStatement({ ...input, bytes: bytes(ofx().replace('</LEDGERBAL>', '')) })).rejects.toThrow('saldo completa')
    await expect(prepareBankStatement({ ...input, bytes: bytes(ofx().replace('</STMTRS>', '<LEDGERBAL><BALAMT>1.00<DTASOF>20261025</LEDGERBAL></STMTRS>')) })).rejects.toThrow('única posição')
  })
})
