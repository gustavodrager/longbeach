import { useEffect, useState, type ReactNode, type SetStateAction } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../lib/http'
import type { CartLine } from './api'
import '../prototype/prototype.css'
import './attendance.css'
export function BarFrame({ children, className = '' }: { children: ReactNode; className?: string }) { return <div className={`ux-root ux-attendant lb-attendance ${className}`}><div className="ux-page">{children}</div></div> }
export function LoadState({ query }: { query: { isLoading: boolean; isError: boolean; error: Error | null; refetch: () => unknown } }) {
  return query.isLoading ? <p role="status">Carregando…</p> : query.isError ? <div className="ux-notice error" role="alert"><div><p>{query.error instanceof ApiError ? query.error.message : 'Não foi possível consultar os dados. Confira a conexão.'}</p><button className="ux-button secondary" onClick={() => void query.refetch()}>Tentar novamente</button></div></div> : null
}

export function readCart(key: string): CartLine[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? sessionStorage.getItem(key) ?? '[]')
    return Array.isArray(saved) ? saved.filter((row): row is CartLine => Boolean(row && typeof row.productId === 'string' && Number.isFinite(row.quantity) && row.quantity > 0 && row.quantity <= 999 && (row.notes === undefined || typeof row.notes === 'string' && row.notes.length <= 500))) : []
  } catch { return [] }
}
export function useCart(scope: string, owner = 'client') {
  const key = `lb-cart:${owner}:${scope}`
  const [storageError, setStorageError] = useState(false)
  const [state, setState] = useState(() => ({ key, cart: readCart(key) }))
  // A changed comanda has its own cart before anything is written to storage.
  if (state.key !== key) setState({ key, cart: readCart(key) })
  const cart = state.key === key ? state.cart : []
  useEffect(() => { if (state.key !== key) return; try { localStorage.setItem(key, JSON.stringify(state.cart)); sessionStorage.removeItem(key); setStorageError(false) } catch { setStorageError(true) } }, [state, key])
  const setCart = (next: SetStateAction<CartLine[]>) => setState(current => ({ key, cart: typeof next === 'function' ? next(current.key === key ? current.cart : readCart(key)) : next }))
  return [cart, setCart, storageError] as const
}

/** Stores only the action awaiting confirmation; the existing cart and UUID preserve its payload. */
export function useConfirmationGate(scope: string) {
  const key = `lb-confirmation:${scope}`
  const read = () => { try { return localStorage.getItem(key) ?? sessionStorage.getItem(key) ?? '' } catch { return '' } }
  const [state, setState] = useState(() => ({ key, pending: read() }))
  if (state.key !== key) setState({ key, pending: read() })
  const pending = state.key === key ? state.pending : ''
  const setPending = (value: string) => {
    value ? localStorage.setItem(key, value) : localStorage.removeItem(key); sessionStorage.removeItem(key)
    setState({ key, pending: value })
  }
  return [pending, setPending] as const
}

export function useBarConnection() {
  const cache = useQueryClient()
  const [online, setOnline] = useState(navigator.onLine)
  const [generation, setGeneration] = useState(0)
  useEffect(() => {
    const offline = () => setOnline(false)
    const reconnect = () => { setOnline(true); setGeneration(n => n + 1); void cache.invalidateQueries({ queryKey: ['bar-runtime'] }); void cache.invalidateQueries({ queryKey: ['bar'] }) }
    window.addEventListener('offline', offline); window.addEventListener('online', reconnect)
    return () => { window.removeEventListener('offline', offline); window.removeEventListener('online', reconnect) }
  }, [cache])
  return { online, generation }
}
