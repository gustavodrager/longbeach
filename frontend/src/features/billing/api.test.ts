import { describe, expect, it } from 'vitest'
import { date, paymentDate, paymentStateLabel } from './api'

describe('paymentDate', () => {
  it('exibe o instante no dia e horário de São Paulo ao atravessar a meia-noite UTC', () => {
    expect(paymentDate('2026-10-25T01:30:00Z')).toBe('24/10/2026, 22:30')
    expect(paymentDate('2026-10-25T03:30:00Z')).toBe('25/10/2026, 00:30')
    expect(paymentDate('2026-10-24T22:30:00-03:00')).toBe('24/10/2026, 22:30')
  })

  it.each([undefined, null, '', ' ', 'inválida'])('identifica uma data de pagamento ausente ou inválida: %s', value => {
    expect(paymentDate(value)).toBe('Não informada')
  })

  it('preserva a data civil do vencimento', () => {
    expect(date('2026-10-25')).toBe('25/10/2026')
    expect(date()).toBe('Sem vencimento')
  })
})

describe('paymentStateLabel', () => {
  it('distingue estorno parcial e total mesmo quando o pagamento do Bar permanece aprovado', () => {
    expect(paymentStateLabel({ state: 'Approved', amount: 100, refunded: 25 })).toBe('Estornado parcialmente')
    expect(paymentStateLabel({ state: 'Approved', amount: 100, refunded: 100 })).toBe('Estornado')
    expect(paymentStateLabel({ state: 'Refunded', amount: 100, refunded: 100 })).toBe('Estornado')
  })

  it('mantém a situação de pagamentos sem estorno confirmado', () => {
    expect(paymentStateLabel({ state: 'Approved', amount: 100, refunded: 0 })).toBe('Pago')
    expect(paymentStateLabel({ state: 'Pending', amount: 100, refunded: 0 })).toBe('Aguardando confirmação')
    expect(paymentStateLabel({ state: 'Declined', amount: 100, refunded: 0 })).toBe('Recusado')
  })
})
