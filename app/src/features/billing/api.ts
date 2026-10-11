import { apiFetch } from '../../lib/http'
export type Payment = { id: string; operationId: string; method: string; amount: number; state: string; refunded: number; pixText?: string; qrImageUrl?: string; expiresAtUtc?: string; paidAtUtc?: string; canResume: boolean; refundPending?: number }
export type Account = { id: string; kind: 'Bar' | 'Quadra'; sourceId: string; title: string; dueDate?: string; total: number; paid: number; pending: number; payable: number; state: string; payments: Payment[]; recurringEligible: boolean; userId: string; competence?: string; subscriptionId?: string; items?: AccountItem[]; discount?: number }
export type Config = { pixEnabled: boolean; cardEnabled: boolean; subscriptionsEnabled: boolean; cardPublicKey?: string; subscriptionPublicKey?: string }
export type Subscription = { id: string; operationId: string; accountId: string; amount: number; firstDue: string; state: string; canResume: boolean }
export type Candidates = { accounts: { id: string; kind: string; name: string }[]; users: { id: string; name: string }[]; students: { id: string; name: string }[] }
export const post = <T,>(path: string, body: unknown) => apiFetch<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
export const stateLabel = (s: string) => ({ Pending: 'Aguardando confirmação', Approved: 'Pago', Canceled: 'Cancelado', Declined: 'Recusado', Refunded: 'Estornado', Open: 'Em aberto', Closed: 'Encerrada', ACTIVE: 'Ativa', CANCELED: 'Cancelada', OVERDUE: 'Em atraso', SUSPENDED: 'Suspensa', TRIAL: 'Primeira cobrança agendada', Creating: 'Adesão em confirmação', CancelPending: 'Cancelamento em confirmação', PENDING: 'Em confirmação' }[s] ?? s)
export const date = (s?: string) => s ? s.slice(0, 10).split('-').reverse().join('/') : 'Sem vencimento'

export type AccountItem = { id: string; name: string; quantity: number; unitPrice: number; total: number; state: string }
