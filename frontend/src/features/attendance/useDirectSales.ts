import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiFetch, ApiError } from '../../lib/http'
import { type CatalogItem, type TabItem, type Tab } from './api'

import { readDirectSalesPending } from './directSalesPending'
import { directSalesKey, directSalesEventName, directSalesSendLock, directSalesAdmissionLock, directSalesRequestTimeout, directSalesRetryDelays,
  directSalesMaximumAttempts as maximumAttempts, emptyDirectSales as empty, summarizeDirectSales as summarize, readDirectSales, type DirectTap, type DirectSalesQueue as Queue } from './directSalesStorage'
export { directSalesKey, directSalesEventName, directSalesSendLock, directSalesAdmissionLock, directSalesRequestTimeout, directSalesRetryDelays, readDirectSales, type DirectTap } from './directSalesStorage'

/** Only the first outstanding unit of each product can advance. Other products stay available. */
function candidates(queue: Queue): DirectTap[] {
  const seen = new Set<string>()
  return queue.entries.filter(row => { if (seen.has(row.productId)) return false; seen.add(row.productId); return true })
}
const accessBlocked = (queue: Queue) => queue.entries.some(row => row.httpStatus === 401 || row.httpStatus === 403)
const mayRetry = (error: unknown) => !(error instanceof ApiError) || error.problem.retryable !== false
  && ([0, 408, 409, 425, 429].includes(error.status) || error.status >= 500)

