import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../lib/http'
import { postBar, type CatalogItem, type Tab } from './api'

export type DirectTap = { operationId: string; productId: string; name: string; price: number; attempted: boolean }
type Queue = { version: 1; entries: DirectTap[]; paused: boolean; error?: string; rejectedId?: string }
const empty = (): Queue => ({ version: 1, entries: [], paused: false })
const eventName = 'lb-direct-sales-change'
export function directSalesKey(owner: string, tabId: string) { return `lb-direct-sales-v1:${owner}:${tabId}` }
export function readDirectSales(key: string): Queue {
  const raw = localStorage.getItem(key)
  if (!raw) return empty()
  const value = JSON.parse(raw) as Queue
  if (value.version !== 1 || !Array.isArray(value.entries) || value.entries.length > 500 || typeof value.paused !== 'boolean'
    || !value.entries.every(row => typeof row.operationId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.operationId) && typeof row.productId === 'string' && row.productId.length > 0 && row.productId.length <= 100 && typeof row.name === 'string' && row.name.length <= 200 && Number.isFinite(row.price) && row.price > 0 && typeof row.attempted === 'boolean')
    || (value.error !== undefined && (typeof value.error !== 'string' || value.error.length > 450)) || (value.rejectedId !== undefined && (typeof value.rejectedId !== 'string' || value.rejectedId !== value.entries[0]?.operationId))
    || new Set(value.entries.map(row => row.operationId)).size !== value.entries.length) throw new Error('Fila inválida')
  return value
}

/** One durable UUID per tap. Separate storage/send locks allow rapid taps and multiple tabs. */
export function useDirectSales(owner: string, tabId: string, availability: { authorized: boolean; online: boolean; known: boolean; open: boolean; accepting: boolean }) {
  const key = directSalesKey(owner, tabId); const cache = useQueryClient()
  const [queue, setQueue] = useState<Queue>(empty)
  const [storageError, setStorageError] = useState('')
  const [saving, setSaving] = useState(false)
  const [adding, setAdding] = useState(0)
  const [message, setMessage] = useState('')
  const active = useRef(false); const running = useRef<string | null>(null); const current = useRef(availability); current.current = availability
  const identity = useRef(key); identity.current = key
  const isCurrent = () => active.current && identity.current === key
  function storageFailure() { if (isCurrent()) setStorageError('Não foi possível guardar os lançamentos. Libere o armazenamento antes de tocar nos produtos novamente.') }
  function sync() { try { const next = readDirectSales(key); if (isCurrent()) setQueue(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next) } catch { storageFailure() } }
  async function mutate(update: (value: Queue) => Queue) {
    return navigator.locks.request(`${key}:storage`, async () => {
      const value = update(readDirectSales(key))
      localStorage.setItem(key, JSON.stringify(value))
      window.dispatchEvent(new CustomEvent(eventName, { detail: key }))
      return value
    })
  }
  async function drain() {
    if (running.current === key || !navigator.locks || storageError) return
    running.current = key
    let processed = false
    try {
      await navigator.locks.request(`${key}:send`, async () => {
        while (isCurrent() && current.current.authorized && current.current.online && current.current.known) {
          const saved = readDirectSales(key); const head = saved.entries[0]
          if (!head || saved.paused || (!current.current.open && !head.attempted)) break
          const marked = await mutate(value => ({ ...value, entries: value.entries.map(row => row.operationId === head.operationId ? { ...row, attempted: true } : row) }))
          if (marked.entries[0]?.operationId !== head.operationId) continue
          if (!isCurrent() || !current.current.authorized || !current.current.online) break
          setSaving(true)
          try {
            const result = await postBar<Tab>(`/tabs/${tabId}/items`, { operationId: head.operationId, items: [{ productId: head.productId, quantity: 1 }], deliver: true, directSale: true, expectedUnitPrice: head.price })
            if (!isCurrent()) break
            processed = true
            // Removing only this UUID preserves taps added concurrently by another tab.
            await mutate(value => ({ ...value, entries: value.entries.filter(row => row.operationId !== head.operationId), paused: false, error: undefined, rejectedId: undefined }))
            cache.setQueryData<Tab>(['bar-runtime', owner, `/tabs/${tabId}`], old => old && (old.version ?? 0) > (result.version ?? 0) ? old : result)
            void cache.invalidateQueries({ queryKey: ['bar-runtime', owner], refetchType: 'none' })
            void cache.invalidateQueries({ queryKey: ['bar'], refetchType: 'none' })
            if (isCurrent()) setMessage(`${head.name} adicionado à comanda.`)
          } catch (error) {
            if (!isCurrent()) break
            const rejected = error instanceof ApiError && [400, 422].includes(error.status)
            await mutate(value => ({ ...value, paused: true, error: error instanceof ApiError ? error.message.slice(0, 450) : 'A conexão foi interrompida. Retome os mesmos registros; não toque no produto novamente.', rejectedId: rejected ? head.operationId : undefined }))
            if (rejected) void cache.invalidateQueries({ queryKey: ['bar-runtime', owner] })
            break
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
    setStorageError(navigator.locks ? '' : 'Este navegador precisa ser atualizado para registrar os toques com segurança.')
    sync()
    const changed = (event: Event) => { if (event instanceof StorageEvent ? event.key === key : (event as CustomEvent).detail === key) sync() }
    window.addEventListener('storage', changed); window.addEventListener(eventName, changed)
    return () => { active.current = false; window.removeEventListener('storage', changed); window.removeEventListener(eventName, changed) }
  }, [key])
  useEffect(() => { if (!storageError) void drain() }, [queue, availability.authorized, availability.online, availability.known, availability.open, storageError])
  async function add(product: CatalogItem) {
    if (!isCurrent() || !current.current.accepting || !current.current.authorized || !current.current.online || !current.current.open || storageError) return
    setAdding(value => value + 1); setMessage('')
    try {
      await mutate(value => {
        if (value.entries.length >= 500) throw new Error('Fila indisponível')
        return { ...value, entries: [...value.entries, { operationId: crypto.randomUUID(), productId: product.id, name: product.shortName || product.name, price: product.salePrice, attempted: false }] }
      })
      void drain()
    } catch { storageFailure() }
    finally { if (isCurrent()) setAdding(value => value - 1) }
  }
  async function resume() {
    if (!isCurrent() || !current.current.authorized || !current.current.online || storageError) return
    try { await mutate(value => ({ ...value, paused: false, error: undefined })); void drain() } catch { storageFailure() }
  }
  async function removeUnsent(id: string) {
    if (!isCurrent()) return
    try {
      await mutate(value => {
        const row = value.entries.find(row => row.operationId === id)
        if (!row || row.attempted && value.rejectedId !== id) return value
        return { ...value, entries: value.entries.filter(row => row.operationId !== id), ...(value.entries[0]?.operationId === id ? { paused: false, error: undefined, rejectedId: undefined } : {}) }
      })
      void drain()
    } catch { storageFailure() }
  }
  return { queue, saving, adding, message, storageError, add, resume, removeUnsent }
}
