import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, getSessionVersion } from '../../lib/http'
import { hasStaffAction, hasStaffMenu } from '../auth/access'
import { useAuth } from '../auth/authContext'
import { directSalesAdmissionLock, directSalesEventName, directSalesSendLock, readDirectSales } from './directSalesStorage'

export const directSalesPendingMessage = 'Confira os lançamentos e retiradas pendentes desta comanda antes de receber, encerrar ou cancelar.'
export class DirectSalesSettlementGuardError extends ApiError {
  constructor(message = directSalesPendingMessage) { super(409, message) }
}
export type DirectSalesPending = { blocked: boolean; own: boolean; other: boolean; removal: boolean; unreadable: boolean; productIds: string[] }
const prefixes = ['lb-direct-sales-v1:', 'lb-direct-removals-v1:']
const isTabQueue = (key: string | null, tabId: string) => Boolean(key && prefixes.some(prefix => key.startsWith(prefix)) && key.endsWith(`:${tabId}`))

export function itemActionCanCloseTab(action: string) {
  // A payment can finish elsewhere while this screen still shows an old
  // balance. The action's capability, not that snapshot, determines the guard.
  return ['fulfill', 'reject', 'reverse', 'remove-unit'].includes(action)
}

/** Read every operator's local queue without changing it or assuming its identity. */
export function readDirectSalesPending(tabId: string, owner?: string): DirectSalesPending {
  const result: DirectSalesPending = { blocked: false, own: false, other: false, removal: false, unreadable: false, productIds: [] }
  const products = new Set<string>()
  if (!tabId) return result
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if (!isTabQueue(key, tabId)) continue
      const ownQueue = Boolean(owner && prefixes.some(prefix => key === `${prefix}${owner}:${tabId}`))
      let pending: boolean
      try {
        const entries = readDirectSales(key!).entries
        pending = entries.length > 0
        // Another account's attempted entry may have committed before that
        // account left the page, even without a recorded error yet.
        entries.filter(row => row.state !== undefined || !ownQueue && (row.attempted || row.uncertain)).forEach(row => products.add(row.productId))
      }
      catch { pending = true; result.unreadable = true }
      if (!pending) continue
      result.blocked = true
      if (key!.startsWith('lb-direct-removals-v1:')) result.removal = true
      if (ownQueue) result.own = true
      else result.other = true
    }
  } catch { result.blocked = true; result.unreadable = true }
  result.productIds = [...products].sort()
  return result
}

function samePending(left: DirectSalesPending, right: DirectSalesPending) {
  return left.blocked === right.blocked && left.own === right.own && left.other === right.other && left.removal === right.removal && left.unreadable === right.unreadable
    && left.productIds.length === right.productIds.length && left.productIds.every((id, index) => id === right.productIds[index])
}

export function useDirectSalesPending(tabId: string, owner?: string) {
  const identity = `${owner ?? ''}:${tabId}`
  const [snapshot, setSnapshot] = useState(() => ({ identity, value: readDirectSalesPending(tabId, owner) }))
  const value = snapshot.identity === identity ? snapshot.value : readDirectSalesPending(tabId, owner)
  useEffect(() => {
    const refresh = () => {
      const next = readDirectSalesPending(tabId, owner)
      setSnapshot(previous => previous.identity === identity && samePending(next, previous.value) ? previous : { identity, value: next })
    }
    const changed = (event: Event) => {
      const key = event instanceof StorageEvent ? event.key : (event as CustomEvent<string | undefined>).detail
      if (key == null || isTabQueue(key, tabId)) refresh()
    }
    refresh()
    window.addEventListener('storage', changed)
    window.addEventListener(directSalesEventName, changed)
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener('storage', changed)
      window.removeEventListener(directSalesEventName, changed)
      window.removeEventListener('focus', refresh)
    }
  }, [identity, tabId, owner])
  return value
}

/** New settlement requires all known local consumption to be confirmed. */
export function withDirectSalesSettled<T>(tabId: string, work: (signal: AbortSignal) => Promise<T>) {
  return withDirectSalesFinancialLock(tabId, work, true)
}

/** Replay only the existing payment checkpoint, retaining its UUID and payload. */
export function withDirectPaymentRecovery<T>(tabId: string, work: (signal: AbortSignal) => Promise<T>) {
  return withDirectSalesFinancialLock(tabId, work, false)
}

async function withDirectSalesFinancialLock<T>(tabId: string, work: (signal: AbortSignal) => Promise<T>, requireSettled: boolean): Promise<T> {
  const version = getSessionVersion()
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 30_000)
  const check = () => {
    controller.signal.throwIfAborted()
    if (version !== getSessionVersion()) throw new DirectSalesSettlementGuardError('Seu acesso mudou. Atualize a comanda antes de continuar.')
    if (requireSettled && readDirectSalesPending(tabId).blocked) throw new DirectSalesSettlementGuardError()
  }
  const guarded = async () => { check(); return work(controller.signal) }
  try {
    check()
    // Abort also cancels waiting lock requests: an expired confirmation cannot
    // acquire a lock later and send an unexpected payment.
    return await (navigator.locks
      ? navigator.locks.request(directSalesSendLock(tabId), { signal: controller.signal }, () => navigator.locks.request(directSalesAdmissionLock(tabId), { signal: controller.signal }, guarded))
      : guarded())
  } finally { window.clearTimeout(timeout) }
}

export function DirectSalesPendingNotice({ tabId, pending }: { tabId: string; pending: DirectSalesPending }) {
  const { user } = useAuth()
  if (!pending.blocked) return null
  const canResume = pending.own && hasStaffMenu(user, 'bar.sell') && hasStaffAction(user, 'bar.sell')
  return <div className="ux-notice warning" role="status" aria-label="Consumo em conferência">
    <p><strong>Saldo em conferência.</strong> {directSalesPendingMessage}</p>
    {pending.unreadable && <p>Não foi possível ler todos os registros guardados neste dispositivo. Preserve os dados do aplicativo e peça ajuda à gestão.</p>}
    {pending.other && <p>Há registros iniciados com outra conta neste dispositivo. Eles devem ser retomados pela conta original.</p>}
    {canResume && <Link className="ux-button secondary" to={`/atendimento/vender?comanda=${encodeURIComponent(tabId)}`}>Retomar registros da comanda</Link>}
    <p>Você pode continuar atendendo outras comandas.</p>
  </div>
}
