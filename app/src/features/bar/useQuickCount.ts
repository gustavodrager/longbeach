import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../lib/http'
import { useUnsavedChanges } from '../../components/managementUi'
import { root } from './BarCore'
import type { StockCount } from './StockCounts'

type Entry = { value: string; confirmed: number | null; revision: number; status: 'pending' | 'edited' | 'saving' | 'saved' | 'error'; error?: string }
type Write = { productId: string; quantity: number; revision: number }
export function countQuantity(value: string): number | null {
  const text = value.trim()
  if (text === '') return 0
  if (!/^\d+(?:[.,]\d{1,3})?$/.test(text)) return null
  const quantity = Number(text.replace(',', '.'))
  return Number.isFinite(quantity) ? quantity : null
}

// Serialize writes without locking the inputs. Each reply acknowledges only its own revision.
export function useQuickCount(count: StockCount) {
  const client = useQueryClient(); const guard = useUnsavedChanges(); const guardRef = useRef(guard); guardRef.current = guard
  const data = useRef<Record<string, Entry>>(Object.fromEntries(count.items.map(item => [item.productId, {
    value: item.counted === null ? '' : String(item.counted).replace('.', ','), confirmed: item.counted,
    revision: 0, status: item.counted === null ? 'pending' : 'saved',
  }])))
  const [entries, setEntries] = useState(data.current)
  const queue = useRef(new Map<string, Write>()); const active = useRef<Write | null>(null); const mounted = useRef(true)
  const [busy, setBusy] = useState(false)
  const isDirty = () => Boolean(active.current || queue.current.size || Object.values(data.current).some(e => e.status === 'edited' || e.status === 'error'))
  const publish = () => {
    if (!mounted.current) return
    setEntries({ ...data.current }); setBusy(Boolean(active.current || queue.current.size)); guardRef.current.setDirty(isDirty())
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; queue.current.clear() } }, [])
  const pump = async () => {
    if (active.current || !mounted.current) return
    while (queue.current.size && mounted.current) {
      const write = queue.current.values().next().value!
      queue.current.delete(write.productId); active.current = write; publish()
      try {
        const result = await apiFetch<StockCount>(`${root}/counts/${count.id}/items`, { method: 'PUT', body: JSON.stringify({ productId: write.productId, quantity: write.quantity }) })
        const saved = result.items.find(item => item.productId === write.productId)
        if (!saved || saved.counted === null) throw new Error('Não foi possível confirmar a quantidade. Tente novamente.')
        // An older list request must not replace the newly confirmed quantity.
        await client.cancelQueries({ queryKey: ['bar', '/counts'], exact: true })
        client.setQueryData<StockCount[]>(['bar', '/counts'], old => old?.map(record => record.id === count.id ? { ...record, items: record.items.map(item => item.productId === saved.productId ? { ...item, counted: saved.counted } : item) } : record))
        const latest = data.current[write.productId]
        data.current[write.productId] = { ...latest, confirmed: saved.counted, ...(latest.revision === write.revision ? { status: 'saved' as const, error: undefined } : {}) }
      } catch (error) {
        const latest = data.current[write.productId]
        if (latest.revision === write.revision) data.current[write.productId] = { ...latest, status: 'error', error: error instanceof Error ? error.message : 'Não foi possível salvar. Tente novamente.' }
      } finally { active.current = null; publish() }
    }
  }
  const change = (productId: string, value: string) => {
    queue.current.delete(productId)
    const current = data.current[productId]
    const unchanged = !active.current && (current.confirmed === null ? value === '' : countQuantity(value) === current.confirmed)
    data.current[productId] = { ...current, value, revision: current.revision + 1, status: unchanged ? (current.confirmed === null ? 'pending' : 'saved') : 'edited', error: undefined }
    publish()
  }
  const save = (productId: string) => {
    const entry = data.current[productId]
    if (entry.status === 'pending' || entry.status === 'saved') return true
    const quantity = countQuantity(entry.value)
    if (quantity === null) {
      data.current[productId] = { ...entry, status: 'error', error: 'Informe uma quantidade de zero ou mais, com até 3 casas decimais.' }; publish(); return false
    }
    if (active.current?.productId === productId && active.current.revision === entry.revision || queue.current.get(productId)?.revision === entry.revision) return true
    data.current[productId] = { ...entry, status: 'saving', error: undefined }
    queue.current.set(productId, { productId, quantity, revision: entry.revision }); publish(); void pump(); return true
  }
  const shortcut = (productId: string, quantity: number) => {
    if (data.current[productId].value.trim() === '' || countQuantity(data.current[productId].value) !== quantity) change(productId, String(quantity).replace('.', ','))
    save(productId)
  }
  return { entries, busy, dirty: isDirty(), change, save, shortcut }
}
