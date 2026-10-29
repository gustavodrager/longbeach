import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, apiFetch } from '../../lib/http'
import { hasPermission, isManagement } from '../auth/access'
import { useAuth } from '../auth/authContext'
import type { AuthUser } from '../auth/types'

export type CustomerScope = 'students' | 'projects' | 'bar' | 'reservations'
export type CustomerProfile = 'Aluno' | 'Mensalista' | 'Bar'
export type CustomerLookup = { id: string; name: string; phoneHint: string; incomplete: boolean }
export type CustomerSelection = Pick<CustomerLookup, 'id' | 'name'> & Partial<Pick<CustomerLookup, 'phoneHint' | 'incomplete'>>
export type Customer = {
  id: string; name: string; phone: string; email: string | null; status: 'Ativo' | 'Inativo'
  version: number; origin: string; incomplete: boolean; userId: string | null
  profiles: string[]; mergedIntoId: string | null
}
export type CustomerPage = { items: Customer[]; total: number; page: number; pageSize: number }
export type CustomerFilters = { search?: string; profile?: CustomerProfile | ''; incomplete?: string; status?: string; page?: number }
export type CustomerCreate = { operationId: string; name: string; phone: string; email?: string | null }
export type CustomerUpdate = { expectedVersion: number; name: string; phone: string; email?: string | null; status: Customer['status'] }
export type CustomerLink = { kind: string; sourceId: string; parentId: string | null; name: string }
export type CustomerDuplicate = { first: Customer; second: Customer; reasons: string[] }
export type CustomerMergePreview = { sourceId: string; targetId: string; sourceVersion: number; targetVersion: number; previewToken: string; canMerge: boolean; warnings: string[]; sourceLinks: number; targetLinks: number }
export type CustomerMergeInput = { operationId: string; sourceId: string; targetId: string; sourceVersion: number; targetVersion: number; previewToken: string; reason: string }
export type CustomerMergeResult = { mergeId: string; customerId: string; aliasId: string; sourceVersion: number; targetVersion: number; undone: boolean }
export type CustomerMergeHistory = CustomerMergeResult & { sourceName: string; targetName: string }
export type CustomerBackfillPreview = { previewToken: string; sources: number; create: number; existing: number; incomplete: number; byKind: Record<string, number>; conflicts: { kind: string; sourceId: string; parentId: string | null; reason: string }[] }
export type CustomerBackfillResult = { sources: number; created: number; linked: number }
export type CustomerUserChoice = { id: string; name: string; emailHint: string }

const scopePermissions: Record<CustomerScope, { read: string; write: string }> = {
  students: { read: 'students:read', write: 'students:write' },
  projects: { read: 'projects:read', write: 'projects:write' },
  reservations: { read: 'projects:read', write: 'projects:write' },
  bar: { read: 'bar:sales:operate', write: 'bar:sales:operate' },
}
export const canUseCustomerScope = (user: AuthUser | null | undefined, scope: CustomerScope, write = false) => hasPermission(user, scopePermissions[scope][write ? 'write' : 'read'])
export const canManageCustomerUsers = (user: AuthUser | null | undefined) => Boolean(user && !user.requiresFirstAccess && isManagement(user) && user.permissions.includes('users:manage') && user.permissions.includes('customers:write'))
export const customerError = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível confirmar. Confira a conexão e tente novamente.'
export const customerPhone = (value: string) => value.replace(/\D/g, '')
export const customerReference = (id: string) => `Ref. ${id.replaceAll('-', '').slice(-8).toUpperCase()}`
export const validCustomerPhone = (value: string) => /^[\d+().\s-]+$/.test(value.trim()) && /^\d{10,15}$/.test(customerPhone(value))
export const customerLookup = (value: Customer | CustomerLookup): CustomerLookup => 'phoneHint' in value ? value : ({ id: value.id, name: value.name, phoneHint: value.phone ? `•••• ${value.phone.slice(-4)}` : '', incomplete: value.incomplete })

