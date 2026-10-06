import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, ApiError } from '../../lib/http'
import { useAuth } from '../auth/authContext'

export type CatalogItem = {
  id: string; name: string; shortName: string; categoryId: string; categoryName: string
  salePrice: number; favorite: boolean; displayOrder: number; imageUrl?: string; available: number | null; prepared: boolean
}
export type TabItem = {
  id: string; tabId: string; productId: string; name: string; quantity: number; unitPrice: number; total: number
  state: string; source: string; actorId?: string; createdAtUtc: string; acceptedAtUtc?: string; fulfilledAtUtc?: string; reason?: string
  allowedActions: string[]; recipeId?: string | null; recipeVersion?: number | null
}
export type TabPayment = {
  id: string; tabId: string; method: string; amount: number; tendered: number; change: number; state: string
  actorId?: string; sessionId?: string; operationId: string; providerId?: string; pixText?: string; qrImageUrl?: string; canResume?: boolean
  expiresAtUtc?: string; createdAtUtc: string; confirmedAtUtc?: string; refunded: number; refundPending: number; fee: number | null
}
export type Tab = {
  id: string; number: number; name: string; mode: string; state: string; locationId: string; actorId: string
  total: number; paid: number; pending: number; due: number; payable: number; createdAtUtc: string
  items: TabItem[]; payments: TabPayment[]; gross?: number; discount?: number; history: { id: string; kind: string; itemId?: string; paymentId?: string; amount: number; actorId?: string; reason?: string; createdAtUtc: string }[]; allowedActions: string[]
}
export type CashSession = {
  id: string; registerId: string; locationId: string; openedBy: string; state: string; opening: number; expected: number; createdAtUtc: string; terminal: string
}
export type Named = { id: string; name: string }
export type CashClosing = { id: string; sessionId: string; expected: number; counted: number; difference: number; reason?: string }
export type PageResult<T> = { items: T[]; page: number; pageSize: number; total: number }
export type TabReportRow = { id: string; label: string; detail: string; date: string; amount?: number; count?: number; resource: string; resourceId: string }
export type TabReport = { metric: string; title: string; value: number; unit: string; current: boolean; fromUtc: string; toUtc: string; updatedAtUtc: string; explanation: string; available?: boolean; rows: PageResult<TabReportRow> }
export type CartLine = { productId: string; quantity: number }
export const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
export const dateTime = (value?: string) => value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'Ainda não confirmado'
export function parseAmount(value: string) { return /^\d+(?:[,.]\d{1,2})?$/.test(value.trim()) ? Math.round(Number(value.replace(',', '.')) * 100) / 100 : NaN }
export const operationId = () => crypto.randomUUID()
export const isOpen = (session: CashSession) => session.state === 'Open' || session.state === 'Reopened'
export const itemLabels: Record<string, string> = { Requested: 'Esperando a equipe confirmar', Accepted: 'A preparar / entregar', Fulfilled: 'Entregue', Rejected: 'Recusado', Reversed: 'Consumo corrigido' }
export const paymentLabels: Record<string, string> = { CreditCard: 'Crédito à vista', Cash: 'Dinheiro', CardManual: 'Cartão', Pix: 'Pix' }

export function useBarData<T>(path: string, enabled = true) {
  const { user } = useAuth()
  const query = useQuery({ queryKey: ['bar-runtime', user?.id, path], queryFn: () => apiFetch<T>(`/api/v1/bar${path}`), enabled: Boolean(user && enabled), refetchInterval: path.includes('payments') || path.includes('tabs') || path.includes('cash') ? 15_000 : false })
  const accessLost = query.error instanceof ApiError && [401, 403, 404, 410].includes(query.error.status)
  return { ...query, data: accessLost ? undefined : query.data }
}

export function useBarCommand() {
  const cache = useQueryClient()
  const lock = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  async function run<T>(work: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error?: unknown }> {
    if (lock.current) return { ok: false }
    lock.current = true; setBusy(true); setError(''); setMessage('')
    try {
      const value = await work()
      await Promise.all([cache.invalidateQueries({ queryKey: ['bar-runtime'] }), cache.invalidateQueries({ queryKey: ['bar'] })])
      return { ok: true, value }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível confirmar esta operação. Seu pedido foi preservado. Confira a conexão e tente novamente.')
      return { ok: false, error: cause }
    } finally { lock.current = false; setBusy(false) }
  }
  return { run, busy, error, message, setMessage, setError }
}
export const postBar = <T,>(path: string, body: unknown) => apiFetch<T>(`/api/v1/bar${path}`, { method: 'POST', body: JSON.stringify(body) })

/** The QR credential is the only authority for a client request. Never attach the attendant's session. */
export async function clientRequest<T>(token: string, path = '', body?: unknown): Promise<T> {
  const base = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
  const response = await fetch(`${base}/api/v1/bar/client${path}`, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'omit', referrerPolicy: 'no-referrer',
    headers: body === undefined ? { Accept: 'application/json', 'X-LongBeach-Tab': token } : { 'Content-Type': 'application/json', 'X-LongBeach-Tab': token }, body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    let detail = 'Este acesso não está disponível. Peça ajuda à equipe.'
    try { const problem = await response.json() as { detail?: string; message?: string }; detail = problem.detail ?? problem.message ?? detail } catch { /* retain the safe message */ }
    throw new ApiError(response.status, detail)
  }
  return response.json() as Promise<T>
}

export function useIntent(scope: string) {
  const { user } = useAuth()
  const keys = useRef(new Map<string, string>())
  return (intent: string, renew = false) => {
    const key = `lb-operation:${user?.id}:${scope}:${intent}`
    if (renew || !keys.current.has(key)) {
      let previous: string | null = null
      try { previous = sessionStorage.getItem(key) } catch { /* in-memory continuity remains */ }
      const value = renew ? operationId() : previous ?? operationId()
      keys.current.set(key, value)
      try { sessionStorage.setItem(key, value) } catch { /* a refresh may lose the intent, the server still enforces state transitions */ }
    }
    return keys.current.get(key)!
  }
}
