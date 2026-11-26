export type DirectTap = {
  operationId: string; productId: string; name: string; price: number; attempted: boolean
  itemId?: string; returnStock?: boolean; reason?: string; action?: 'reverse' | 'remove-unit'
  attempts?: number; retryAt?: number; state?: 'retry' | 'attention' | 'rejected'
  error?: string; traceId?: string; httpStatus?: number; uncertain?: boolean
}
export type DirectSalesQueue = { version: 1; entries: DirectTap[]; paused: boolean; error?: string; rejectedId?: string }
export const emptyDirectSales = (): DirectSalesQueue => ({ version: 1, entries: [], paused: false })
export const directSalesEventName = 'lb-direct-sales-change'
export const directSalesSendLock = (tabId: string) => `lb-direct-tab:${tabId}:send`
export const directSalesAdmissionLock = (tabId: string) => `lb-direct-tab:${tabId}:admission`
export const directSalesRequestTimeout = 15_000
export const directSalesRetryDelays = [1_500, 4_500] as const
export const directSalesMaximumAttempts = directSalesRetryDelays.length + 1
export function directSalesKey(owner: string, tabId: string, kind: 'add' | 'remove' = 'add') { return `${kind === 'add' ? 'lb-direct-sales' : 'lb-direct-removals'}-v1:${owner}:${tabId}` }

// Keep the v1 envelope safe for an older app: it pauses whenever an entry is in review.
export function summarizeDirectSales(entries: DirectTap[]): DirectSalesQueue {
  const issue = entries.find(row => row.state !== undefined)
  return { version: 1, entries, paused: Boolean(issue), error: issue?.error,
    rejectedId: entries[0]?.state === 'rejected' ? entries[0].operationId : undefined }
}
export function readDirectSales(key: string): DirectSalesQueue {
  const raw = localStorage.getItem(key)
  if (!raw) return emptyDirectSales()
  const removal = key.startsWith('lb-direct-removals-v1:')
  const value = JSON.parse(raw) as DirectSalesQueue
  if (value.version !== 1 || !Array.isArray(value.entries) || value.entries.length > 500 || typeof value.paused !== 'boolean'
    || !value.entries.every(row => typeof row.operationId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.operationId) && typeof row.productId === 'string' && row.productId.length > 0 && row.productId.length <= 100 && typeof row.name === 'string' && row.name.length <= 200 && Number.isFinite(row.price) && row.price > 0 && typeof row.attempted === 'boolean'
      && (row.attempts === undefined || Number.isInteger(row.attempts) && row.attempts >= 0 && row.attempts <= directSalesMaximumAttempts)
      && (row.retryAt === undefined || Number.isSafeInteger(row.retryAt) && row.retryAt >= 0)
      && (row.state === undefined || ['retry', 'attention', 'rejected'].includes(row.state))
      && (row.error === undefined || typeof row.error === 'string' && row.error.length <= 450)
      && (row.traceId === undefined || typeof row.traceId === 'string' && row.traceId.length <= 200)
      && (row.httpStatus === undefined || Number.isInteger(row.httpStatus) && row.httpStatus >= 0 && row.httpStatus <= 599)
      && (row.uncertain === undefined || typeof row.uncertain === 'boolean')
      && !(row.state === 'rejected' && row.uncertain))
    || (removal && (value.entries.length > 1 || !value.entries.every(row => typeof row.itemId === 'string' && row.itemId.length > 0 && row.itemId.length <= 100 && typeof row.returnStock === 'boolean' && typeof row.reason === 'string' && row.reason.length >= 3 && row.reason.length <= 450 && (row.action === undefined || row.action === 'reverse' || row.action === 'remove-unit'))))
    || (!removal && value.entries.some(row => row.itemId !== undefined || row.returnStock !== undefined || row.reason !== undefined || row.action !== undefined))
    || (value.error !== undefined && (typeof value.error !== 'string' || value.error.length > 450)) || (value.rejectedId !== undefined && (typeof value.rejectedId !== 'string' || value.rejectedId !== value.entries[0]?.operationId))
    || new Set(value.entries.map(row => row.operationId)).size !== value.entries.length) throw new Error('Fila inválida')
  const legacyPause = value.paused && !value.entries.some(row => row.state !== undefined)
  return summarizeDirectSales(value.entries.map((row, index) => {
    if (legacyPause && index === 0) return { ...row, state: value.rejectedId === row.operationId ? 'rejected' : 'attention',
      uncertain: value.rejectedId !== row.operationId && row.attempted, error: value.error } as DirectTap
    if (row.attempts === directSalesMaximumAttempts && row.state !== 'rejected') return { ...row, state: 'attention', uncertain: true,
      error: row.error ?? 'A confirmação ainda está pendente. Retome este registro quando a conexão estiver disponível.' } as DirectTap
    return row
  }))
}
