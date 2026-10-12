import { type Account, type Payment, date, stateLabel } from './api'
import { money, paymentLabels } from '../attendance/api'
export function receiptText(account: Account, payment: Payment) {
  return ['LONG BEACH ARENA — COMPROVANTE DE PAGAMENTO', account.title, `Origem: ${account.kind}`, account.competence ? `Competência: ${account.competence}` : '', `Conta: ${account.id}`, `Pagamento: ${payment.id}`, `Data: ${date(payment.paidAtUtc)}`, `Meio: ${paymentLabels[payment.method] ?? (payment.method === 'Subscription' ? 'Mensalidade automática' : payment.method)}`, `Valor: ${money(payment.amount)}`, `Estornado: ${money(payment.refunded)}`, `Situação na consulta: ${stateLabel(payment.state)}`, 'Comprovante de recebimento. Não substitui documento fiscal.'].filter(Boolean).join('\n')
}
export function downloadReceipt(account: Account, payment: Payment) {
  const url = URL.createObjectURL(new Blob([receiptText(account, payment)], { type: 'text/plain;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = `longbeach-comprovante-${payment.id}.txt`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
