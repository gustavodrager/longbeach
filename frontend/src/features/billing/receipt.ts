import { type Account, type Payment, paymentDate, paymentStateLabel } from './api'
import { money, paymentLabels } from '../attendance/api'
export function receiptText(account: Account, payment: Payment) {
  return ['LONG BEACH ARENA — COMPROVANTE DE PAGAMENTO', account.title, `Origem: ${account.kind}`, account.competence ? `Competência: ${account.competence}` : '', `Conta: ${account.id}`, `Pagamento: ${payment.id}`, `Data: ${paymentDate(payment.paidAtUtc)}`, `Meio: ${paymentLabels[payment.method] ?? (payment.method === 'Subscription' ? 'Mensalidade automática' : payment.method)}`, `Valor: ${money(payment.amount)}`, `Estornado: ${money(payment.refunded)}`, (payment.refundPending ?? 0) > 0 ? `Estorno em confirmação: ${money(payment.refundPending ?? 0)}. Ainda não concluído.` : '', `Situação na consulta: ${paymentStateLabel(payment)}`, 'Comprovante de recebimento. Não substitui documento fiscal.'].filter(Boolean).join('\n')
}
export function downloadReceipt(account: Account, payment: Payment) {
  const url = URL.createObjectURL(new Blob([receiptText(account, payment)], { type: 'text/plain;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = `longbeach-comprovante-${payment.id}.txt`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
