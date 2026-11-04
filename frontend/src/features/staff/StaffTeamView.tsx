import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { canManageStaff } from '../auth/access'
import { staffScopeKey } from '../auth/staffScope'
import { useAuth } from '../auth/authContext'
import { useOperations, type TeamMember } from '../operations/DemoDataProvider'
import { useRecordForm } from '../../components/managementUi'
import { Breadcrumb, DetailList, Empty, Feedback, Field, Heading, ListSummary, NoAccess, Pagination, Search, Status, currency, useFilters } from '../../pages/arenaUi'
import { formatPhone } from '../../lib/inputFormatting'
import { AccessTypesPanel } from './AccessTypesPanel'
import { InitialAccessReceipt } from './InitialAccessReceipt'
import { StaffAccountActions } from './StaffAccountActions'
import { StaffMemberEditor } from './StaffMemberEditor'
import { staffStatusLabel, useStaffContext, type StaffAccessStatus, type StaffMemberResult } from './api'
import './staff-access.css'

const blankTeam = (): Omit<TeamMember, 'id'> => ({ name: '', phone: '', role: 'Professor de futevôlei', payAmount: null, payBasis: 'A combinar', paymentFrequency: 'A combinar', paymentDay: '', status: 'Ativo', notes: '' })

export function StaffTeamView({ detailId }: { detailId?: string }) {
  const { user } = useAuth()
  const session = staffScopeKey(user)
  return <StaffTeamContent key={session} detailId={detailId} />
}
function StaffTeamContent({ detailId }: { detailId?: string }) {
  const { user } = useAuth()
  const data = useOperations()
  const filters = useFilters()
  const canManage = canManageStaff(user)
  const context = useStaffContext()
  const { form, editId, open: openForm, close } = useRecordForm(data.team, blankTeam)
  const draftId = useRef(crypto.randomUUID())
  const [typesOpen, setTypesOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [secret, setSecret] = useState<{ name: string; login: string; password: string; expiresAt?: string } | null>(null)
  const existing = data.team.find(person => person.id === detailId)
  const status = context.data?.members.find(member => member.teamId === detailId)
  const filtered = data.team.filter(person => `${person.name} ${person.role}`.toLocaleLowerCase('pt-BR').includes(filters.query.toLocaleLowerCase('pt-BR')) && (!filters.status || person.status === filters.status))
  function open(person?: TeamMember) { draftId.current = crypto.randomUUID(); setNotice(''); openForm(person) }
  async function refresh() { const result = await context.refetch(); if (result.error) throw result.error; await data.reload() }
  async function saved(result: StaffMemberResult, secretUnavailable = false) {
    close()
    if (result.initialPassword) setSecret({ name: result.member.name, login: result.access.phoneLogin || result.access.username || '', password: result.initialPassword, expiresAt: result.initialPasswordExpiresAtUtc ?? result.access.initialAccessExpiresAtUtc ?? undefined })
    setNotice(secretUnavailable ? 'Cadastro confirmado. A senha não pode ser consultada novamente; abra a ficha para gerar um novo acesso inicial, se necessário.' : 'Cadastro salvo.')
    try { await refresh() } catch { setNotice('Cadastro confirmado. Atualize os registros para conferir a ficha.') }
  }
  async function accessResult(result: StaffMemberResult | StaffAccessStatus) {
    if ('access' in result && result.initialPassword) setSecret({ name: existing?.name ?? 'Pessoa da equipe', login: result.access.phoneLogin || result.access.username || '', password: result.initialPassword, expiresAt: result.initialPasswordExpiresAtUtc ?? result.access.initialAccessExpiresAtUtc ?? undefined })
    setNotice('access' in result && !result.initialPassword && result.access.requiresFirstAccess ? 'A solicitação já foi confirmada. A senha inicial não é exibida novamente; gere uma nova somente se ainda precisar entregá-la.' : 'Acesso atualizado.')
    try { await refresh() } catch { setNotice('Acesso atualizado. Atualize os registros para conferir a ficha.') }
  }
  if (!data.canRead('team')) return <NoAccess />
  const types = context.data?.types ?? []
  const editingId = editId ?? draftId.current
  const editingStatus = context.data?.members.find(member => member.teamId === editingId)
  const typeName = (access?: StaffAccessStatus) => types.find(type => type.id === access?.typeId)?.name ?? 'A definir'
  return <main className="operation-page arena-page registration-clean staff-team-page">
    {detailId && <Breadcrumb to={filters.href('/equipe')} label="Equipe" />}
    <Heading eyebrow="" title={detailId ? existing?.name ?? 'Ficha da equipe' : 'Equipe'} action={canManage && <div className="arena-record-actions"><button type="button" className="secondary-link" disabled={!context.data} onClick={() => setTypesOpen(true)}>Tipos de acesso</button><button type="button" className="primary-link" disabled={!context.data || Boolean(detailId && !existing)} onClick={() => open(existing)}>{detailId ? 'Editar dados' : '+ Adicionar pessoa'}</button></div>} />
    <Feedback />
    {notice && <p className="arena-message" role="status">{notice}</p>}
    {canManage && context.isPending && <p role="status">Carregando acessos da equipe…</p>}
    {canManage && context.error && <div className="arena-message arena-error" role="alert"><p>{context.error.message}</p><button type="button" className="secondary-link" onClick={() => void context.refetch()}>Tentar novamente</button></div>}
    {form && canManage && context.data && <StaffMemberEditor key={editingId} member={form} teamId={editingId} existing={Boolean(editId)} context={context.data} status={editingStatus} canEditCosts={data.canWrite('financeEntries')} onClose={close} onSaved={saved} />}
    {typesOpen && canManage && context.data && <AccessTypesPanel types={context.data.types} catalog={context.data.catalog} onChanged={refresh} onClose={() => setTypesOpen(false)} />}
    {secret && canManage && <InitialAccessReceipt {...secret} onClose={() => setSecret(null)} />}
    {detailId ? existing ? <>
      <section className="operation-card"><h2>Ficha da pessoa</h2><DetailList items={[["Telefone", formatPhone(existing.phone)], ["Função", existing.role], ["Situação", existing.status], ...(data.canRead('financeEntries') ? [["Valor combinado", currency(existing.payAmount)], ["Base", existing.payBasis], ["Frequência", existing.paymentFrequency], ["Dia combinado", existing.paymentDay]] as [string, string][] : [["Acordo financeiro", "Acesso restrito"]] as [string, string][])]} />{data.canRead('financeEntries') && existing.notes && <p className="detail-notes">{existing.notes}</p>}</section>
      {canManage && context.data && <section className="operation-card"><h2>Acesso ao sistema</h2><DetailList items={[["Situação do acesso", staffStatusLabel(status)], ["Tipo de acesso", typeName(status)], ["Usuário", status?.phoneLogin || status?.username || (status?.googleLinked ? 'Google' : 'A definir')], ["Google", status?.googleLinked ? 'Vinculado' : 'Não vinculado']]} />{status?.isOwner ? <p className="arena-hint">Conta administrativa dos donos.</p> : status?.userId ? <StaffAccountActions status={status} onResult={accessResult} onRefresh={refresh} onClose={() => {}} /> : <button type="button" className="secondary-link" onClick={() => open(existing)}>Configurar acesso</button>}</section>}
    </> : <Empty>{data.persistenceStatus === 'connecting' ? 'Carregando a ficha…' : 'Pessoa não encontrada.'}</Empty> : <>
      <div className="arena-toolbar"><Search filters={filters} /><Field label="Situação" value={filters.status} onChange={value => filters.set('status', value)} options={[{ value: '', label: 'Todas' }, 'Ativo', 'A confirmar', 'Inativo']} /></div>
      <ListSummary count={filtered.length} label="pessoas" />
      {filtered.length ? <Pagination total={filtered.length}>{(start, end) => <div className="record-list">{filtered.slice(start, end).map(person => {
        const access = context.data?.members.find(member => member.teamId === person.id)
        return <article className="record-row" key={person.id}><span className="record-avatar gold-avatar">{person.name.slice(0, 1).toUpperCase()}</span><span className="record-main"><strong>{person.name}</strong><small>{person.role}{canManage && context.data && <> · {typeName(access)}</>}</small></span><Status>{person.status}</Status>{canManage && context.data && <Status>{staffStatusLabel(access)}</Status>}<span className="arena-record-actions"><Link to={filters.href(`/equipe/${person.id}`)}>Ver ficha →</Link>{canManage && <button type="button" className="text-button" disabled={!context.data} onClick={() => open(person)}>Editar</button>}</span></article>
      })}</div>}</Pagination> : <Empty>{filters.query || filters.status ? 'Nenhuma pessoa corresponde aos filtros.' : 'Nenhuma pessoa cadastrada.'}</Empty>}
    </>}
  </main>
}
