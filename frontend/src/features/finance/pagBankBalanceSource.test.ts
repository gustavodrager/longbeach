import { pagBankBalanceSource } from './pagBankBalanceSource'

const portal = { date: '2026-08-30', sourceName: 'PagBank-portal-autenticado-saldo-20260830231542.json', sourceCell: `pagbank-portal-manual-v1:${'a'.repeat(64)}:saldo` }

it('preserva a hora local de São Paulo mesmo perto da virada de dia', () => {
  expect(pagBankBalanceSource(portal).reference).toBe('Consultado no portal em 30/08/2026 às 23:15 · horário de São Paulo')
})

it.each([
  'PagBank-portal-autenticado-saldo-20260829231542.json',
  'PagBank-portal-autenticado-saldo-20260830241542.json',
  'PagBank-portal-autenticado-saldo-20260830236042.json',
  'PagBank-portal-autenticado-saldo-20260830231560.json',
  'PagBank-portal-autenticado-saldo-20260830231542.json.bak',
  null,
])('não inventa horário para uma origem inválida ou divergente: %s', sourceName => {
  expect(pagBankBalanceSource({ ...portal, sourceName }).reference).toBe('Consultado no portal em 30/08/2026 · horário não informado')
})

it('não aceita uma data inexistente normalizada pelo calendário', () => {
  expect(pagBankBalanceSource({ ...portal, date: '2026-02-30', sourceName: 'PagBank-portal-autenticado-saldo-20260230231542.json' }).reference).toBe('Data e horário da consulta não informados')
})

it.each([null, 'PDF!A2', `${portal.sourceCell}:extra`])('nome de arquivo sozinho não atribui origem ao portal: %s', sourceCell => {
  const source = pagBankBalanceSource({ ...portal, sourceCell })
  expect(source.label).toBe('Saldo da conta PagBank · extrato importado')
  expect(source.reference).toBe('Saldo informado em 30/08/2026')
})
