import { useEffect, useRef, useState, type FormEvent } from 'react'
import { EditorPanel, useUnsavedChanges } from '../../components/managementUi'
import { SaveRow } from '../../pages/arenaUi'
import { ApiError } from '../../lib/http'
import { staffAccessCommand, staffError, type StaffAccessStatus, type StaffMemberResult } from './api'

type Action = 'reset' | 'block' | 'reactivate'
const titles: Record<Action, string> = { reset: 'Gerar senha inicial', block: 'Bloquear acesso', reactivate: 'Reativar acesso' }
export function StaffAccountActions({ status, onResult, onRefresh, onClose }: { status: StaffAccessStatus; onResult: (result: StaffMemberResult | StaffAccessStatus) => Promise<void>; onRefresh: () => Promise<unknown>; onClose: () => void }) {
  const [action, setAction] = useState<Action | null>(null)
  if (!status.userId || status.isOwner) return null
  return <>
    <div className="form-actions">
      <button type="button" className="secondary-link" disabled={!status.isActive} onClick={() => setAction('reset')}>Gerar senha inicial</button>
      <button type="button" className="text-button" onClick={() => setAction(status.isActive ? 'block' : 'reactivate')}>{status.isActive ? 'Bloquear acesso' : 'Reativar acesso'}</button>
    </div>
    {!status.isActive && <p className="arena-hint">Reative o acesso antes de gerar uma nova senha inicial.</p>}
    {action && <StaffAccessCommand key={action} action={action} status={status} onRefresh={onRefresh} onClose={() => setAction(null)} onResult={async result => { setAction(null); onClose(); await onResult(result) }} />}
  </>
}
function StaffAccessCommand({ action, status, onResult, onRefresh, onClose }: { action: Action; status: StaffAccessStatus; onResult: (result: StaffMemberResult | StaffAccessStatus) => Promise<void>; onRefresh: () => Promise<unknown>; onClose: () => void }) {
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const [conflict, setConflict] = useState(false)
  const command = useRef({ operationId: crypto.randomUUID(), version: status.version, teamId: status.teamId })
  const locked = useRef(false)
  const mounted = useRef(true)
  const { markSaved } = useUnsavedChanges()
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!confirmed || locked.current || conflict) return
    locked.current = true; setBusy(true); setError('')
    try {
      const result = await staffAccessCommand(command.current.teamId, action, command.current.version, command.current.operationId)
      if (mounted.current) { markSaved(); await onResult(result) }
    } catch (cause) {
      if (mounted.current) { setError(staffError(cause)); setConflict(cause instanceof ApiError && cause.status === 409); setUncertain(!(cause instanceof ApiError) || cause.status === 0 || cause.status >= 500) }
    } finally { locked.current = false; if (mounted.current) setBusy(false) }
  }
  async function refresh() {
    if (locked.current) return
    locked.current = true; setBusy(true)
    try { await onRefresh(); if (mounted.current) { markSaved(); onClose() } }
    catch (cause) { if (mounted.current) setError(staffError(cause)) }
    finally { locked.current = false; if (mounted.current) setBusy(false) }
  }
  return <EditorPanel title={titles[action]} busy={busy} onClose={onClose} className="staff-account-action"><form className="operation-form" onSubmit={submit}>
    <p>{action === 'reset' ? 'As sessões atuais serão encerradas. A pessoa deverá definir uma nova senha usando o acesso temporário.' : action === 'block' ? 'A conta perderá o acesso ao sistema e suas sessões serão encerradas.' : 'O acesso será reativado. As sessões encerradas continuam inválidas.'}</p>
    <label className="staff-access-check"><input type="checkbox" required checked={confirmed} disabled={busy || uncertain || conflict} onChange={event => setConfirmed(event.target.checked)} />{action === 'reset' ? 'Conferi a identidade e a entrega do acesso à pessoa.' : 'Conferi a pessoa e esta alteração de acesso.'}</label>
    {error && <p role="alert" className="arena-message arena-error">{error}</p>}
    {uncertain && <p role="status">Reenvie a mesma solicitação para conferir. Uma nova senha não será gerada silenciosamente.</p>}
    {conflict && <><p role="status">O acesso mudou. Atualize a ficha e confira a situação antes de continuar.</p><button type="button" className="secondary-link" disabled={busy} onClick={() => void refresh()}>Atualizar ficha</button></>}
    <SaveRow busy={busy} disabled={!confirmed || conflict} onCancel={onClose} label={uncertain ? 'Conferir mesma solicitação' : titles[action]} />
  </form></EditorPanel>
}
