import { describe, expect, it } from 'vitest'
import type { Account, Payment } from './api'
import { receiptText } from './receipt'

const account: Account = { id: 'account', kind: 'Bar', sourceId: 'tab', title: 'Comanda 20', total: 100, paid: 100, pending: 0, payable: 0, state: 'Closed', payments: [], recurringEligible: false, userId: 'owner' }
const payment: Payment = { id: 'payment', operationId: 'operation', method: 'Pix', amount: 100, state: 'Approved', refunded: 0, paidAtUtc: '2026-10-25T01:30:00Z', canResume: false }

describe('receiptText', () => {
  it('gera linhas legíveis e a data do pagamento no fuso de São Paulo', () => {
    const text = receiptText(account, payment)
    expect(text.split('\n')).toContain('Data: 24/10/2026, 22:30')
    expect(text.split('\n')).toContain('Situação na consulta: Pago')
    expect(text).not.toContain('\\n')
    expect(text).not.toContain('Estorno em confirmação:')
  })

  it.each([undefined, 'inválida'])('não confunde data de pagamento ausente ou inválida com vencimento: %s', paidAtUtc => {
    const text = receiptText(account, { ...payment, paidAtUtc })
    expect(text).toContain('Data: Não informada')
    expect(text).not.toContain('Sem vencimento')
  })

  it.each([{ refunded: 25, label: 'Estornado parcialmente' }, { refunded: 100, label: 'Estornado' }])('identifica o estorno confirmado de $refunded no status do comprovante', ({ refunded, label }) => {
    const text = receiptText(account, { ...payment, refunded }).replaceAll('\u00a0', ' ')
    expect(text).toContain(`Situação na consulta: ${label}`)
    expect(text).toContain(refunded === 100 ? 'Estornado: R$ 100,00' : 'Estornado: R$ 25,00')
  })

  it('separa o estorno em confirmação do valor já estornado', () => {
    const text = receiptText(account, { ...payment, refunded: 25, refundPending: 10 }).replaceAll('\u00a0', ' ')
    expect(text).toContain('Estornado: R$ 25,00')
    expect(text).toContain('Estorno em confirmação: R$ 10,00. Ainda não concluído.')
    expect(text).toContain('Situação na consulta: Estornado parcialmente')
  })

  it('não apresenta uma solicitação pendente como estorno concluído', () => {
    const text = receiptText(account, { ...payment, refundPending: 100 }).replaceAll('\u00a0', ' ')
    expect(text).toContain('Estornado: R$ 0,00')
    expect(text).toContain('Estorno em confirmação: R$ 100,00. Ainda não concluído.')
    expect(text).toContain('Situação na consulta: Pago')
  })
})
