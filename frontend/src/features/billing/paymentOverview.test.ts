import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Account, Payment } from './api'
import { accountSituation, isOverdue, matchesPaymentSelection, paymentOverview, sortPaymentAccounts } from './paymentOverview'

const payment: Payment = { id: 'payment', operationId: 'operation', method: 'Pix', amount: 100, refunded: 0, state: 'Approved', canResume: false }
const account: Account = { id: 'account', sourceId: 'source', title: 'Mensalidade de outubro', kind: 'Quadra', total: 100, paid: 0, payable: 100, pending: 0, state: 'Pendente', payments: [], userId: 'user', recurringEligible: false }

describe('paymentOverview', () => {
  afterEach(() => vi.useRealTimers())
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

  it('considera vencido somente o saldo exigível antes de hoje em São Paulo', () => {
    const beforeMidnight = new Date('2026-10-25T02:59:00Z')
    const afterMidnight = new Date('2026-10-25T03:00:00Z')
    const due = { ...account, dueDate: '2026-10-24' }
    expect(isOverdue(due, beforeMidnight)).toBe(false)
    expect(isOverdue(due, afterMidnight)).toBe(true)
    expect(isOverdue({ ...due, paid: 100, payable: 0 }, afterMidnight)).toBe(false)
    expect(isOverdue({ ...due, state: 'Canceled' }, afterMidnight)).toBe(false)
    expect(isOverdue({ ...due, dueDate: '2026-10-26' }, afterMidnight)).toBe(false)
    expect(isOverdue({ ...due, dueDate: '2026-02-31' }, afterMidnight)).toBe(false)
    expect(isOverdue({ ...due, dueDate: undefined }, afterMidnight)).toBe(false)
    vi.useFakeTimers()
    vi.setSystemTime(afterMidnight)
    expect(matchesPaymentSelection(due, 'overdue', 'Quadra', '', '')).toBe(true)
    expect(matchesPaymentSelection(due, 'overdue', 'Bar', '', '')).toBe(false)
  })

  it('prioriza confirmação, vencidos e próximos vencimentos sem alterar a lista original', () => {
    const accounts: Account[] = [
      { ...account, id: 'empty', payable: 0 },
      { ...account, id: 'received-old', payable: 0, paid: 100, payments: [{ ...payment, paidAtUtc: '2026-10-23T15:00:00Z' }] },
      { ...account, id: 'future', dueDate: '2026-11-01' },
      { ...account, id: 'overdue-later', dueDate: '2026-10-23' },
      { ...account, id: 'received-new', payable: 0, paid: 100, payments: [{ ...payment, paidAtUtc: '2026-10-24T15:00:00Z' }] },
      { ...account, id: 'undated' },
      { ...account, id: 'pending', payable: 0, pending: 100, payments: [{ ...payment, state: 'Pending' }] },
      { ...account, id: 'overdue-first', dueDate: '2026-10-22' },
      { ...account, id: 'today', dueDate: '2026-10-25' },
    ]
    const original = accounts.map(value => value.id)
    expect(sortPaymentAccounts(accounts, new Date('2026-10-25T12:00:00Z')).map(value => value.id)).toEqual([
      'pending', 'overdue-first', 'overdue-later', 'today', 'future', 'undated', 'received-new', 'received-old', 'empty',
    ])
    expect(accounts.map(value => value.id)).toEqual(original)
  })

  it('mantém estorno pendente em destaque e tolera datas de pagamento ausentes ou inválidas', () => {
    const accounts = [
      { ...account, id: 'paid', payable: 0, paid: 100, payments: [{ ...payment, paidAtUtc: 'inválida' }] },
      { ...account, id: 'refund-pending', payable: 0, paid: 100, payments: [{ ...payment, refundPending: 20 }] },
    ]
    expect(sortPaymentAccounts(accounts).map(value => value.id)).toEqual(['refund-pending', 'paid'])
  })
})
