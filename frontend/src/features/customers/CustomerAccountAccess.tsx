import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../lib/http'
import { useAuth } from '../auth/authContext'
import { AccessQr } from '../attendance/AccessQr'
import { useCustomerCommand, type Customer } from './api'

type AccountStatus = { status: 'Pending' | 'Invited' | 'Active' | 'Guardian' | 'Blocked' | 'FirstAccess'; userId: string | null; username: string | null; googleLinked: boolean; localPasswordEnabled: boolean; invitationExpiresAtUtc: string | null }
type IssuedAccess = { token: string; expiresAtUtc: string; purpose: 'Activation' | 'Recovery' }
type Guardian = { customerId: string; userId: string; name: string; emailHint: string; isGranted: boolean; version: number }
type Candidate = { id: string; name: string; emailHint: string }
const labels: Record<AccountStatus['status'], string> = { Pending: 'Aguardando ativação', Invited: 'Convite pendente', Active: 'Ativa', Guardian: 'Acesso pelo responsável', Blocked: 'Bloqueado', FirstAccess: 'Primeiro acesso pendente' }
export function CustomerAccountAccess({ customer, refresh }: { customer: Customer; refresh?: () => void }) {
  const { user } = useAuth()
  const status = useQuery({ queryKey: ['customer-access', user?.id, customer.id, customer.version], queryFn: ({ signal }) => apiFetch<AccountStatus>(`/api/v1/customers/${customer.id}/access`, { signal }), retry: false, staleTime: 0 })
  const command = useCustomerCommand()
  const [confirmed, setConfirmed] = useState(false)
  const [issued, setIssued] = useState<IssuedAccess | null>(null)
  const [copyMessage, setCopyMessage] = useState('')
  const currentVersion = useRef(customer.version)
  useEffect(() => {
    setConfirmed(false)
    if (currentVersion.current !== customer.version) { setIssued(null); setCopyMessage(''); currentVersion.current = customer.version; command.resetError() }
  }, [customer.version, command.resetError])
  useEffect(() => {
    if (!issued) return
    const remaining = Date.parse(issued.expiresAtUtc) - Date.now()
    if (remaining <= 0) { setIssued(null); return }
    const timeout = window.setTimeout(() => { setIssued(null); setCopyMessage('O link expirou.'); void status.refetch() }, Math.min(remaining, 2_147_483_647))
    return () => window.clearTimeout(timeout)
  }, [issued, status.refetch])
  const value = status.data && labels[status.data.status] ? status.data : null
  const link = issued ? `${window.location.origin}/${issued.purpose === 'Recovery' ? 'recuperar-acesso' : 'ativar'}#token=${encodeURIComponent(issued.token)}` : ''
  async function issue(recovery: boolean) {
    if (!confirmed || command.busy || !value) return
    setIssued(null); setCopyMessage('')
    const result = await command.run(() => apiFetch<IssuedAccess>(`/api/v1/customers/${customer.id}/access/${recovery ? 'recovery' : 'invitations'}`, { method: 'POST', body: JSON.stringify({ expectedVersion: customer.version, identityConfirmed: true }) }))
    if (result) { setIssued(result); setConfirmed(false); await status.refetch() }
  }
  async function revoke() {
    if (command.busy) return
    const result = await command.run(async () => { await apiFetch<void>(`/api/v1/customers/${customer.id}/access/revoke`, { method: 'POST', body: JSON.stringify({ expectedVersion: customer.version }) }); return true })
    if (result) { setIssued(null); setCopyMessage('Links pendentes revogados.'); setConfirmed(false); await status.refetch() }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopyMessage('Link copiado.') }
    catch { setCopyMessage('Não foi possível copiar. Selecione o link abaixo e copie manualmente.') }
  }
  return <section className="customer-account-access"><h3>Conta de acesso</h3>
    {status.isFetching && <p role="status">Consultando acesso…</p>}
    {(status.isError || (status.isSuccess && !value)) && <p role="alert">Não foi possível consultar o acesso. <button type="button" className="text-button" onClick={() => void status.refetch()}>Tentar novamente</button></p>}
    {value && <>
      <p><strong>{labels[value.status]}</strong>{value.username && <> · {value.username}</>}</p>
      {value.status === 'Active' && <p>{[value.googleLinked && 'Google', value.localPasswordEnabled && 'Usuário e senha'].filter(Boolean).join(' · ')}</p>}
      {value.invitationExpiresAtUtc && <p>Link pendente até {new Date(value.invitationExpiresAtUtc).toLocaleString('pt-BR')}.</p>}
      <details><summary>Gerenciar acesso</summary>
        {(['Pending', 'Invited'].includes(value.status) && !value.userId || value.status === 'Active') && <>
          <label className="rental-checkbox"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={command.busy} />Conferi a identidade do cliente e a entrega deste link.</label>
          {value.status === 'Active' ? <><p>Usar a recuperação substitui o acesso e encerra as sessões atuais.</p><button type="button" className="secondary-link" disabled={!confirmed || command.busy || command.conflict} onClick={() => void issue(true)}>Gerar link de recuperação</button></> : <><p>O novo link substitui o anterior. A conta só fica ativa após o cliente concluir.</p><button type="button" className="secondary-link" disabled={!confirmed || command.busy || command.conflict} onClick={() => void issue(false)}>Gerar link de ativação</button></>}
        </>}
        {value.status === 'Guardian' && <p>Este cadastro usa o acesso dos responsáveis abaixo.</p>}
        {value.status === 'FirstAccess' && <p>Use o acesso inicial entregue pela gestão.</p>}
        {value.status === 'Blocked' && <p>A conta está bloqueada. Peça à gestão para conferir a situação antes de alterar o acesso.</p>}
        {(value.invitationExpiresAtUtc || issued) && <button type="button" className="text-button" disabled={command.busy} onClick={() => void revoke()}>Revogar links pendentes</button>}
        {issued && <section className="customer-issued-access" aria-label={issued.purpose === 'Recovery' ? 'Link de recuperação' : 'Link de ativação'}>
          <p>Entregue este link agora. Ele não será exibido novamente ao sair da tela.</p>
          <AccessQr url={link} label="QR Code para concluir o acesso pessoal" />
          <label className="operation-field">Link para entregar<input readOnly value={link} onFocus={event => event.target.select()} /></label>
          <button className="secondary-link" type="button" onClick={() => void copy()}>Copiar link</button><p>Válido até {new Date(issued.expiresAtUtc).toLocaleString('pt-BR')}.</p>
          <button type="button" className="text-button" onClick={() => { setIssued(null); setCopyMessage('') }}>Ocultar link</button>
        </section>}
        {copyMessage && <p role="status">{copyMessage}</p>}
        {command.error && <p role="alert">{command.error}{command.conflict && <> Atualize a ficha e confira novamente.{refresh && <button className="text-button" type="button" onClick={refresh}>Atualizar ficha para nova conferência</button>}</>}</p>}
      </details>
      <GuardianAccess customer={customer} hasOwnUser={Boolean(value.userId)} refreshStatus={() => void status.refetch()} />
    </>}
  </section>
}

