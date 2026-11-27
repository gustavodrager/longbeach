import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiFetch, ApiError } from '../../lib/http'
import { hasPermission, hasStaffAction, hasStaffMenu } from '../auth/access'
import { useAuth } from '../auth/authContext'
import { useConfirmationGate } from './Core'
import type { Tab } from './api'

type NameChange = { operationId: string; name: string; expectedVersion: number }
export const tabNameRequestTimeout = 15_000
function restore(raw: string): NameChange | null {
  try {
    const value = JSON.parse(raw) as NameChange
    return value && typeof value.operationId === 'string' && value.operationId.length > 0
      && typeof value.name === 'string' && value.name.length <= 80
      && Number.isInteger(value.expectedVersion) && value.expectedVersion >= 0 ? value : null
  } catch { return null }
}
const editableName = (tab: Tab) => tab.name.trim().toLocaleLowerCase('pt-BR') === 'visitante' ? '' : tab.name

/** Naming a tab does not create a customer, grant access or change its balance. */
export function useTabNameEditor(tab: Tab, disabled = false) {
  const { user } = useAuth()
  const cache = useQueryClient()
  const [raw, setPending] = useConfirmationGate(`tab-name-v1:${user?.id}:${tab.id}`)
  const pending = restore(raw)
  const invalidPending = Boolean(raw && !pending)
  const [editing, setEditing] = useState(Boolean(raw))
  const [name, setName] = useState(pending?.name ?? editableName(tab))
  const [editingVersion, setEditingVersion] = useState(tab.version)
  const [review, setReview] = useState<'none' | 'loading' | 'needed'>('none')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const active = useRef(false)
  const request = useRef<AbortController | null>(null)
  const readback = useRef<AbortController | null>(null)
  const allowed = hasPermission(user, 'bar:sales:operate') && ['bar.sell', 'bar.tabs'].some(menu => hasStaffMenu(user, menu) && hasStaffAction(user, menu))
  const authorized = useRef(allowed); authorized.current = allowed
  const ready = allowed && tab.state === 'Open' && Number.isInteger(tab.version)
  const changed = name.trim() !== editableName(tab).trim()
  const detailKey = ['bar-runtime', user?.id, `/tabs/${tab.id}`]

  useEffect(() => {
    active.current = true
    return () => { active.current = false; request.current?.abort(); readback.current?.abort() }
  }, [])
  useEffect(() => {
    if (!allowed) {
      request.current?.abort(); readback.current?.abort()
      setReview(current => current === 'loading' ? 'needed' : current)
    }
  }, [allowed])

  function stopReading() { const current = readback.current; readback.current = null; current?.abort() }

  async function refreshDetails(rebase = false) {
    readback.current?.abort()
    const controller = new AbortController(); readback.current = controller
    const timeout = window.setTimeout(() => controller.abort(), tabNameRequestTimeout)
    try {
      const latest = await apiFetch<Tab>(`/api/v1/bar/tabs/${tab.id}`, { signal: controller.signal })
      if (!active.current || !authorized.current || controller.signal.aborted) return
      await cache.cancelQueries({ queryKey: detailKey, exact: true })
      if (!active.current || !authorized.current || controller.signal.aborted) return
      cache.setQueryData<Tab>(detailKey, current => !current || (latest.version ?? -1) >= (current.version ?? -1) ? latest : current)
      if (rebase) {
        if (!Number.isInteger(latest.version)) throw new Error('Missing tab version')
        setEditingVersion(latest.version); setReview('none')
      }
    } catch {
      // A confirmed write remains confirmed; a rejected draft requires one fresh
      // base before retrying. Later polling never silently rebases that draft.
      if (rebase && active.current && authorized.current && readback.current === controller) setReview('needed')
    }
    finally { window.clearTimeout(timeout); if (readback.current === controller) readback.current = null }
  }

  async function save(): Promise<boolean> {
    if (request.current || disabled || !allowed || invalidPending || !pending && (!ready || !changed || review !== 'none')) return false
    if (!pending && name.trim().length > 80) { setError('Nome deve ter até 80 caracteres.'); return false }
    const body: NameChange = pending ?? { operationId: crypto.randomUUID(), name: name.trim(), expectedVersion: editingVersion! }
    setError(''); setMessage('')
    try { setPending(JSON.stringify(body)) }
    catch { setError('Não foi possível guardar a alteração do nome. Libere o armazenamento antes de tentar novamente.'); return false }
    readback.current?.abort()
    const controller = new AbortController(); request.current = controller; setBusy(true)
    const timeout = window.setTimeout(() => controller.abort(new ApiError(0, 'A confirmação do nome demorou. O nome foi preservado para conferência.')), tabNameRequestTimeout)
    try {
      const result = await apiFetch<Tab>(`/api/v1/bar/tabs/${tab.id}/name`, { method: 'PUT', body: JSON.stringify(body), signal: controller.signal })
      if (!active.current || !authorized.current) return false
      await cache.cancelQueries({ queryKey: detailKey, exact: true })
      if (!active.current || !authorized.current) return false
      // The write receipt omits supervisor capabilities/costs. Only project this
      // rename onto its exact base; otherwise read an authorized, current snapshot.
      let needsRefresh = true
      cache.setQueryData<Tab>(detailKey, current => {
        if (current?.version === body.expectedVersion && result.version === body.expectedVersion + 1) {
          needsRefresh = false
          return { ...current, name: result.name, version: result.version, history: result.history }
        }
        if (current?.version === result.version && current?.name === result.name) needsRefresh = false
        return current
      })
      if (needsRefresh) void refreshDetails()
      // The response confirms the write; slow follow-up reads must not hold the editor busy.
      void cache.invalidateQueries({ queryKey: ['bar-runtime', user?.id], predicate: query => query.queryKey[2] !== `/tabs/${tab.id}` })
      void cache.invalidateQueries({ queryKey: ['bar'] })
      try { setPending('') }
      catch { setError('O nome foi confirmado, mas a conferência continua guardada neste navegador. Repita a confirmação antes de alterar o nome novamente.'); return false }
      setEditing(false); setMessage('Alteração do nome confirmada.')
      return true
    } catch (cause) {
      if (!active.current || !authorized.current) return false
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível confirmar o nome. A alteração foi preservada; confira a conexão e tente novamente.')
      if (cause instanceof ApiError && [400, 401, 403, 404, 409, 422].includes(cause.status)) {
        try { setPending('') }
        catch { setError('Não foi possível liberar a conferência do nome. Repita a confirmação antes de alterar os dados.'); return false }
        if (cause.status === 409) { setReview('loading'); void refreshDetails(true) }
        else void refreshDetails()
      }
      return false
    } finally {
      window.clearTimeout(timeout)
      if (request.current === controller) request.current = null
      if (active.current) setBusy(false)
    }
  }

  function startEditing(draftName?: string) {
    stopReading(); setName(draftName ?? editableName(tab)); setEditingVersion(tab.version)
    setReview('none'); setError(''); setMessage(''); setEditing(true)
  }
  function changeName(value: string) { setName(value); setError('') }
  function cancel() { stopReading(); setReview('none'); setEditing(false) }
  function refreshForReview() { setReview('loading'); void refreshDetails(true) }

  return {
    disabled, allowed, ready, editing, name, pending, invalidPending, review,
    busy, error, message, changed, hasName: Boolean(editableName(tab).trim()),
    startEditing, changeName, save, cancel, refreshForReview,
  }
}

export type TabNameEditorController = ReturnType<typeof useTabNameEditor>
