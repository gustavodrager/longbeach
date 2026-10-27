import type { TabPayment } from './api'
export type ManualPaymentInput = { operationId: string; method: 'Cash' | 'TerminalManual'; amount: number; sessionId?: string; tendered: number; terminalType?: string; terminalApproved: boolean; authorization: string | null }
export type PaymentCheckpoint = { operationId: string; input: ManualPaymentInput; payment?: TabPayment }
export function readPaymentCheckpoint(key: string): PaymentCheckpoint | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null') as PaymentCheckpoint | null
    if (!value || value.operationId !== value.input?.operationId || !['Cash', 'TerminalManual'].includes(value.input.method) || !Number.isFinite(value.input.amount) || value.input.amount <= 0) return null
    return value
  } catch { return null }
}
