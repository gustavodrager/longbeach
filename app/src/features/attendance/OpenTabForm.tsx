import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../../lib/http'
import { useAuth } from '../auth/authContext'
import { LoadState, useConfirmationGate } from './Core'
import { Feedback, Icon } from './components'
import { postBar, useBarCommand, useBarData, type Named, type Tab, type TabCustomer } from './api'
import { barLocation } from './serviceLocation'

type Opening = { operationId: string; locationId: string; name: string; mode: 'Tab'; responsibleUserId?: string }
function restore(value: string): Opening | null {
  try {
    const row = JSON.parse(value) as Opening
    return row && typeof row.operationId === 'string' && typeof row.locationId === 'string' && typeof row.name === 'string' && row.mode === 'Tab' && (row.responsibleUserId === undefined || typeof row.responsibleUserId === 'string') ? row : null
  } catch { return null }
}

export function OpenTabForm() {
  const { user } = useAuth()
  const [saved, setSaved] = useConfirmationGate(`open-tab:${user?.id}`)
  const pending = restore(saved)
  const [opening, setOpening] = useState(Boolean(pending))
  const [kind, setKind] = useState<'visitor' | 'customer'>('visitor')
  const [name, setName] = useState('')
  const [search, setSearch] = useState('')
  const [submittedSearch, setSubmittedSearch] = useState('')
  const [customer, setCustomer] = useState<TabCustomer | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const locations = useBarData<Named[]>('/tabs/locations', opening && !pending)
  const customers = useBarData<TabCustomer[]>(`/tabs/customers?search=${encodeURIComponent(submittedSearch)}`, opening && kind === 'customer' && submittedSearch.length >= 3 && !pending)
  const location = barLocation(locations.data)?.id
  const openingRequest = useRef(false)
  const command = useBarCommand()
  const navigate = useNavigate()
  const locked = command.busy || Boolean(pending)

  async function open() {
    if (openingRequest.current) return
    if (!pending && (!location || locations.isError || (kind === 'customer' && (!customer || !confirmed)))) return
    openingRequest.current = true
    const input: Opening = pending ?? { operationId: crypto.randomUUID(), locationId: location!, name: name.trim() || (kind === 'customer' ? customer!.name.slice(0, 80) : ''), mode: 'Tab', ...(kind === 'customer' ? { responsibleUserId: customer!.id } : {}) }
    setSaved(JSON.stringify(input))
    const result = await command.run(() => postBar<Tab>('/tabs', input))
    openingRequest.current = false
    if (result.ok) { setSaved(''); navigate(`/atendimento/comandas/${result.value.id}`) }
    else if (result.error instanceof ApiError && [400, 422].includes(result.error.status)) setSaved('')
  }

  return <>
    {!opening && <button className="ux-button primary" onClick={() => setOpening(true)}><Icon name="plus" />Abrir comanda</button>}
    <Feedback {...command} />
    {opening && <form className="ux-panel" onSubmit={event => { event.preventDefault(); void open() }}>
      <h2>Nova comanda</h2>
      {pending ? <p className="ux-notice warning" role="status">{command.busy ? `Abrindo a comanda de ${pending.name || 'Visitante'}… Aguarde a confirmação.` : `Estamos conferindo a abertura de ${pending.name || 'Visitante'}. Repita a confirmação para recuperar a mesma comanda. Os dados ficam preservados até a resposta.`}</p> : <>
        <fieldset disabled={locked}>
          <legend>Para quem é a comanda?</legend>
          <label className="ux-check"><input type="radio" name="tab-kind" checked={kind === 'visitor'} onChange={() => { setKind('visitor'); setConfirmed(false) }} />Visitante sem cadastro</label>
          <label className="ux-check"><input type="radio" name="tab-kind" checked={kind === 'customer'} onChange={() => { setKind('customer'); setConfirmed(false) }} />Cliente cadastrado</label>
        </fieldset>
        {kind === 'customer' && <section aria-label="Escolher responsável">
          <label className="ux-field">Buscar responsável<input value={search} maxLength={320} disabled={locked} placeholder="Nome ou e-mail completo" onChange={event => { setSearch(event.target.value); setSubmittedSearch(''); setCustomer(null); setConfirmed(false) }} /></label>
          <button type="button" className="ux-button secondary" disabled={locked || search.trim().length < 3} onClick={() => { setSubmittedSearch(search.trim()); setCustomer(null); setConfirmed(false) }}>Buscar cliente</button>
          <p className="ux-note">Digite ao menos 3 letras do nome ou o e-mail completo. Só aparecem pessoas que já entraram com o Google.</p>
          {submittedSearch && <><LoadState query={customers} />{!customers.isError && customers.data?.map(person => <label className="ux-check" key={person.id}><input type="radio" name="tab-customer" value={person.id} checked={customer?.id === person.id} disabled={locked} onChange={() => { setCustomer(person); setConfirmed(false) }} />{person.name} · {person.emailHint}</label>)}
            {!customers.isError && customers.data?.length === 0 && <p role="status">Nenhum cliente encontrado. Confira o e-mail completo ou abra como visitante.</p>}
            {customers.data?.length === 20 && <p>Mostrando até 20 pessoas. Refine a busca para identificar o responsável.</p>}
          </>}
          {customer && <label className="ux-check"><input type="checkbox" checked={confirmed} disabled={locked} onChange={event => setConfirmed(event.target.checked)} />Confirmo que {customer.name} é o responsável e poderá ver o consumo e os pagamentos desta comanda na sua área.</label>}
        </section>}
        <label className="ux-field">Nome da pessoa ou do grupo (opcional)<input value={name} maxLength={80} disabled={locked} onChange={event => setName(event.target.value)} placeholder={customer && kind === 'customer' ? customer.name : 'Ex.: Visitante ou Turma de quinta'} /></label>
        <p className="ux-note">Para uma comanda coletiva, informe o nome do grupo. O responsável selecionado responde pelo total; os demais integrantes não recebem acesso automaticamente. O consumo fica separado da mensalidade da quadra.</p>
        {kind === 'visitor' && <p className="ux-note">Sem vínculo automático à área de um cliente. A equipe poderá fornecer o QR desta comanda.</p>}
        <LoadState query={locations} />
        {!locations.isLoading && !locations.isError && !location && <p role="alert">Peça à gestão para conferir o cadastro do local Bar.</p>}
      </>}
      <div className="ux-actions">
        <button className="ux-button primary" disabled={command.busy || (!pending && (!location || locations.isError || (kind === 'customer' && (!customer || !confirmed))))}>{pending ? 'Conferir abertura' : kind === 'customer' ? 'Abrir comanda vinculada' : 'Abrir sem cadastro'}</button>
        {!pending && <button type="button" className="ux-button secondary" disabled={command.busy} onClick={() => setOpening(false)}>Voltar</button>}
      </div>
    </form>}
  </>
}
