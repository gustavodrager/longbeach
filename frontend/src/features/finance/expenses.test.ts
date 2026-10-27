import { parseExpenseMoney, teamPaymentBasis } from './expenses'

it('preserva centavos ao ler valores brasileiros e rejeita precisão ou valores inválidos', () => {
  expect(parseExpenseMoney('R$ 1.234,56')).toBe(1234.56)
  expect(parseExpenseMoney('1.234')).toBe(1234)
  expect(parseExpenseMoney('20.50')).toBe(20.5)
  expect(parseExpenseMoney('0,01')).toBe(0.01)
  for (const invalid of ['', '0', '-2', '1,234', '1.2.3', 'abc', '1000000000']) expect(parseExpenseMoney(invalid)).toBeNull()
})

it('deriva apenas as bases conhecidas do acordo e permite escolher nos acordos a combinar', () => {
  const person = { id: 'test', name: 'Pessoa', payAmount: 120, payBasis: 'Valor mensal', paymentFrequency: 'Mensal', paymentDay: '' }
  expect(teamPaymentBasis(person)).toBe('Monthly')
  expect(teamPaymentBasis({ ...person, payBasis: 'Por turno' })).toBe('Daily')
  expect(teamPaymentBasis({ ...person, payBasis: 'Por dia' })).toBe('Daily')
  expect(teamPaymentBasis({ ...person, payBasis: 'A combinar' })).toBeNull()
  expect(teamPaymentBasis({ ...person, payBasis: 'Mensal e por turno' })).toBeNull()
})
