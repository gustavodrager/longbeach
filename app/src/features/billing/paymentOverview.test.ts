import { describe, expect, it } from 'vitest'
import type { Account, Payment } from './api'
import { accountSituation, matchesPaymentSelection, paymentOverview } from './paymentOverview'

const payment: Payment = { id: 'payment', operationId: 'operation', method: 'Pix', amount: 100, refunded: 0, state: 'Approved', canResume: false }
const account: Account = { id: 'account', sourceId: 'source', title: 'Mensalidade de outubro', kind: 'Quadra', total: 100, paid: 0, payable: 100, pending: 0, state: 'Pendente', payments: [], userId: 'user', recurringEligible: false }

describe('paymentOverview', () => {
  it('usa os saldos da API sem somar pagamentos pendentes nem deduzir estornos duas vezes', () => {
    const accounts: Account[] = [
      { ...account, paid: 70, payable: 10, pending: 20, payments: [{ ...payment, refunded: 30, refundPending: 15 }, { ...payment, id: 'pending', amount: 20, state: 'Pending' }] },
      { ...account, id: 'canceled', paid: 0, payable: 0, payments: [{ ...payment, state: 'Canceled', amount: 300 }] },
      { ...account, id: 'refunded', paid: 0, payments: [{ ...payment, state: 'Refunded', refunded: 100 }] },
    ]
    expect(paymentOverview(accounts)).toEqual({ paid: 70, payable: 110, pending: 20, refundPending: 15 })
  })

  it('soma centavos sem resíduos de ponto flutuante', () => {
    expect(paymentOverview([{ ...account, paid: 0.1, payable: 0.2, pending: 0.1 }, { ...account, paid: 0.2, payable: 0.1, pending: 0.2 }])).toEqual({ paid: 0.3, payable: 0.3, pending: 0.3, refundPending: 0 })
  })

  it.each([
    [{ pending: 100, payable: 0, payments: [{ ...payment, state: 'Pending' }] }, 'Pagamento em confirmação'],
    [{ payments: [{ ...payment, state: 'Declined' }] }, 'Pagamento recusado'],
    [{ payments: [{ ...payment, state: 'Canceled' }] }, 'Pagamento cancelado'],
    [{ paid: 100, payable: 0, payments: [payment] }, 'Recebido'],
    [{ paid: 40, payable: 60, payments: [{ ...payment, amount: 40 }] }, 'Recebido parcialmente'],
    [{ paid: 100, payable: 0, payments: [], isLinked: false }, 'Pagamento informado no lançamento'],
    [{ paid: 100, payable: 0, payments: [{ ...payment, state: 'Canceled' }] }, 'Pagamento informado no lançamento'],
    [{ paid: 100, payable: 0, payments: [{ ...payment, refundPending: 20 }] }, 'Estorno em confirmação'],
    [{ paid: 80, payable: 20, payments: [{ ...payment, refunded: 20 }] }, 'Estornado parcialmente'],
    [{ payments: [{ ...payment, state: 'Refunded', refunded: 100 }] }, 'Estornado'],
    [{ state: 'Cancelado', payable: 0 }, 'Conta cancelada'],
  ])('identifica a situação de %j', (fields, expected) => {
    expect(accountSituation({ ...account, ...fields })).toBe(expected)
  })

  it('combina busca sem acentos, unidade e situação sem incluir valores de outra seleção', () => {
    expect(matchesPaymentSelection(account, 'due', 'Quadra', 'joao', 'João Silva')).toBe(true)
    expect(matchesPaymentSelection(account, 'due', 'Bar', 'joao', 'João Silva')).toBe(false)
    expect(matchesPaymentSelection(account, 'received', 'Quadra', '', 'João Silva')).toBe(false)
    expect(matchesPaymentSelection({ ...account, paid: 80, payments: [{ ...payment, refunded: 20 }] }, 'refunds', 'all', 'outubro', '')).toBe(true)
    expect(matchesPaymentSelection({ ...account, payments: [{ ...payment, state: 'Declined' }] }, 'unsuccessful', 'all', '', '')).toBe(true)
  })
})
