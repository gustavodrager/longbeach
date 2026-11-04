import { CustomerPicker } from '../customers/CustomerPicker'
import type { CustomerSelection } from '../customers/api'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../../lib/http'
import { useAuth } from '../auth/authContext'
import { hasPermission, hasStaffAction, hasStaffMenu, workHome } from '../auth/access'
import { LoadState, useConfirmationGate } from './Core'
import { Feedback, Icon } from './components'
import { postBar, useBarCommand, useBarData, type Named, type Tab, type TabCustomer } from './api'
import { barLocation } from './serviceLocation'

type Opening = { operationId: string; locationId: string; name: string; mode: 'Tab'; notes?: string; customerId?: string; responsibleUserId?: string; addProducts?: boolean }
function restore(value: string): Opening | null {
  try {
    const row = JSON.parse(value) as Opening
    return row && typeof row.operationId === 'string' && typeof row.locationId === 'string' && typeof row.name === 'string' && row.mode === 'Tab' && (row.responsibleUserId === undefined || typeof row.responsibleUserId === 'string') && (row.customerId === undefined || typeof row.customerId === 'string') ? row : null
  } catch { return null }
}

export function OpenTabForm() {
  const { user } = useAuth()
  const canSell = hasPermission(user, 'bar:sales:operate') && hasStaffMenu(user, 'bar.sell') && hasStaffAction(user, 'bar.sell')
  const canOpen = canSell || hasPermission(user, 'bar:sales:operate') && hasStaffMenu(user, 'bar.tabs') && hasStaffAction(user, 'bar.tabs')
  const [saved, setSaved] = useConfirmationGate(`open-tab:${user?.id}`)
  const pending = restore(saved)
  const [opening, setOpening] = useState(Boolean(pending))
  const [kind, setKind] = useState<'visitor' | 'customer'>('visitor')
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [search, setSearch] = useState('')
  const [submittedSearch, setSubmittedSearch] = useState('')
  const [customer, setCustomer] = useState<TabCustomer | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [identifiedCustomer, setIdentifiedCustomer] = useState<CustomerSelection | null>(null)
  const locations = useBarData<Named[]>('/tabs/locations', canOpen && opening && !pending)
  const customers = useBarData<TabCustomer[]>(`/tabs/customers?search=${encodeURIComponent(submittedSearch)}`, canOpen && opening && kind === 'customer' && submittedSearch.length >= 3 && !pending)
  const location = barLocation(locations.data)?.id
  const hasPending = Boolean(pending)
  useEffect(() => {
    if (!canOpen || !opening || kind !== 'customer' || hasPending) return
    const timer = window.setTimeout(() => setSubmittedSearch(search.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [canOpen, opening, kind, search, hasPending])
  const openingRequest = useRef(false)
  const command = useBarCommand()
  const navigate = useNavigate()
  const locked = command.busy || Boolean(pending)

  async function open(addProducts = false) {
    if (openingRequest.current || !canOpen || addProducts && !canSell) return
    if (!pending && (!location || locations.isError || (kind === 'customer' && (!customer || !confirmed)))) return
    openingRequest.current = true
    const input: Opening = pending ?? { addProducts, operationId: crypto.randomUUID(), locationId: location!, name: name.trim() || (kind === 'customer' ? customer!.name.slice(0, 80) : ''), mode: 'Tab', ...(notes.trim() ? { notes: notes.trim() } : {}), ...(identifiedCustomer ? {customerId:identifiedCustomer.id} : {}), ...(kind === 'customer' ? { responsibleUserId: customer!.id } : {}) }
    setSaved(JSON.stringify(input))
    const result = await command.run(() => postBar<Tab>('/tabs', { ...input, addProducts: undefined }))
    openingRequest.current = false
    if (result.ok) { setSaved(''); navigate(input.addProducts && canSell || !hasStaffMenu(user, 'bar.tabs') && canSell ? `/atendimento/vender?comanda=${result.value.id}` : hasStaffMenu(user, 'bar.tabs') ? `/atendimento/comandas/${result.value.id}` : workHome(user)) }
    else if (result.error instanceof ApiError && [400, 422].includes(result.error.status)) setSaved('')
  }

  if (!canOpen) return null
  return <>
    {!opening && <button className="ux-button primary" onClick={() => setOpening(true)}><Icon name="plus" />Abrir comanda</button>}
    <Feedback {...command} />
    {opening && <form className="ux-panel lb-open-tab" onSubmit={event => { event.preventDefault(); void open() }}>
      <h2>Nova comanda</h2>
      {pending ? <p className="ux-notice warning" role="status">{command.busy ? `Abrindo a comanda de ${pending.name || 'Visitante'}… Aguarde a confirmação.` : `Estamos conferindo a abertura de ${pending.name || 'Visitante'}. Repita a confirmação para recuperar a mesma comanda. Os dados ficam preservados até a resposta.`}</p> : <>
        <CustomerPicker compact scope="bar" contextKey="bar-tab:new" label="Cliente identificado" value={identifiedCustomer} onChange={setIdentifiedCustomer} disabled={locked} />
        <details className="lb-tab-options"><summary>{kind === 'customer' ? `Acesso à comanda · ${customer?.name || 'escolher responsável'}` : 'Acesso à comanda (opcional)'}</summary>
        <fieldset disabled={locked}>
          <legend>Responsável com acesso</legend>
          <label className="ux-check"><input type="radio" name="tab-kind" checked={kind === 'visitor'} onChange={() => { setKind('visitor'); setConfirmed(false) }} />Sem responsável financeiro vinculado</label>
          <label className="ux-check"><input type="radio" name="tab-kind" checked={kind === 'customer'} onChange={() => { setKind('customer'); setConfirmed(false) }} />Vincular responsável com conta</label>
        </fieldset>
        {kind === 'customer' && <section aria-label="Escolher responsável">
          <label className="ux-field">Buscar responsável<input value={search} maxLength={320} disabled={locked} placeholder="Nome, usuário ou e-mail completo" onChange={event => { setSearch(event.target.value); setSubmittedSearch(''); setCustomer(null); setConfirmed(false) }} /></label>

          {submittedSearch && <><LoadState query={customers} />{!customers.isError && customers.data?.map(person => <label className="ux-check" key={person.id}><input type="radio" name="tab-customer" value={person.id} checked={customer?.id === person.id} disabled={locked} onChange={() => { setCustomer(person); setConfirmed(false) }} />{person.name} · {person.emailHint}</label>)}
            {!customers.isError && customers.data?.length === 0 && <p role="status">Nenhuma conta encontrada. Confira a busca ou abra sem responsável.</p>}
            {customers.data?.length === 20 && <p>Mostrando até 20 pessoas. Refine a busca para identificar o responsável.</p>}
          </>}
        </section>}
        </details>
        {kind === 'customer' && customer && <label className="ux-check"><input type="checkbox" checked={confirmed} disabled={locked} onChange={event => setConfirmed(event.target.checked)} />Confirmo que {customer.name} responde pelo total e poderá ver o consumo e os pagamentos desta comanda na sua área.</label>}
        <label className="ux-field">Nome da pessoa ou do grupo (opcional)<input value={name} maxLength={80} disabled={locked} onChange={event => setName(event.target.value)} placeholder={customer && kind === 'customer' ? customer.name : 'Ex.: Visitante ou Turma de quinta'} /></label>
        <details className="lb-tab-options"><summary>Observações</summary><label className="ux-field">Observações da comanda (opcional)<textarea value={notes} maxLength={500} disabled={locked} onChange={event => setNotes(event.target.value)} placeholder="Ex.: Mesa 3, perto da quadra" /></label>
        <p className="ux-note">Os demais integrantes não recebem acesso à comanda. O consumo é separado da mensalidade da quadra.</p>
        {kind === 'visitor' && <p className="ux-note">Sem vínculo automático à área de um cliente. A equipe poderá fornecer o QR desta comanda.</p>}
        </details><LoadState query={locations} />
        {!locations.isLoading && !locations.isError && !location && <p role="alert">Peça à gestão para conferir o cadastro do local Bar.</p>}
      </>}
      <div className="ux-actions">
        {!pending && canSell && <button type="button" className="ux-button primary" disabled={command.busy || !location || locations.isError || (kind === 'customer' && (!customer || !confirmed))} onClick={() => void open(true)}>Abrir e adicionar produtos</button>}
        <button className="ux-button secondary" disabled={command.busy || (!pending && (!location || locations.isError || (kind === 'customer' && (!customer || !confirmed))))}>{pending ? 'Conferir abertura' : kind === 'customer' ? 'Abrir comanda vinculada' : 'Abrir sem vínculo financeiro'}</button>
        {!pending && <button type="button" className="ux-button secondary" disabled={command.busy} onClick={() => setOpening(false)}>Voltar</button>}
      </div>
    </form>}
  </>
}
