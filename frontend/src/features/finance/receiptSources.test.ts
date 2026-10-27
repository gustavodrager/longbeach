import { receiptError, receiptUnit } from './receiptSources'

it('atribui vendas da maquininha e PagVendas ao Bar e Pix de serviços à Quadra', () => {
  expect(receiptUnit('PagBankTerminal')).toBe('bar')
  expect(receiptUnit('PagVendas')).toBe('bar')
  expect(receiptUnit('CourtPix')).toBe('quadra')
  expect(receiptUnit('Pix')).toBeUndefined()
  expect(receiptUnit('PagBank')).toBeUndefined()
})
it.each(['PagBank', 'C6'] as const)('registra Pix de serviço da Quadra na conta %s sem confirmar pagamento', receivingAccount => {
  expect(receiptError({ direction: 'Receber', origin: 'Escola', receiptSource: 'CourtPix', receivingAccount })).toBeNull()
})
it('exige conta no Pix da Quadra e rejeita origem contraditória ou metadados em despesa', () => {
  expect(receiptError({ direction: 'Receber', origin: 'Escola', receiptSource: 'CourtPix' })).toBeTruthy()
  expect(receiptError({ direction: 'Receber', origin: 'Escola', receiptSource: 'PagVendas' })).toBeTruthy()
  expect(receiptError({ direction: 'Receber', origin: 'Bar', receiptSource: 'CourtPix', receivingAccount: 'PagBank' })).toBeTruthy()
  expect(receiptError({ direction: 'Pagar', origin: 'Bar', receivingAccount: 'PagBank' })).toBeTruthy()
})
it('conta bancária sem origem não determina unidade e registros anteriores continuam válidos', () => {
  expect(receiptError({ direction: 'Receber', origin: 'Arena', receivingAccount: 'C6' })).toBeNull()
  expect(receiptError({ direction: 'Receber', origin: 'Arena' })).toBeNull()
})
