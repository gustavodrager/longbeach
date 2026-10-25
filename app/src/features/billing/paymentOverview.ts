import type { Account } from './api'

export type PaymentSituation = 'all' | 'due' | 'pending' | 'received' | 'refunds' | 'unsuccessful'
export type PaymentUnit = 'all' | Account['kind']

const cents = (amount: number) => Math.round((amount + Number.EPSILON) * 100)
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
const canceled = (account: Account) => ['Canceled', 'Cancelado', 'Cancelled'].includes(account.state)
export const pendingRefund = (account: Account) => account.payments.reduce((sum, payment) => sum + cents(payment.refundPending ?? 0), 0) / 100
export const confirmedRefund = (account: Account) => account.payments.reduce((sum, payment) => sum + cents(payment.refunded), 0) / 100
export const paymentInSource = (account: Account) => account.kind === 'Quadra' && account.paid > 0 && account.payments.every(payment => payment.state === 'Canceled')

export function accountSituation(account: Account) {
  if (pendingRefund(account) > 0) return 'Estorno em confirmação'
  if (account.pending > 0 || account.payments.some(payment => payment.state === 'Pending')) return 'Pagamento em confirmação'
  if (canceled(account)) return 'Conta cancelada'
  if (paymentInSource(account)) return 'Pagamento informado no lançamento'
  const refunded = confirmedRefund(account)
  if (refunded > 0) return account.paid > 0 ? 'Estornado parcialmente' : 'Estornado'
  if (account.payable > 0 && account.payments[0]?.state === 'Declined') return 'Pagamento recusado'
  if (account.payable > 0 && account.payments[0]?.state === 'Canceled') return 'Pagamento cancelado'
  if (account.payable > 0) return account.paid > 0 ? 'Recebido parcialmente' : 'A receber'
  return account.paid > 0 ? 'Recebido' : 'Sem valor a receber'
}

export function matchesPaymentSelection(account: Account, situation: PaymentSituation, unit: PaymentUnit, search: string, responsible: string) {
  if (unit !== 'all' && account.kind !== unit) return false
  const match = situation === 'all'
    || situation === 'due' && account.payable > 0
    || situation === 'pending' && (account.pending > 0 || pendingRefund(account) > 0 || account.payments.some(payment => payment.state === 'Pending'))
    || situation === 'received' && account.paid > 0
    || situation === 'refunds' && (confirmedRefund(account) > 0 || pendingRefund(account) > 0)
    || situation === 'unsuccessful' && (canceled(account) || ['Declined', 'Canceled'].includes(account.payments[0]?.state))
  return match && normalize([account.title, responsible, account.id, account.sourceId, account.kind, accountSituation(account)].join(' ')).includes(normalize(search.trim()))
}

export function paymentOverview(accounts: Account[]) {
  // Paid is the API's recorded receipt (net of confirmed refunds), including
  // amounts recorded directly on a court entry. It does not prove settlement
  // with a provider. Pending refunds must not be deducted a second time.
  const totals = accounts.reduce((sum, account) => ({
    paid: sum.paid + cents(account.paid),
    payable: sum.payable + cents(account.payable),
    pending: sum.pending + cents(account.pending),
    refundPending: sum.refundPending + cents(pendingRefund(account)),
  }), { paid: 0, payable: 0, pending: 0, refundPending: 0 })
  return { paid: totals.paid / 100, payable: totals.payable / 100, pending: totals.pending / 100, refundPending: totals.refundPending / 100 }
}
