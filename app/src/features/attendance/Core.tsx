import { useEffect, useState, type ReactNode, type SetStateAction } from 'react'
import { ApiError } from '../../lib/http'
import type { CartLine } from './api'
export function BarFrame({ children }: { children: ReactNode }) { return <div className="ux-root ux-attendant lb-attendance"><div className="ux-page">{children}</div></div> }
export function LoadState({ query }: { query: { isLoading: boolean; isError: boolean; error: Error | null; refetch: () => unknown } }) {
  return query.isLoading ? <p role="status">Carregando…</p> : query.isError ? <div className="ux-notice error" role="alert"><div><p>{query.error instanceof ApiError ? query.error.message : 'Não foi possível consultar os dados. Confira a conexão.'}</p><button className="ux-button secondary" onClick={() => void query.refetch()}>Tentar novamente</button></div></div> : null
}

function readCart(key: string): CartLine[] {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(key) ?? '[]')
    return Array.isArray(saved) ? saved.filter((row): row is CartLine => Boolean(row && typeof row.productId === 'string' && Number.isFinite(row.quantity) && row.quantity > 0 && row.quantity <= 999)) : []
  } catch { return [] }
}
export function useCart(scope: string, owner = 'client') {
  const key = `lb-cart:${owner}:${scope}`
  const [state, setState] = useState(() => ({ key, cart: readCart(key) }))
  // A changed comanda has its own cart before anything is written to storage.
  if (state.key !== key) setState({ key, cart: readCart(key) })
  const cart = state.key === key ? state.cart : []
  useEffect(() => { if (state.key !== key) return; try { sessionStorage.setItem(key, JSON.stringify(state.cart)) } catch { /* page still keeps the cart */ } }, [state, key])
  const setCart = (next: SetStateAction<CartLine[]>) => setState(current => ({ key, cart: typeof next === 'function' ? next(current.key === key ? current.cart : readCart(key)) : next }))
  return [cart, setCart] as const
}

/** Stores only the action awaiting confirmation; the existing cart and UUID preserve its payload. */
export function useConfirmationGate(scope: string) {
  const key = `lb-confirmation:${scope}`
  const read = () => { try { return sessionStorage.getItem(key) ?? '' } catch { return '' } }
  const [state, setState] = useState(() => ({ key, pending: read() }))
  if (state.key !== key) setState({ key, pending: read() })
  const pending = state.key === key ? state.pending : ''
  const setPending = (value: string) => {
    setState({ key, pending: value })
    try { value ? sessionStorage.setItem(key, value) : sessionStorage.removeItem(key) } catch { /* in-memory protection remains */ }
  }
  return [pending, setPending] as const
}
