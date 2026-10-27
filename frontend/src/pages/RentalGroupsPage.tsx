import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/http'
import { useAuth } from '../features/auth/authContext'
import { useOperations } from '../features/operations/DemoDataProvider'
import type { RentalGroup, RentalMember, RentalPreview, RentalBar } from '../features/arena/rentals'
import { weekDays, fifthPolicies } from '../features/arena/rentals'
import { Breadcrumb, DetailList, Empty, Feedback, Field, Group, Heading, Notes, Pagination, SaveRow, Search, Status, currency, displayDate, today, useFilters, useSave } from './arenaUi'
import { RentalBarPanel } from './RentalBarPanel'
import { ContextLink, Disclosure, EditorPanel, SectionTabs, useEditorQuery, useSection } from '../components/managementUi'
import { MeetingInline, MonthlyCharge, AttendanceRow, MemberInline, InlineFormGuard, RentalEditingScope, useRentalEditing, QuickGroupEditor } from './RentalInlineEditors'
import './rental-groups.css'

const normalizeSearch = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
function RentalStats({ items }: { items: [string, string][] }) { return <div className="rental-stats">{items.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div> }
function monthValue(value: string | null) {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : today().slice(0, 7)
}
function needsMonth(group: RentalGroup, month: string) {
  return group.status === 'Ativo' && group.startDate.slice(0, 7) <= month && (!group.endDate || group.endDate.slice(0, 7) >= month)
}
function missingPeople(group: RentalGroup) {
  const members = group.members.filter(member => member.status === 'Ativo')
  return { members: !members.length, organizer: !members.some(member => member.id === group.organizerId) }
}
export function RentalGroupsPage() { return <RentalEditingScope><RentalGroupsContent /></RentalEditingScope> }
function RentalGroupsContent() {
  const data = useOperations()
  const filters = useFilters()
  const [editingId, setEditingId] = useState('')
  const page = filters.params.get('page')
  useEffect(() => setEditingId(''), [page])
  const month = monthValue(filters.params.get('month'))
  const day = filters.params.get('day') ?? ''
  const pending = filters.params.get('pending') === 'yes'
  const loaded = data.dataUpdatedAt !== null
  const confirmed = new Set(data.rentalMonths.filter(row => row.month === month).map(row => row.rentalGroupId))
  const pendingMonth = (group: RentalGroup) => needsMonth(group, month) && !confirmed.has(group.id)
  const hasPending = (group: RentalGroup) => {
    const missing = missingPeople(group)
    return missing.members || missing.organizer || pendingMonth(group)
  }
  const groups = data.rentalGroups.filter(group =>
    normalizeSearch(`${group.name} ${group.members.map(member => member.name).join(' ')}`).includes(normalizeSearch(filters.query)) &&
    (!filters.status || group.status === filters.status) && (!day || String(group.weekDay) === day) && (!pending || hasPending(group)))
    .sort((a, b) => ((a.weekDay + 6) % 7 - (b.weekDay + 6) % 7) || a.startTime.localeCompare(b.startTime) || a.name.localeCompare(b.name, 'pt-BR'))
  const activeCount = data.rentalGroups.filter(group => needsMonth(group, month)).length
  const meetingCount = data.reservations.filter(row => row.rentalGroupId && row.date.startsWith(month) && row.status !== 'Cancelada').length
  const pendingCount = data.rentalGroups.filter(pendingMonth).length
  const filtered = Boolean(filters.query || filters.status || day || pending)
  return <main className="operation-page arena-page rental-page rental-directory">
    <Heading title="Mensalistas" description="Horários fixos, integrantes e encontros do mês." action={data.canWrite('rentalGroups') && <ContextLink state={{returnLabel:"Mensalistas"}} className="primary-link" to="/mensalistas/novo">+ Cadastrar grupo</ContextLink>} />
    <Feedback />
    <div className="rental-directory-summary" aria-label="Resumo dos grupos">
      <span><strong>{loaded ? activeCount : '…'}</strong> {activeCount === 1 ? 'grupo ativo' : 'grupos ativos'} no mês</span>
      <span><strong>{loaded ? meetingCount : '…'}</strong> {meetingCount === 1 ? 'encontro' : 'encontros'} no mês</span>
      <span><strong>{loaded ? pendingCount : '…'}</strong> {pendingCount === 1 ? 'grupo' : 'grupos'} com encontros por confirmar</span>
    </div>
    <fieldset className="rental-filters" disabled={Boolean(editingId)}>
      <Search filters={filters} placeholder="Buscar grupo ou integrante…" />
      <Field label="Mês dos encontros" type="month" value={month} onChange={value => filters.set('month', value)} />
      <Field label="Situação do grupo" value={filters.status} onChange={value => filters.set('status', value)} options={[{value:'',label:'Todas'},'Ativo','Pausado','Encerrado']} />
      <Field label="Dia da semana" value={day} onChange={value => filters.set('day', value)} options={[{value:'',label:'Todos os dias'}, ...weekDays.map((label,index) => ({value:String(index),label}))]} />
      <label className="rental-checkbox"><input type="checkbox" checked={pending} onChange={event => filters.set('pending', event.target.checked ? 'yes' : '')} />Com pendências</label>
    </fieldset>
    <div className="rental-results" role="status"><span>{loaded ? `${groups.length} ${groups.length === 1 ? 'grupo encontrado' : 'grupos encontrados'}` : 'Carregando grupos…'}</span>{filtered && <Link to={filters.href('/mensalistas', {q:'',status:'',day:'',pending:'',page:''})}>Limpar filtros</Link>}</div>
    {!loaded ? null : groups.length === 0 ? <Empty>{data.rentalGroups.length ? 'Nenhum grupo corresponde aos filtros. Ajuste a busca ou limpe os filtros.' : 'Cadastre o primeiro grupo. Integrantes e valores podem ser completados depois.'}</Empty> : <Pagination total={groups.length}>{(start,end) => <div className="rental-cards">{groups.slice(start,end).map(group => {
      const missing = missingPeople(group)
      const memberCount = group.members.filter(member => member.status === 'Ativo').length
      return <article aria-label={group.name} className={`rental-card ${editingId === group.id ? "rental-card-editing" : ""}`} key={group.id}>
        <div><h2>{group.name}</h2><Status>{group.status}</Status></div>
        <p>{data.courts.find(c => c.id === group.courtId)?.name || "Quadra"}</p><p className="rental-card-schedule">{weekDays[group.weekDay]} · {group.startTime}–{group.endTime}</p>
        <p>{memberCount} {memberCount === 1 ? 'integrante cadastrado' : 'integrantes cadastrados'} · {group.sport || 'Modalidade a combinar'}</p>
        <small>Responsável: {group.members.find(member => member.id === group.organizerId && member.status === 'Ativo')?.name || 'A confirmar'}</small>
        <div className="rental-card-pending">{missing.members && <span>Completar integrantes</span>}{missing.organizer && <span>Definir responsável</span>}{pendingMonth(group) && <span>Confirmar encontros de {month.split('-').reverse().join('/')}</span>}</div>
        {group.costsVisible !== false && data.canRead('financeEntries') && <strong>{currency(group.monthlyAmount)} <small>/ mês</small></strong>}
        <div className="rental-card-actions"><ContextLink aria-label={`Ver ${group.name}`} state={{returnLabel:"Mensalistas"}} to={filters.href(`/mensalistas/${group.id}`, {month})}>Ver turma e encontros →</ContextLink>{data.canWrite("rentalGroups") && !editingId && <button className="secondary-link" onClick={() => setEditingId(group.id)}>Editar</button>}</div>{editingId === group.id && <QuickGroupEditor group={group} onClose={() => setEditingId('')} />}
      </article>
    })}</div>}</Pagination>}
    <Disclosure title="Como organizar as turmas"><p>Cadastre o acordo e os integrantes conhecidos. Depois, revise e confirme os encontros de cada mês para reservar a quadra. A cobrança é opcional e não confirma pagamento.</p>{data.canRead('financeEntries') && <Link to="/financeiro/historico?series=mensalistas">Consultar pagamentos históricos →</Link>}</Disclosure>
  </main>
}
function blankGroup(courtId: string): RentalGroup {
  const member: RentalMember = { id: crypto.randomUUID(), name: '', phone: '', status: 'Ativo' }
  return { id: '', name: '', sport: 'Futevôlei', courtId, weekDay: 1, startTime: '20:00', endTime: '22:00', startDate: today(), endDate: '', status: 'Ativo', capacity: null, organizerId: member.id, backupId: '', members: [member], monthlyAmount: null, dueDay: null, fifthPolicy: 'A confirmar', extraAmount: null, notes: '' }
}
function GroupEditor({ initial, cancel, section }: { initial: RentalGroup; cancel: () => void; section?: 'group' | 'members' | 'money' }) {
  const [value, setValue] = useState(initial); const data = useOperations(); const save = useSave(); const navigate = useNavigate(); const location = useLocation()
  const set = <K extends keyof RentalGroup>(key: K, v: RentalGroup[K]) => setValue(old => ({ ...old, [key]: v }))
  const member = (id: string, update: Partial<RentalMember>) => setValue(old => ({ ...old, members: old.members.map(m => m.id === id ? { ...m, ...update } : m) }))
  const existingIds = new Set(initial.members.map(m => m.id)); const editMoney = data.canWrite('financeEntries')
  return <InlineFormGuard busy={save.busy} onCancel={cancel}><form className="operation-form" onSubmit={async e => { e.preventDefault(); const id = await save.run(() => data.saveRentalGroup({ ...value, name: value.name.trim(), members: value.members.filter(m => existingIds.has(m.id) && initial.id || m.name.trim() || m.phone.trim()).map(m => ({ ...m, name: m.name.trim() })), organizerId: value.members.some(m => m.id === value.organizerId && m.name.trim()) ? value.organizerId : '' }, value.id || undefined)); if (id) { if (value.id) cancel(); else navigate(`/mensalistas/${id}`, {state:location.state}) } }}><Feedback action={save} /><fieldset disabled={save.busy} className="rental-editor-fields">
    <p className="rental-form-intro">Comece pelo grupo e pelo horário. Você pode completar integrantes e acordo financeiro depois.</p><details className="rental-form-step" hidden={Boolean(section && section !== 'group')} open><summary>1. Grupo e horário <small>Essencial</small></summary><Group title="Turma e acordo"><Field label="Nome do grupo" value={value.name} onChange={v => set('name', v)} required /><Field label="Modalidade" value={value.sport} onChange={v => set('sport', v)} /><Field label="Situação" value={value.status} onChange={v => set('status', v as RentalGroup['status'])} options={['Ativo', 'Pausado', 'Encerrado']} /><Field label="Integrantes previstos" type="number" min={1} max={50} step="1" value={value.capacity ?? ''} onChange={v => set('capacity', v === '' ? null : Number(v))} /><Field label="Início do acordo" type="date" value={value.startDate} onChange={v => set('startDate', v)} required /><Field label="Fim do acordo (opcional)" type="date" value={value.endDate} onChange={v => set('endDate', v)} /></Group>
    <Group title="Horário semanal"><Field label="Quadra" value={value.courtId} onChange={v => set('courtId', v)} required options={[{ value: '', label: 'Selecione' }, ...data.courts.map(c => ({ value: c.id, label: c.name }))]} /><Field label="Dia da semana" value={value.weekDay} onChange={v => set('weekDay', Number(v))} options={weekDays.map((label, index) => ({ label, value: String(index) }))} /><Field label="Início" type="time" value={value.startTime} onChange={v => set('startTime', v)} required /><Field label="Término" type="end-time" value={value.endTime} onChange={v => set('endTime', v)} required /></Group>
    <p className="arena-message">O cadastro guarda o acordo. A quadra só é reservada ao gerar e confirmar os encontros de cada mês. Alterar ou pausar o grupo não cancela encontros já gerados.</p>
    </details><details className="rental-form-step" hidden={Boolean(section && section !== 'members')} open={Boolean(initial.id)}><summary>2. Integrantes <small>Pode completar depois</small></summary><Group title="Quem faz parte"><div className="operation-field-wide rental-members-editor">{value.members.map((m, index) => <div key={m.id} className="rental-member-edit"><Field label={`Integrante ${index + 1} · nome completo`} value={m.name} onChange={v => member(m.id, { name: v })} required={Boolean(initial.id && existingIds.has(m.id) || m.phone)} /><Field label={`Integrante ${index + 1} · telefone (opcional)`} value={m.phone} onChange={v => member(m.id, { phone: v })} type="tel" /><Field label={`Integrante ${index + 1} · situação`} value={m.status} onChange={v => member(m.id, { status: v as RentalMember['status'] })} options={['Ativo', 'Inativo']} />{(!initial.id || !existingIds.has(m.id)) && <button type="button" className="secondary-link" onClick={() => set('members', value.members.filter(row => row.id !== m.id))}>Remover integrante {index + 1}</button>}</div>)}<button type="button" className="secondary-link" disabled={value.members.length >= 50} onClick={() => set('members', [...value.members, { id: crypto.randomUUID(), name: '', phone: '', status: 'Ativo' }])}>+ Adicionar integrante</button></div><Field label="Responsável pelo grupo" value={value.organizerId} onChange={v => set('organizerId', v)} options={[{ value: '', label: 'A confirmar' }, ...value.members.filter(m => m.status === 'Ativo').map(m => ({ value: m.id, label: m.name || 'Preencha o nome' }))]} /><Field label="Suplente (opcional)" value={value.backupId} onChange={v => set('backupId', v)} options={[{ value: '', label: 'Sem suplente' }, ...value.members.filter(m => m.status === 'Ativo' && m.id !== value.organizerId).map(m => ({ value: m.id, label: m.name || 'Preencha o nome' }))]} /></Group>
    </details><details className="rental-form-step" hidden={Boolean(section && section !== 'money')} open={Boolean(initial.id)}><summary>3. Acordo financeiro <small>Pode completar depois</small></summary><Group title="Acordo financeiro">{data.canRead('financeEntries') && <Field label="Valor mensal do grupo (vazio = a combinar)" value={value.monthlyAmount ?? ''} onChange={v => set('monthlyAmount', v === '' ? null : Number(v))} type="number" min={0} step="0.01" disabled={!editMoney} />}<Field label="Dia do vencimento" value={value.dueDay ?? ''} onChange={v => set('dueDay', v === '' ? null : Number(v))} type="number" min={1} max={31} step="1" /><Field label="Quando houver um quinto encontro" value={value.fifthPolicy} onChange={v => set('fifthPolicy', v as RentalGroup['fifthPolicy'])} options={fifthPolicies} />{value.fifthPolicy === 'Extra' && data.canRead('financeEntries') && <Field label="Adicional pelo quinto encontro" value={value.extraAmount ?? ''} onChange={v => set('extraAmount', v === '' ? null : Number(v))} type="number" min={0} step="0.01" disabled={!editMoney} />}<Notes label="Combinados, feriados e reposições" value={value.notes} onChange={v => set('notes', v)} /></Group>
    </details><SaveRow busy={save.busy || data.saving} onCancel={cancel} label="Salvar grupo" />
  </fieldset></form></InlineFormGuard>
}
export function RentalGroupPage() { const {groupId} = useParams(); return <RentalEditingScope key={groupId}><RentalGroupContent /></RentalEditingScope> }
function RentalGroupContent() {
  const scope = useRentalEditing()
  const { groupId } = useParams(); const data = useOperations(); const navigate = useNavigate(); const location = useLocation();
  const returnTo = typeof location.state?.returnTo === 'string' && /^\/mensalistas(?:\?|$)/.test(location.state.returnTo) ? location.state.returnTo : '/mensalistas'; const [editing, setEditing] = useEditorQuery(false, groupId)
  const group = data.rentalGroups.find(g => g.id === groupId)
  if (groupId === 'novo') return <main className="operation-page arena-page rental-page"><Breadcrumb to="/mensalistas" label="Mensalistas" /><Heading title="Novo grupo mensalista" description="Defina o grupo e o horário. Complete os demais dados quando souber." />{data.canWrite('rentalGroups') ? <EditorPanel title="Novo grupo mensalista" busy={data.saving} onClose={()=>navigate(returnTo, {state:location.state?.returnState})}><GroupEditor initial={blankGroup(data.courts[0]?.id ?? '')} cancel={() => navigate(returnTo, {state:location.state?.returnState})} /></EditorPanel> : <p>Apenas a gestão pode cadastrar grupos.</p>}</main>
  if (!group) return <main className="operation-page arena-page rental-page"><Breadcrumb to="/mensalistas" label="Mensalistas" /><Feedback /><p>{data.dataUpdatedAt ? 'Grupo não encontrado.' : 'Carregando grupo…'}</p></main>
  return <main className="operation-page arena-page rental-page"><Breadcrumb to="/mensalistas" label="Mensalistas" /><Heading title={group.name} description={`${weekDays[group.weekDay]} · ${group.startTime} às ${group.endTime} · ${group.sport}`} action={!editing && data.canWrite('rentalGroups') && <button className="secondary-link" disabled={Boolean(scope.active)} onClick={() => setEditing(true)}>Editar grupo e integrantes</button>} /><Feedback />{editing && data.canWrite('rentalGroups') && <section className="rental-section" aria-label="Editar grupo e integrantes"><GroupEditor initial={group} cancel={() => setEditing(false)} /></section>}{!editing && <GroupDetails group={group} onEdit={()=>setEditing(true)} />}</main>
}
function GroupDetails({ group, onEdit }: { group: RentalGroup; onEdit: () => void }) {
  const data = useOperations(); const { user } = useAuth(); const queryClient = useQueryClient(); const filters=useFilters(); const month=monthValue(filters.params.get('month')); const setMonth=(value:string)=>filters.set('month',value); const [charge, setCharge] = useState(false); const [selectedMeeting, setSelectedMeeting] = useState(''); const action = useSave()
  const owner = user?.roles.includes('Owner'); const canBar = Boolean(owner || user?.permissions.includes('bar:finance:read'))
  const tabs=[{value:'resumo',label:'Resumo'},{value:'integrantes',label:'Integrantes'},{value:'encontros',label:'Encontros e presença'},...(data.canRead('financeEntries')?[{value:'financeiro',label:'Financeiro'}]:[]),...(canBar?[{value:'bar',label:'Bar'}]:[])]
  const [section,setSection]=useSection(tabs.map(t=>t.value))
  const [editSection, setSectionEditor] = useState<'group' | 'members' | 'money' | undefined>()
  const scope = useRentalEditing()
  const setEditSection = (value: 'group' | 'members' | 'money' | undefined) => {scope.setActive(value ?? ''); setSectionEditor(value)}
  const monthRow = data.rentalMonths.find(m => m.rentalGroupId === group.id && m.month === month)
  const meetings = data.reservations.filter(r => r.rentalGroupId === group.id && r.rentalMonth === month).sort((a, b) => a.date.localeCompare(b.date))
  const meeting = meetings.find(r => r.id === selectedMeeting) ?? meetings.find(r => r.date === today()) ?? meetings[0]
  const entries = data.financeEntries.filter(f => f.sourceKind === 'rentalMonths' && f.sourceId === monthRow?.id)
  const preview = useQuery({ queryKey: ['rental-preview', group.id, month, group.version], queryFn: () => apiFetch<RentalPreview>(`/api/v1/rentals/groups/${group.id}/months/${month}/preview`), enabled: section==='encontros' && !monthRow && /^\d{4}-\d{2}$/.test(month) && data.persistenceStatus === 'connected', refetchOnWindowFocus: true })
  const bar = useQuery({ queryKey: ['rental-bar', group.id, month], queryFn: () => apiFetch<RentalBar[]>(`/api/v1/rentals/groups/${group.id}/bar?month=${month}`), enabled: canBar && section==='bar' && /^\d{4}-\d{2}$/.test(month) && data.persistenceStatus === 'connected', refetchInterval: 30000 })
  const members = [...(monthRow?.members ?? []), ...group.members.filter(m => m.status === 'Ativo' && !monthRow?.members.some(old => old.id === m.id))]
  const missing = missingPeople(group)
  const upcoming = meetings.find(row => row.date >= today() && row.status !== 'Cancelada')
  const finance = group.costsVisible !== false && data.canRead('financeEntries'); const liveEntry = entries.find(f => f.status !== 'Cancelado')
  const amounts = bar.data?.reduce((acc, row) => ({ total: acc.total + row.total, paid: acc.paid + row.paid, due: acc.due + row.due }), { total: 0, paid: 0, due: 0 })
  async function generate() { await action.run(async () => { await apiFetch(`/api/v1/rentals/groups/${group.id}/months`, { method: 'POST', body: JSON.stringify({ month, groupVersion: preview.data!.groupVersion, createCharge: charge }) }); await data.reload(); await queryClient.invalidateQueries({ queryKey: ['rental-preview', group.id] }); await queryClient.invalidateQueries({ queryKey: ['court-schedule'] }) }, 'Encontros confirmados. Confira o calendário e o financeiro abaixo.') }
  return <><div className="record-overview"><div><Status>{group.status}</Status></div>{finance&&<strong>{currency(group.monthlyAmount)} <small>/ mês</small></strong>}<Field label="Competência" type="month" disabled={action.busy || Boolean(scope.active)} value={month} onChange={v => { setMonth(v); setCharge(false); setSelectedMeeting('') }} /></div><SectionTabs items={tabs} value={section} onChange={value => { if (!scope.active) setSection(value) }}/><Feedback action={action}/>{scope.active && <p role="status">Salve ou cancele a edição para continuar em outra seção.</p>}{editSection && <section className="rental-section"><GroupEditor key={editSection} initial={group} section={editSection} cancel={() => setEditSection(undefined)} /></section>}{section==='resumo'&&<><section className="rental-month-focus" aria-label="Próxima ação do grupo"><h2>Encontros de {month.split('-').reverse().join('/')}</h2><p>{monthRow ? `${meetings.filter(row => row.status !== 'Cancelada').length} encontros não cancelados neste mês.` : needsMonth(group, month) ? 'Os encontros deste mês ainda precisam ser revisados e confirmados.' : 'Grupo fora da vigência ou inativo neste mês. Confira o acordo antes de gerar encontros.'}</p>{upcoming && <p>Próximo encontro: <strong>{displayDate(upcoming.date)} · {upcoming.startTime}–{upcoming.endTime}</strong></p>}<button className="primary-button" onClick={()=>setSection('encontros')}>{monthRow ? 'Ver encontros' : 'Revisar encontros'}</button>{(missing.members || missing.organizer) && <div className="rental-detail-pending"><span>{missing.members ? 'Integrantes a cadastrar.' : ''} {missing.organizer ? 'Responsável a confirmar.' : ''}</span>{data.canWrite('rentalGroups') && <button type="button" className="secondary-link" disabled={Boolean(scope.active)} onClick={onEdit}>Completar cadastro</button>}</div>}</section><div className="rental-card-actions">{data.canWrite('rentalGroups') && <button className="secondary-link" disabled={Boolean(scope.active)} onClick={() => setEditSection('group')}>Editar dados e horário</button>}</div><DetailList items={[['Responsável', group.members.find(m => m.id === group.organizerId)?.name || 'A confirmar'], ['Suplente', group.members.find(m => m.id === group.backupId)?.name], ['Acordo', `${displayDate(group.startDate)}${group.endDate ? ` até ${displayDate(group.endDate)}` : ' · sem término definido'}`], ['Quinto encontro', fifthPolicies.find(p => p.value === group.fifthPolicy)?.label]]} />
    <div className="record-overview"><p>{meetings.length} encontros em {month.split('-').reverse().join('/')} · {group.members.filter(m=>m.status==='Ativo').length} {group.members.filter(m=>m.status==='Ativo').length === 1 ? 'integrante cadastrado' : 'integrantes cadastrados'}</p><button className="secondary-link" onClick={()=>setSection('integrantes')}>Ver integrantes</button></div>{group.notes&&<Disclosure title="Combinados e origem"><p>{group.notes}</p></Disclosure>}</>}
    {section==='integrantes'&&<section className="rental-section"><h2>Todos da turma</h2>{data.canWrite('rentalGroups') && <button className="secondary-link" disabled={Boolean(scope.active)} onClick={() => setEditSection('members')}>Editar integrantes e responsáveis</button>}{!group.members.length && <p>Integrantes e responsável a confirmar. O cadastro da turma e dos horários já pode ser utilizado.</p>}<div className="rental-roster">{group.members.map(m => <MemberInline key={m.id} group={group} member={m} />)}</div></section>}
    {section==='encontros'&&<><section className="rental-section"><h2>Encontros do mês</h2>
    {!monthRow && <div className="rental-month-preview"><h3>Revisar antes de reservar</h3>{data.persistenceStatus !== 'connected' ? <p>Conecte-se à arena para revisar e gerar os encontros.</p> : preview.isPending && <p>Consultando o calendário…</p>}{preview.error && <p role="alert">{preview.error.message}</p>}{preview.data && <><p>{preview.data.dates.length} encontros: {preview.data.dates.map(displayDate).join(' · ')}</p>{finance && <p>Valor do mês: <strong>{currency(preview.data.amount)}</strong> · vencimento {preview.data.dueDate ? displayDate(preview.data.dueDate) : 'a confirmar'}</p>}{preview.data.warnings.map(w => <p key={w}>{w}</p>)}{preview.data.errors.length > 0 && <div role="alert"><strong>Resolva antes de gerar:</strong><ul>{preview.data.errors.map(e => <li key={e}>{e}</li>)}</ul></div>}{data.canWrite('rentalGroups') && <><label className="rental-checkbox"><input type="checkbox" checked={charge} onChange={e => setCharge(e.target.checked)} disabled={action.busy || !data.canWrite('financeEntries') || !(preview.data.amount && preview.data.amount > 0) || !preview.data.dueDate} /> Gerar também uma cobrança pendente do aluguel mensal</label><button className="primary-button" disabled={action.busy || data.saving || preview.data.errors.length > 0 || !preview.data.dates.length} onClick={() => void generate()}>{action.busy ? 'Confirmando…' : `Confirmar ${preview.data.dates.length} encontros${charge ? ' e cobrança' : ''}`}</button></>}</>}</div>}
    {monthRow && <><p>Edite cada encontro aqui. Alterações afetam somente o encontro escolhido; o acordo semanal e a mensalidade são preservados.</p><div className="rental-meetings">{meetings.map(r => <MeetingInline key={r.id} meeting={r} />)}</div></>}
    </section>
    {monthRow && meeting && <section className="rental-section"><h2>Presença no encontro</h2><Field label="Encontro" value={meeting.id} onChange={setSelectedMeeting} options={meetings.map(r => ({ value: r.id, label: `${displayDate(r.date)} · ${r.status}` }))} /><p>Marque quem veio. “Não informado” mantém a presença em aberto.</p><div className="rental-roster">{members.map(m => <AttendanceRow key={`${meeting.id}:${m.id}`} member={m} meeting={meeting} groupId={group.id} />)}</div></section>}
    </>}
    {section==='financeiro'&&finance&&<section className="rental-section"><h2>Mensalidade de {month.split('-').reverse().join('/')}</h2><p>Valor combinado: <strong>{currency(group.monthlyAmount)}</strong> / mês</p>{data.canWrite('rentalGroups') && data.canWrite('financeEntries') && <button className="secondary-link" disabled={Boolean(scope.active)} onClick={() => setEditSection('money')}>Editar acordo para próximos meses</button>}<p className="arena-hint">O acordo vale para meses ainda não gerados. Cobranças existentes são editadas separadamente abaixo.</p>{monthRow ? <MonthlyCharge key={`${monthRow.id}:${liveEntry?.id ?? 'new'}`} month={monthRow} entry={liveEntry} /> : <Empty action={<button className="secondary-link" onClick={()=>setSection('encontros')}>Revisar encontros</button>}>Gere os encontros da competência antes de registrar a mensalidade.</Empty>}<p className="arena-hint">O valor combinado não comprova recebimento. A cobrança do aluguel e o consumo no bar têm registros próprios.</p>{owner&&<Link to={`/financeiro/historico?series=mensalistas&month=${month}`}>Consultar controle importado →</Link>}</section>}
    {section==='bar'&&canBar && <section className="rental-section"><h2>A resenha no bar</h2><p>Valores das comandas vinculadas aos encontros desta competência. Recebido considera pagamentos aprovados menos estornos; consumo considera os ajustes da comanda.</p>{bar.error ? <p role="alert">Não foi possível atualizar o bar: {bar.error.message}</p> : <RentalStats items={[["Consumo do grupo", amounts ? currency(amounts.total) : '…'], ['Recebido no bar', amounts ? currency(amounts.paid) : '…'], ['A receber no bar', amounts ? currency(amounts.due) : '…']]} />}<RentalBarPanel group={group} meetings={meetings} links={bar.data ?? []} onLinked={async () => { await bar.refetch() }} /></section>}
  </>
}