function sessionKey(user: AuthUser | null) {
  return user ? `${user.id}:${[...user.roles].sort().join(',')}:${[...user.permissions].sort().join(',')}` : 'signed-out'
}
function useCustomerQuery<T>(path: string, enabled: boolean) {
  const { user } = useAuth()
  const allowed = Boolean(user && enabled)
  const query = useQuery({ queryKey: ['customers', sessionKey(user), path], queryFn: ({ signal }) => apiFetch<T>(`/api/v1/customers${path}`, { signal }), enabled: allowed, staleTime: 0, retry: false })
  const denied = query.error instanceof ApiError && [401, 403, 404, 410].includes(query.error.status)
  return { ...query, data: allowed && !denied ? query.data : undefined }
}
export function useCustomers(filters: CustomerFilters) {
  const { user } = useAuth()
  const params = new URLSearchParams({ page: String(filters.page ?? 1), pageSize: '20' })
  if (filters.search?.trim()) params.set('search', filters.search.trim())
  if (filters.profile) params.set('profile', filters.profile)
  if (filters.incomplete === 'true' || filters.incomplete === 'false') params.set('incomplete', filters.incomplete)
  if (filters.status === 'Ativo' || filters.status === 'Inativo') params.set('status', filters.status)
  return useCustomerQuery<CustomerPage>('?' + params, hasPermission(user, 'customers:read'))
}
export function useCustomer(id: string) {
  const { user } = useAuth()
  return useCustomerQuery<Customer>('/' + encodeURIComponent(id), Boolean(id && id !== 'novo') && hasPermission(user, 'customers:read'))
}
export function useCustomerLookup(scope: CustomerScope, search: string, enabled = true) {
  const { user } = useAuth()
  return useCustomerQuery<CustomerLookup[]>(`/lookup?${new URLSearchParams({ scope, search: search.trim() })}`, enabled && search.trim().length >= 3 && canUseCustomerScope(user, scope))
}
export function useCustomerCandidates(search: string, enabled: boolean) {
  const { user } = useAuth()
  return useCustomerQuery<CustomerPage>('?' + new URLSearchParams({ search, page: '1', pageSize: '20' }), enabled && search.trim().length >= 3 && hasPermission(user, 'customers:read'))
}
export function useCustomerLinks(id: string, enabled: boolean) {
  const { user } = useAuth()
  return useCustomerQuery<CustomerLink[]>(`/${encodeURIComponent(id)}/links`, enabled && hasPermission(user, 'customers:read'))
}
export function useCustomerDuplicates(enabled: boolean) {
  return useCustomerQuery<CustomerDuplicate[]>('/duplicates', enabled)
}
export function useCustomerMergeHistory(id: string, enabled: boolean) {
  return useCustomerQuery<CustomerMergeHistory[]>(`/${encodeURIComponent(id)}/merges`, enabled && Boolean(id))
}
export function useCustomerUsers(id: string, search: string, enabled: boolean) {
  const { user } = useAuth()
  return useCustomerQuery<CustomerUserChoice[]>(`/${encodeURIComponent(id)}/user-candidates?${new URLSearchParams({ search })}`, enabled && search.trim().length >= 2 && canManageCustomerUsers(user))
}
export const assignCustomerUser = (id: string, userId: string | null, expectedVersion: number) => apiFetch<Customer>(`/api/v1/customers/${encodeURIComponent(id)}/user`, { method: 'POST', body: JSON.stringify({ userId, expectedVersion }) })
export const previewCustomerMerge = (sourceId: string, targetId: string) => apiFetch<CustomerMergePreview>('/api/v1/customers/merge/preview', { method: 'POST', body: JSON.stringify({ sourceId, targetId }) })
export const mergeCustomers = (input: CustomerMergeInput) => apiFetch<CustomerMergeResult>('/api/v1/customers/merge', { method: 'POST', body: JSON.stringify(input) })
export const undoCustomerMerge = (receipt: CustomerMergeResult, operationId: string) => apiFetch<CustomerMergeResult>(`/api/v1/customers/merges/${encodeURIComponent(receipt.mergeId)}/undo`, { method: 'POST', body: JSON.stringify({ operationId, sourceVersion: receipt.sourceVersion, targetVersion: receipt.targetVersion }) })
export const previewCustomerBackfill = () => apiFetch<CustomerBackfillPreview>('/api/v1/customers/backfill/preview')
export const backfillCustomers = (operationId: string, previewToken: string) => apiFetch<CustomerBackfillResult>('/api/v1/customers/backfill', { method: 'POST', body: JSON.stringify({ operationId, previewToken }) })
export function createCustomer(input: CustomerCreate): Promise<Customer>
export function createCustomer(input: CustomerCreate, scope: CustomerScope): Promise<Customer | CustomerLookup>
export function createCustomer(input: CustomerCreate, scope?: CustomerScope): Promise<Customer | CustomerLookup> { return apiFetch(`/api/v1/customers${scope ? '?' + new URLSearchParams({ scope }) : ''}`, { method: 'POST', body: JSON.stringify(input) }) }
export const updateCustomer = (id: string, input: CustomerUpdate) => apiFetch<Customer>(`/api/v1/customers/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) })

/** Ignore commands belonging to a previous actor/permission set or unmounted form. */
export function useCustomerCommand() {
  const { user } = useAuth()
  const owner = sessionKey(user)
  const current = useRef({ owner, epoch: 0 })
  if (current.current.owner !== owner) current.current = { owner, epoch: current.current.epoch + 1 }
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const lock = useRef<symbol | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const failure = useRef<unknown>(undefined)
  useEffect(() => { lock.current = null; failure.current = undefined; setBusy(false); setError(''); setConflict(false) }, [owner])
  const cache = useQueryClient()
  async function run<T>(work: () => Promise<T>): Promise<T | undefined> {
    if (lock.current || !user) return undefined
    const started = current.current
    const token = Symbol('customer-command')
    lock.current = token; failure.current = undefined; setBusy(true); setError(''); setConflict(false)
    const active = () => mounted.current && started === current.current
    try {
      const result = await work()
      if (!active()) return undefined
      await cache.invalidateQueries({ queryKey: ['customers'] })
      return active() ? result : undefined
    } catch (cause) {
      if (active()) { failure.current = cause; setError(customerError(cause)); setConflict(cause instanceof ApiError && cause.status === 409) }
      return undefined
    } finally {
      if (lock.current === token) lock.current = null
      if (active()) setBusy(false)
    }
  }
  return { busy, error, conflict, run, failureStatus: () => failure.current instanceof ApiError ? failure.current.status : 0 }
}