/** One durable UUID per tap. Storage/send locks and bounded retries preserve the original intent. */
export function useDirectSales(owner: string, tabId: string, availability: { authorized: boolean; online: boolean; known: boolean; open: boolean; accepting: boolean; suspended?: boolean }, kind: 'add' | 'remove' = 'add') {
  const key = directSalesKey(owner, tabId, kind); const cache = useQueryClient()
  const [queue, setQueue] = useState<Queue>(empty)
  const [storageError, setStorageError] = useState('')
  const [saving, setSaving] = useState(false)
  const [adding, setAdding] = useState(0)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const active = useRef(false); const running = useRef<string | null>(null); const current = useRef(availability); current.current = availability
  const request = useRef<{ key: string; controller: AbortController } | null>(null)
  const identity = useRef(key); identity.current = key
  const isCurrent = () => active.current && identity.current === key
  function storageFailure() { if (isCurrent()) setStorageError('Não foi possível guardar os lançamentos. Libere o armazenamento antes de tocar nos produtos novamente.') }
  function sync() { try { const next = readDirectSales(key); if (isCurrent()) setQueue(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next) } catch { storageFailure() } }
  async function mutate(update: (value: Queue) => Queue) {
    return navigator.locks.request(`${key}:storage`, async () => {
      const value = update(readDirectSales(key))
      localStorage.setItem(key, JSON.stringify(value))
      window.dispatchEvent(new CustomEvent(directSalesEventName, { detail: key }))
      return value
    })
  }
  async function send(head: DirectTap) {
    const controller = new AbortController(); request.current = { key, controller }
    const path = kind === 'remove' ? `/tabs/${tabId}/items/${head.itemId}/${head.action ?? 'reverse'}` : `/tabs/${tabId}/items`
    const body = kind === 'remove' ? { operationId: head.operationId, reason: head.reason, returnStock: head.returnStock }
      : { operationId: head.operationId, items: [{ productId: head.productId, quantity: 1 }], deliver: true, directSale: true, expectedUnitPrice: head.price }
    const timeout = setTimeout(() => controller.abort(new ApiError(0,
      'A confirmação demorou. O registro foi preservado para conferência.', { retryable: true, outcome: 'unconfirmed' })), directSalesRequestTimeout)
    try {
      return await apiFetch<Tab>(`/api/v1/bar${path}`, { method: 'POST', body: JSON.stringify(body), signal: controller.signal })
    } finally { clearTimeout(timeout); if (request.current?.controller === controller) request.current = null }
  }
  async function drain() {
    if (running.current === key || !navigator.locks || storageError) return
    running.current = key
    let processed = false
    try {
      await navigator.locks.request(directSalesSendLock(tabId), async () => {
        while (isCurrent() && current.current.authorized && current.current.online && current.current.known && !current.current.suspended) {
          const saved = readDirectSales(key)
          if (accessBlocked(saved)) break
          const head = kind === 'remove' ? saved.paused ? undefined : saved.entries[0]
            : candidates(saved).find(row => row.state !== 'attention' && row.state !== 'rejected' && (row.attempts ?? 0) < maximumAttempts && (row.retryAt ?? 0) <= Date.now() && (current.current.open || row.attempted))
          if (!head || (!current.current.open && !head.attempted)) break
          const attempts = (head.attempts ?? 0) + 1
          const marked = await mutate(value => summarize(value.entries.map(row => row.operationId === head.operationId ? { ...row, attempted: true, attempts, uncertain: true } : row)))
          if (!marked.entries.some(row => row.operationId === head.operationId)) continue
          if (!isCurrent() || !current.current.authorized || !current.current.online) break
          setSaving(true)
          try {
            const result = await send(head)
            if (!isCurrent()) break
            processed = true
            // Remove only this UUID; taps added concurrently by another tab stay durable.
            await mutate(value => summarize(value.entries.filter(row => row.operationId !== head.operationId)))
            cache.setQueryData<Tab>(['bar-runtime', owner, `/tabs/${tabId}`], old => old && (old.version ?? 0) > (result.version ?? 0) ? old : result)
            void cache.invalidateQueries({ queryKey: ['bar-runtime', owner], refetchType: 'none' })
            void cache.invalidateQueries({ queryKey: ['bar'], refetchType: 'none' })
            if (isCurrent()) setMessage(`${head.name} ${kind === 'remove' ? 'retirado da' : 'adicionado à'} comanda.`)
          } catch (error) {
            if (!isCurrent()) break
            // A later refusal cannot erase a previously uncertain attempt (lost response, reload).
            const uncertainBefore = head.uncertain ?? head.attempted
            const rejected = !uncertainBefore && error instanceof ApiError && [400, 422].includes(error.status)
            const retry = kind === 'add' && !rejected && mayRetry(error) && attempts < maximumAttempts
            await mutate(value => summarize(value.entries.map(row => row.operationId !== head.operationId ? row : {
              ...row, state: rejected ? 'rejected' : retry ? 'retry' : 'attention', uncertain: !rejected,
              retryAt: retry ? Date.now() + directSalesRetryDelays[attempts - 1] : undefined,
              error: error instanceof ApiError ? error.message.slice(0, 450) : 'A conexão foi interrompida. O registro foi preservado para conferência.',
              httpStatus: error instanceof ApiError ? error.status : 0, traceId: error instanceof ApiError ? error.problem.traceId : undefined,
            })))
            void cache.invalidateQueries({ queryKey: ['bar-runtime', owner] })
            if (kind === 'remove') break
          } finally { if (isCurrent()) setSaving(false) }
        }
      })
    } catch { storageFailure() }
    finally {
      if (running.current === key) running.current = null
      if (isCurrent()) {
        sync()
        try { if (processed && !readDirectSales(key).entries.length) void cache.invalidateQueries({ queryKey: ['bar-runtime', owner] }) } catch { storageFailure() }
      }
    }
  }
  useEffect(() => {
    active.current = true
    setSaving(false); setNotice('')
    setStorageError(navigator.locks ? '' : 'Este navegador precisa ser atualizado para registrar os toques com segurança.')
    sync()
    const changed = (event: Event) => {
      if (!(event instanceof StorageEvent ? event.key === key : (event as CustomEvent).detail === key)) return
      sync()
      try { if (isCurrent() && !readDirectSales(key).entries.length) void cache.invalidateQueries({ queryKey: ['bar-runtime', owner, `/tabs/${tabId}`] }) } catch { storageFailure() }
    }
    window.addEventListener('storage', changed); window.addEventListener(directSalesEventName, changed)
    return () => { active.current = false; if (request.current?.key === key) request.current.controller.abort(); window.removeEventListener('storage', changed); window.removeEventListener(directSalesEventName, changed) }
  }, [key])
  useEffect(() => {
    if (storageError) return
    void drain()
    if (kind !== 'add' || !availability.authorized || !availability.online || !availability.known || availability.suspended || accessBlocked(queue)) return
    const next = candidates(queue).filter(row => row.state === 'retry' && (row.retryAt ?? 0) > Date.now()).map(row => row.retryAt!)
    if (!next.length) return
    const timer = setTimeout(() => void drain(), Math.max(0, Math.min(...next) - Date.now()))
    return () => clearTimeout(timer)
  }, [key, queue, availability.authorized, availability.online, availability.known, availability.open, availability.suspended, storageError])
  async function enqueue(product: Pick<CatalogItem, 'id' | 'name' | 'shortName' | 'salePrice'>, removal?: Pick<DirectTap, 'itemId' | 'returnStock' | 'reason' | 'action'>) {
    if (!isCurrent() || !current.current.accepting || !current.current.authorized || !current.current.online || !current.current.open || storageError) return
    setAdding(value => value + 1); setMessage(''); setNotice('')
    try {
      await navigator.locks.request(directSalesAdmissionLock(tabId), { mode: 'shared', ifAvailable: true }, async lock => {
        if (!lock) { if (isCurrent()) setNotice('Recebimento em andamento nesta comanda. Aguarde a confirmação antes de lançar.'); return }
        if (!isCurrent() || !current.current.accepting || !current.current.authorized || !current.current.online || !current.current.open) return
        const existing = readDirectSalesPending(tabId, owner)
        if (existing.unreadable) { storageFailure(); return }
        if (kind === 'add' && (existing.removal || existing.productIds.includes(product.id))) {
          setNotice(existing.removal ? 'Confira a retirada pendente antes de lançar outros produtos.' : 'Este produto já tem um lançamento em conferência nesta comanda. Retome o registro original.')
          return
        }
        if (kind === 'remove' && existing.blocked) { setNotice('Confira os registros pendentes antes de retirar uma unidade.'); return }
        await mutate(value => {
          if (accessBlocked(value) || kind === 'remove' && value.entries.length) return value
          if (kind === 'add' && value.entries.some(row => row.productId === product.id && row.state !== undefined)) return value
          if (value.entries.length >= 500) throw new Error('Fila indisponível')
          return summarize([...value.entries, { operationId: crypto.randomUUID(), productId: product.id, name: product.shortName || product.name, price: product.salePrice, attempted: false, uncertain: false, ...removal }])
        })
      })
      void drain()
    } catch { storageFailure() }
    finally { if (isCurrent()) setAdding(value => value - 1) }
  }
  async function resume() {
    if (!isCurrent() || !current.current.authorized || !current.current.online || storageError) return
    try {
      await mutate(value => summarize(value.entries.map(row => row.state === undefined ? row : {
        ...row, state: undefined, error: undefined, httpStatus: undefined, traceId: undefined, retryAt: undefined, attempts: 0,
      })))
      void drain()
    } catch { storageFailure() }
  }
  async function removeUnsent(id: string) {
    if (!isCurrent()) return
    try {
      await mutate(value => {
        const row = value.entries.find(row => row.operationId === id)
        if (!row || row.attempted && row.state !== 'rejected') return value
        return summarize(value.entries.filter(row => row.operationId !== id))
      })
      void drain()
    } catch { storageFailure() }
  }
  async function add(product: CatalogItem) { if (kind === 'add') await enqueue(product) }
  async function remove(item: TabItem, returnStock: boolean) {
    if (kind !== 'remove' || item.quantity !== 1 || !['Accepted', 'Fulfilled'].includes(item.state)) return
    await enqueue({ id: item.productId, name: item.name, shortName: item.name, salePrice: item.unitPrice }, { itemId: item.id, returnStock, action: 'remove-unit', reason: 'Correção de lançamento pelo botão menos na venda direta.' })
  }
  return { queue, saving, adding, message, notice, storageError, accessBlocked: accessBlocked(queue), add, remove, resume, removeUnsent }
}
