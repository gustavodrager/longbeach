import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiFetch, ApiError } from '../../lib/http'
import { useAuth } from '../auth/authContext'
import { hasPermission, hasStaffAction, hasStaffMenu } from '../auth/access'
import { CustomerPicker } from '../customers/CustomerPicker'
import type { CustomerSelection } from '../customers/api'
import { useConfirmationGate } from './Core'
import { Feedback } from './components'
import { useBarCommand, type Tab } from './api'
import { tabCustomerName } from './tabTitle'
import { TabNameEditorView } from './TabNameEditor'
import { useTabNameEditor } from './useTabNameEditor'

type Identification = { operationId: string; customerId: string | null; expectedVersion: number }
function restore(raw: string): Identification | null {
  try {
    const value = JSON.parse(raw) as Identification
    return value && typeof value.operationId === 'string' && (value.customerId === null || typeof value.customerId === 'string') && Number.isInteger(value.expectedVersion) ? value : null
  } catch { return null }
}

export function TabCustomerIdentification({ tab, disabled = false, inline = false }: { tab: Tab; disabled?: boolean; inline?: boolean }) {
  const { user } = useAuth()
  return <IdentificationForm key={`${user?.id}:${tab.id}`} tab={tab} disabled={disabled} inline={inline} />
}

function IdentificationForm({ tab, disabled, inline }: { tab: Tab; disabled: boolean; inline: boolean }) {
  const { user } = useAuth()
  const [raw, setPending] = useConfirmationGate(`tab-customer:${user?.id}:${tab.id}`)
  const pending = restore(raw)
  const [editing, setEditing] = useState(Boolean(pending))
  const [selected, setSelected] = useState<CustomerSelection | null>(tab.customer ?? null)
  const [intent, setIntent] = useState<'name' | 'customer'>('customer')
  const [creatingCustomer, setCreatingCustomer] = useState(false)
  const cache = useQueryClient()
  const command = useBarCommand()
  // Both entry points share one durable name intent for this operator and tab.
  const nameEditor = useTabNameEditor(tab, disabled || command.busy)
  const request = useRef(false)
  const allowed = hasPermission(user, 'bar:sales:operate') && ['bar.sell', 'bar.tabs'].some(menu => hasStaffMenu(user, menu) && hasStaffAction(user, menu))
  const ready = allowed && tab.state === 'Open' && tab.pending === 0 && Number.isInteger(tab.version)
  const changed = (selected?.id ?? null) !== (tab.customer?.id ?? null)
  const naming = intent === 'name' && !pending
  const validName = nameEditor.name.trim().length >= 1 && nameEditor.name.trim().length <= 80
  const busy = command.busy || nameEditor.busy
  const canSave = !disabled && !busy && allowed && !creatingCustomer && (naming
    ? !nameEditor.invalidPending && (Boolean(nameEditor.pending) || nameEditor.ready && validName && nameEditor.changed && nameEditor.review === 'none')
    : Boolean(pending) || !nameEditor.pending && !nameEditor.invalidPending && ready && changed)

  function begin() {
    if (disabled || busy || nameEditor.editing) return
    nameEditor.startEditing('')
    setSelected(tab.customer ?? null); setIntent('customer'); setCreatingCustomer(false)
    command.setError(''); command.setMessage(''); setEditing(true)
  }

  function selectCustomer(value: CustomerSelection | null) {
    setSelected(value); setIntent('customer'); nameEditor.changeName('')
    command.setError(''); command.setMessage('')
  }

  function changeName(value: string) {
    setIntent('name'); nameEditor.changeName(value)
    command.setError(''); command.setMessage('')
  }

  async function save() {
    if (request.current || !canSave) return
    if (naming) {
      if (await nameEditor.save()) setEditing(false)
      return
    }
    const body: Identification = pending ?? { operationId: crypto.randomUUID(), customerId: selected?.id ?? null, expectedVersion: tab.version! }
    request.current = true
    try {
      try { setPending(JSON.stringify(body)) } catch { command.setError('Não foi possível preservar esta confirmação. Libere o armazenamento antes de continuar.'); return }
      const result = await command.run(() => apiFetch<Tab>(`/api/v1/bar/tabs/${tab.id}/customer`, { method: 'PUT', body: JSON.stringify(body) }))
      if (result.ok) {
        setPending('')
        if (!nameEditor.pending && !nameEditor.invalidPending) nameEditor.cancel()
        setEditing(false); command.setMessage('Identificação atualizada. O responsável financeiro permanece o mesmo.')
      }
      else if (result.error instanceof ApiError && [400, 401, 403, 404, 409, 422].includes(result.error.status)) {
        setPending('')
        await cache.invalidateQueries({ queryKey: ['bar-runtime'] })
      }
    } finally { request.current = false }
  }
  const nameView = !editing || !naming && (nameEditor.pending || nameEditor.invalidPending)
    ? <TabNameEditorView controller={nameEditor} blocked={editing || command.busy} /> : null
  if (!inline && tabCustomerName(tab) && !editing && !pending && !command.message && !command.error) return nameView
  const trigger = nameEditor.ready && !editing && <button type="button" className="ux-button secondary" disabled={disabled || busy || nameEditor.editing} onClick={begin}>{tabCustomerName(tab) ? 'Alterar identificação' : 'Identificar comanda'}</button>
  const form = editing && allowed && <>
    <Feedback error={naming ? nameEditor.error : command.error} message={naming ? nameEditor.message : command.message} />
    <p className="ux-note">A identificação cadastral não concede acesso à comanda nem altera quem responde pelo pagamento.</p>
    {pending ? <p role="status">A identificação aguarda confirmação. Repita os mesmos dados antes de trocar o cliente.</p> : <CustomerPicker scope="bar" contextKey={`tab-identify:${tab.id}`} label="Cliente da comanda" value={selected} onChange={selectCustomer} disabled={disabled || busy || Boolean(nameEditor.pending) || nameEditor.invalidPending} freeText={{ value: nameEditor.pending?.name ?? nameEditor.name, onChange: changeName, onSubmit: () => void save(), onCreatingChange: setCreatingCustomer }} />}
    {naming && nameEditor.pending && <p role="status">A alteração do nome aguarda confirmação. Confira os mesmos dados antes de editar novamente. O atendimento pode continuar.</p>}
    {naming && nameEditor.review === 'loading' && <p role="status">Atualizando a comanda para conferir o nome…</p>}
    {naming && nameEditor.review === 'needed' && <p role="status">Atualize os dados da comanda antes de confirmar este nome novamente. <button type="button" className="ux-button secondary" disabled={disabled || busy} onClick={nameEditor.refreshForReview}>Atualizar comanda</button></p>}
    {tab.pending > 0 && <p className="ux-note">Você pode salvar um nome livre. Para alterar o vínculo com um cliente cadastrado, aguarde a confirmação dos pagamentos pendentes.</p>}
    <div className="ux-actions"><button type="button" className="ux-button primary" disabled={!canSave} onClick={() => void save()}>{busy ? 'Salvando identificação…' : pending || naming && nameEditor.pending ? 'Conferir identificação' : 'Salvar identificação'}</button>{!pending && !nameEditor.pending && <button type="button" className="ux-button secondary" disabled={busy} onClick={() => { nameEditor.cancel(); setEditing(false) }}>Voltar</button>}</div>
  </>
  return <>
    {nameView}
    {inline ? <>
      {!editing && <Feedback {...command} />}{trigger}
      {editing && allowed && <section className="ux-panel lb-customer-identification" aria-label="Identificação do cliente"><h2>Identificação da comanda</h2>{form}</section>}
    </> : <section className="ux-panel lb-customer-identification" aria-label="Identificação do cliente">
      <h2>Cliente identificado</h2><p>{tabCustomerName(tab) || 'Atendimento sem cliente identificado'}</p>
      {tab.customer?.incomplete && <p className="ux-note">Telefone pendente no cadastro anterior. O atendimento continua disponível.</p>}
      {!editing && <Feedback {...command} />}{trigger}{form}
    </section>}
  </>
}
