import { useAuth } from '../auth/authContext'
import { Feedback } from './components'
import type { Tab } from './api'
import { useTabNameEditor, type TabNameEditorController } from './useTabNameEditor'

export { tabNameRequestTimeout } from './useTabNameEditor'
export type { TabNameEditorController } from './useTabNameEditor'

/** Naming a tab does not create a customer, grant access or change its balance. */
export function TabNameEditor({ tab, disabled = false }: { tab: Tab; disabled?: boolean }) {
  const { user } = useAuth()
  return <NameForm key={`${user?.id}:${tab.id}`} tab={tab} disabled={disabled} />
}

function NameForm({ tab, disabled }: { tab: Tab; disabled: boolean }) {
  const controller = useTabNameEditor(tab, disabled)
  return <TabNameEditorView controller={controller} />
}

export function TabNameEditorView({ controller, disabled = controller.disabled, blocked = false }: {
  controller: TabNameEditorController; disabled?: boolean; blocked?: boolean
}) {
  const { allowed, ready, editing, name, pending, invalidPending, review,
    busy, error, message, changed, hasName, startEditing, changeName, save, cancel, refreshForReview } = controller

  if (!allowed || !ready && !pending && !invalidPending && !editing && !message && !error) return null
  return <>
    {!editing && <Feedback error={error} message={message} />}
    {!editing && ready && <button type="button" className="ux-button secondary" disabled={disabled || busy || blocked} onClick={() => startEditing()}>{hasName ? 'Editar nome' : 'Adicionar nome'}</button>}
    {editing && <section className="ux-panel lb-customer-identification" aria-label="Nome da comanda">
      <h2>Nome da comanda</h2>
      <Feedback error={error} message={message} />
      {invalidPending ? <p className="ux-notice error" role="alert">Não foi possível ler uma alteração de nome pendente. Peça à gestão para conferir. As outras operações da comanda continuam disponíveis.</p> : <>
        <label className="ux-field">Nome do cliente ou grupo (opcional)<input autoFocus maxLength={80} autoComplete="off" value={pending?.name ?? name} disabled={disabled || busy || Boolean(pending)} onChange={event => changeName(event.target.value)} placeholder="Ex.: Gabriel ou Turma de quinta" onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void save() } }} /></label>
        <p className="ux-note">Use um nome ou grupo para localizar esta comanda. Deixe vazio para remover o nome.</p>
        {pending && <p role="status">A alteração do nome aguarda confirmação. Confira os mesmos dados antes de editar novamente. O atendimento pode continuar.</p>}
        {review === 'loading' && <p role="status">Atualizando a comanda para conferir o nome…</p>}
        {review === 'needed' && <p role="status">Atualize os dados da comanda antes de confirmar este nome novamente. <button type="button" className="ux-button secondary" disabled={disabled || busy} onClick={refreshForReview}>Atualizar comanda</button></p>}
        <div className="ux-actions"><button type="button" className="ux-button primary" disabled={disabled || busy || !pending && (!ready || !changed || review !== 'none')} onClick={() => void save()}>{busy ? 'Salvando nome…' : pending ? 'Conferir nome' : 'Salvar nome'}</button>{!pending && <button type="button" className="ux-button secondary" disabled={busy} onClick={cancel}>Voltar</button>}</div>
      </>}
    </section>}
  </>
}