function GuardianAccess({ customer, hasOwnUser, refreshStatus }: { customer: Customer; hasOwnUser: boolean; refreshStatus: () => void }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Candidate | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const command = useCustomerCommand()
  const guardians = useQuery({ queryKey: ['customer-guardians', user?.id, customer.id], queryFn: ({ signal }) => apiFetch<Guardian[]>(`/api/v1/customers/${customer.id}/guardians`, { signal }), enabled: open, retry: false, staleTime: 0 })
  const candidates = useQuery({ queryKey: ['customer-guardian-candidates', user?.id, customer.id, search.trim()], queryFn: ({ signal }) => apiFetch<Candidate[]>(`/api/v1/customers/${customer.id}/guardian-candidates?${new URLSearchParams({ search: search.trim() })}`, { signal }), enabled: open && !hasOwnUser && search.trim().length >= 2 && !selected, retry: false, staleTime: 0 })
  async function grant(person: Candidate | Guardian, isGranted: boolean) {
    if (!confirmed || command.busy) return
    const id = 'userId' in person ? person.userId : person.id
    const previous = guardians.data?.find(row => row.userId === id)
    const result = await command.run(async () => { await apiFetch<void>(`/api/v1/customers/${customer.id}/guardians/${id}`, { method: 'PUT', body: JSON.stringify({ isGranted, expectedVersion: previous?.version ?? 0 }) }); return true })
    if (result) { setSelected(null); setSearch(''); setConfirmed(false); await guardians.refetch(); refreshStatus() }
  }
  return <details onToggle={event => setOpen(event.currentTarget.open)}><summary>Acesso por responsável</summary>
    <p>O dependente usa o acesso do responsável, sem criar uma conta compartilhada. Confira a identidade e a responsabilidade antes de vincular.</p>
    {hasOwnUser && <p>Este cliente já tem conta própria. O vínculo de responsável exige uma conferência pela gestão.</p>}
    {guardians.isFetching && <p role="status">Consultando responsáveis…</p>}
    {guardians.isError && <p role="alert">Não foi possível consultar responsáveis. <button type="button" onClick={() => void guardians.refetch()}>Tentar novamente</button></p>}
    {Array.isArray(guardians.data) && guardians.data.map(person => <div className="customer-guardian-row" key={person.userId}><strong>{person.name}</strong><span>{person.emailHint} · {person.isGranted ? 'Autorizado' : 'Revogado'}</span><button type="button" className="text-button" disabled={!confirmed || command.busy || command.conflict} onClick={() => void grant(person, !person.isGranted)}>{person.isGranted ? 'Revogar responsável' : 'Reautorizar responsável'}</button></div>)}
    {!hasOwnUser && <><label className="operation-field">Buscar responsável<input type="search" maxLength={240} placeholder="Nome ou e-mail" value={search} onChange={event => { setSearch(event.target.value); setSelected(null); setConfirmed(false) }} disabled={command.busy} /></label>
      {candidates.isFetching && <p role="status">Buscando responsáveis…</p>}{candidates.isError && <p role="alert">Não foi possível buscar responsáveis.</p>}
      {Array.isArray(candidates.data) && !selected && candidates.data.map(person => <button type="button" className="customer-option" key={person.id} disabled={command.busy} onClick={() => { setSelected(person); setConfirmed(false) }}>{person.name} · {person.emailHint}</button>)}
      {selected && <p>Responsável escolhido: <strong>{selected.name}</strong> · {selected.emailHint}</p>}
    </>}
    <label className="rental-checkbox"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={command.busy} />Conferi a identidade e a autorização do responsável.</label>
    {selected && <button type="button" className="secondary-link" disabled={!confirmed || command.busy || command.conflict} onClick={() => void grant(selected, true)}>Vincular responsável</button>}
    {command.error && <p role="alert">{command.error}{command.conflict && <button type="button" className="text-button" onClick={() => { setConfirmed(false); void guardians.refetch().then(result => { if (!result.isError) command.resetError() }) }}>Atualizar responsáveis para nova conferência</button>}</p>}
  </details>
}
