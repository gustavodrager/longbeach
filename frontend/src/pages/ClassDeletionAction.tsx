import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { EditorPanel } from '../components/managementUi'
import type { ArenaClass } from '../features/arena/types'
import { useOperations } from '../features/operations/DemoDataProvider'

export function ClassDeletionNotice() {
  const location = useLocation()
  return location.state?.classDeleted === true ? <p className="arena-message" role="status">Turma excluída.</p> : null
}

export function ClassDeletionAction({ lesson, returnTo, returnState }: { lesson: ArenaClass; returnTo: string; returnState?: Record<string, unknown> }) {
  const data = useOperations()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<ArenaClass | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [online, setOnline] = useState(() => navigator.onLine !== false)
  const locked = useRef(false)
  const cancel = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false)
    window.addEventListener('online', update); window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  useEffect(() => { if (selected) cancel.current?.focus() }, [selected])
  const unavailable = busy || data.saving || !online || data.persistenceStatus !== 'connected' || data.refreshFailed
  const close = () => { if (!locked.current) { setSelected(null); setError('') } }
  async function remove() {
    if (!selected || locked.current || unavailable) return
    locked.current = true; setBusy(true); setError('')
    try {
      await data.deleteClass(selected.id, selected.version ?? 0)
      navigate(returnTo, { replace: true, state: { ...returnState, restoreList: true, classDeleted: true } })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível excluir a turma. Tente novamente.')
    } finally { locked.current = false; setBusy(false) }
  }
  if (!data.canDeleteClass) return null
  return <>
    <button type="button" className="text-button" disabled={unavailable} onClick={() => { setError(''); setSelected({ ...lesson }) }}>Excluir turma</button>
    {selected && <EditorPanel title="Excluir turma?" className="arena-entry-editor" busy={busy} onClose={close}>
      <p><strong>{selected.name}</strong></p>
      <p>A turma será removida da lista e da agenda. Esta ação não pode ser desfeita.</p>
      <p className="arena-hint">Turmas com alunos ou histórico devem ser encerradas.</p>
      {error && <p className="arena-message arena-error" role="alert">{error}</p>}
      {busy && <p role="status">Excluindo turma…</p>}
      <div className="form-actions">
        <button ref={cancel} type="button" className="secondary-link" disabled={busy} onClick={close}>Cancelar</button>
        <button type="button" className="primary-button" disabled={unavailable} onClick={() => void remove()}>{busy ? 'Excluindo…' : 'Excluir definitivamente'}</button>
      </div>
    </EditorPanel>}
  </>
}
