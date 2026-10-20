import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode, type Dispatch, type SetStateAction } from 'react'
import { useUnsavedChanges } from '../components/managementUi'
import { Link } from 'react-router-dom'
import { useOperations } from '../features/operations/DemoDataProvider'
import type { Reservation, FinanceEntry } from '../features/arena/types'
import type { RentalGroup, RentalMember, RentalMonth } from '../features/arena/rentals'
import { weekDays } from '../features/arena/rentals'
import { allocationChoice, allocationFields } from '../features/finance/businessUnits'
import { ReceiptSourceFields } from '../features/finance/ReceiptSourceFields'
import { DetailList, Feedback, Field, Group, Notes, SaveRow, Status, currency, displayDate, today, useSave } from './arenaUi'

const RentalEditingContext = createContext<{active: string; setActive: Dispatch<SetStateAction<string>>}>({active: '', setActive: () => {}})
export function RentalEditingScope({children}: {children: ReactNode}) {
  const [active, setActive] = useState('')
  return <RentalEditingContext.Provider value={{active,setActive}}>{children}</RentalEditingContext.Provider>
}
export function useRentalEditing() { return useContext(RentalEditingContext) }
function useInlineDraft<T>() {
  const [draft, setValue] = useState<T | null>(null)
  const scope = useRentalEditing()
  const id = useId()
  useEffect(() => () => scope.setActive(current => current === id ? '' : current), [id, scope.setActive])
  function setDraft(value: T | null) {
    if (value !== null && scope.active && scope.active !== id) return
    scope.setActive(value === null ? '' : id)
    setValue(value)
  }
  return [draft, setDraft] as const
}

export function MeetingInline({ meeting }: { meeting: Reservation }) {
  const data = useOperations()
  const [draft, setDraft] = useInlineDraft<Reservation>()
  const {active} = useRentalEditing()
  const save = useSave()
  const locked = meeting.date < today() || meeting.status === 'Concluída'
  return <article className="rental-inline-record">
    <strong>{displayDate(meeting.date)} · {meeting.startTime}–{meeting.endTime}</strong>
    <span>{data.courts.find(c => c.id === meeting.courtId)?.name}</span><Status>{meeting.status}</Status>
    <Feedback action={save} />
    {draft ? <InlineFormGuard busy={save.busy} onCancel={() => setDraft(null)}><form className="operation-form" onSubmit={async event => {
      event.preventDefault()
      if (await save.run(() => data.saveReservation(draft, meeting.id), 'Encontro atualizado.')) setDraft(null)
    }}><fieldset disabled={save.busy}><p>Somente este encontro. A mensalidade e o horário semanal permanecem como combinados.</p>
      <Group title="Editar encontro">
        <Field label="Nome do encontro" value={draft.name} required onChange={name => setDraft({...draft, name})} />
        <Field label="Quadra do encontro" value={draft.courtId} options={data.courts.map(c => ({value:c.id,label:c.name}))} onChange={courtId => setDraft({...draft,courtId})} />
        <Field label="Data do encontro" type="date" required value={draft.date} onChange={date => setDraft({...draft,date})} />
        <Field label="Início do encontro" type="time" required value={draft.startTime} onChange={startTime => setDraft({...draft,startTime})} />
        <Field label="Término do encontro" type="end-time" required value={draft.endTime} onChange={endTime => setDraft({...draft,endTime})} />
        <Field label="Situação do encontro" value={draft.status} options={['Confirmada','Chegou','Concluída','Cancelada']} onChange={status => setDraft({...draft,status:status as Reservation['status']})} />
        <Notes value={draft.notes} onChange={notes => setDraft({...draft,notes})} />
      </Group><SaveRow label="Salvar encontro" busy={save.busy} onCancel={() => setDraft(null)} />
    </fieldset></form></InlineFormGuard> : data.canWrite('reservations') && !locked ? <button className="secondary-link" disabled={Boolean(active)} onClick={() => setDraft(meeting)}>Editar encontro</button> : <small>Histórico preservado.</small>}
  </article>
}

export function AttendanceRow({member, meeting, groupId}: {member: Pick<RentalMember,'id'|'name'>; meeting: Reservation; groupId: string}) {
  const data = useOperations()
  const save = useSave()
  const pending = useRef(false)
  const {active} = useRentalEditing()
  const presence = data.rentalAttendances.find(p => p.reservationId === meeting.id && p.memberId === member.id)
  return <div className="rental-attendance"><strong>{member.name}</strong><div className="rental-card-actions" aria-label={`Presença de ${member.name}`}>
    {(['Presente','Ausente','Não informado'] as const).map(status => <button key={status} type="button" aria-pressed={(presence?.status ?? 'Não informado') === status} className="secondary-link" disabled={Boolean(active) || save.busy || !data.canWrite('rentalAttendances') || meeting.date > today() || meeting.status === 'Cancelada'} onClick={async () => {
      if (pending.current || presence?.status === status) return
      pending.current = true
      try { await save.run(() => data.saveRentalAttendance({...presence, name:`${member.name} · ${meeting.date}`,rentalGroupId:groupId,reservationId:meeting.id,memberId:member.id,status},presence?.id), 'Presença salva.') } finally { pending.current = false }
    }}>{status}</button>)}
  </div><Feedback action={save} /></div>
}

export function MonthlyCharge({month, entry}: {month: RentalMonth; entry?: FinanceEntry}) {
  const data = useOperations()
  const save = useSave()
  const [draft, setDraft] = useInlineDraft<FinanceEntry>()
  const {active} = useRentalEditing()
  const [confirmed, setConfirmed] = useState(false)
  const id = useRef(crypto.randomUUID())
  function begin() {
    setConfirmed(false)
    setDraft(entry ?? {id:id.current,name:`Mensalista · ${month.name}`,direction:'Receber',origin:'Locações',amount:month.amount ?? 0,dueDate:month.dueDate,status:'Pendente',paidDate:'',notes:'',sourceKind:'rentalMonths',sourceId:month.id,month:month.month})
  }
  return <div className="rental-inline-record">
    {entry ? <DetailList items={[["Cobrança deste mês",currency(entry.amount)],["Situação",entry.status],["Vencimento",displayDate(entry.dueDate)],["A receber",currency(entry.status === 'Pendente' ? entry.amount : 0)]]} /> : <p>Sem cobrança ativa neste mês.</p>}
    <Feedback action={save} />
    {draft ? <InlineFormGuard busy={save.busy} onCancel={() => setDraft(null)}><form className="operation-form" onSubmit={async event => {
      event.preventDefault()
      if (draft.status === 'Pago' && !confirmed) return
      if (await save.run(() => data.saveFinanceEntry({...draft,...allocationFields(allocationChoice(draft.origin,draft))},draft.id), 'Mensalidade salva.')) setDraft(null)
    }}><fieldset disabled={save.busy}><p>Alteração somente na cobrança de {month.month.split('-').reverse().join('/')}. O acordo dos próximos meses permanece igual.</p><Group title="Cobrança do mês">
      <Field label="Descrição da mensalidade" value={draft.name} required onChange={name => setDraft({...draft,name})} />
      <Field label="Valor deste mês (R$)" type="number" min={0.01} step="0.01" required value={draft.amount} onChange={v => {setDraft({...draft,amount:Number(v)});setConfirmed(false)}} />
      <Field label="Vencimento deste mês" type="date" required value={draft.dueDate} onChange={dueDate => setDraft({...draft,dueDate})} />
      <Field label="Situação da mensalidade" value={draft.status} options={['Pendente','Pago','Cancelado']} onChange={v => {setDraft({...draft,status:v as FinanceEntry['status'],paidDate:v==='Pago'?(draft.paidDate || today()):''});setConfirmed(false)}} />
      {draft.status === 'Pago' && <><Field label="Data do recebimento" type="date" required value={draft.paidDate} onChange={paidDate => {setDraft({...draft,paidDate});setConfirmed(false)}} /><ReceiptSourceFields origin={draft.origin} value={draft} onChange={value => {setDraft({...draft,...value});setConfirmed(false)}} /><label className="rental-checkbox"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Confirmo que recebi {currency(draft.amount)}. Esta é uma confirmação manual.</label></>}
      <Notes value={draft.notes} onChange={notes => setDraft({...draft,notes})} />
    </Group><SaveRow label="Salvar mensalidade" busy={save.busy} disabled={draft.status==='Pago'&&!confirmed} onCancel={() => setDraft(null)} /></fieldset></form></InlineFormGuard> : data.canWrite('financeEntries') && (entry?.status !== 'Pago') ? <button className="secondary-link" disabled={Boolean(active)} onClick={begin}>{entry ? 'Editar mensalidade / registrar recebimento' : 'Registrar mensalidade'}</button> : entry?.status === 'Pago' ? <p>Recebimento preservado. <Link to={`/financeiro/${entry.id}`}>Consultar registro financeiro</Link></p> : null}
  </div>
}


// Reuse the application's navigation guard while keeping the editor in the document flow.
export function InlineFormGuard({children, busy, onCancel}: {children: ReactNode; busy: boolean; onCancel: () => void}) {
  const guard = useUnsavedChanges()
  const dirty = useRef(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => { if (dirty.current) {event.preventDefault(); event.returnValue = ''} }
    window.addEventListener('beforeunload', leave)
    root.current?.querySelector<HTMLInputElement>('input:not([disabled]), select:not([disabled])')?.focus()
    return () => {window.removeEventListener('beforeunload', leave); guard.markSaved()}
    // This editor owns one lifetime; event handlers use a mutable dirty flag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {if (!guard.dirty) dirty.current = false}, [guard.dirty])
  return <div ref={root} className="rental-inline-form" onChangeCapture={() => {dirty.current = true; guard.setDirty(true)}} onInvalidCapture={event => {
    let parent = event.target as HTMLElement | null
    while (parent) {if (parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement}
  }} onClickCapture={event => {
    const button = (event.target as HTMLElement).closest('button')
    if (button?.type === 'button' && button.textContent?.trim() === 'Cancelar') {
      event.preventDefault(); event.stopPropagation()
      if (!busy && (!dirty.current || window.confirm('Descartar as alterações não salvas?'))) {guard.markSaved(); onCancel()}
    } else if (button?.type === 'button') {dirty.current = true; guard.setDirty(true)}
  }}>{children}</div>
}

export function MemberInline({group, member}: {group: RentalGroup; member: RentalMember}) {
  const data = useOperations()
  const save = useSave()
  const [draft, setDraft] = useInlineDraft<{group: RentalGroup; member: RentalMember; role: string}>()
  const {active: editing} = useRentalEditing()
  const role = member.id === group.organizerId ? 'Responsável' : member.id === group.backupId ? 'Suplente' : 'Integrante'
  return <article className="rental-inline-record"><strong>{member.name}</strong><small>{role} · {member.status}</small>{member.phone && <span>{member.phone}</span>}<Feedback action={save} />
    {draft ? <InlineFormGuard busy={save.busy} onCancel={() => setDraft(null)}><form className="operation-form" onSubmit={async event => {
      event.preventDefault()
      const base = draft.group
      const active = draft.member.status === 'Ativo'
      const organizerId = active && draft.role === 'Responsável' ? member.id : base.organizerId === member.id ? '' : base.organizerId
      const backupId = active && draft.role === 'Suplente' ? member.id : base.backupId === member.id ? '' : base.backupId
      if (await save.run(() => data.saveRentalGroup({...base,organizerId,backupId,members:base.members.map(m => m.id === member.id ? {...draft.member,name:draft.member.name.trim()} : m)},base.id), 'Integrante atualizado.')) setDraft(null)
    }}><fieldset disabled={save.busy}><Field label="Nome do integrante" required value={draft.member.name} onChange={name => setDraft({...draft,member:{...draft.member,name}})} /><Field label="Telefone do integrante" type="tel" value={draft.member.phone} onChange={phone => setDraft({...draft,member:{...draft.member,phone}})} /><Field label="Função no grupo" value={draft.role} options={['Integrante','Responsável','Suplente']} onChange={role => setDraft({...draft,role})} /><Field label="Situação do integrante" value={draft.member.status} options={['Ativo','Inativo']} onChange={status => setDraft({...draft,member:{...draft.member,status:status as RentalMember['status']}})} /><p>Presenças e registros anteriores são preservados. Definir um novo responsável ou suplente substitui essa função no cadastro atual.</p><SaveRow label="Salvar integrante" busy={save.busy} onCancel={() => setDraft(null)} /></fieldset></form></InlineFormGuard> : data.canWrite('rentalGroups') && <button className="secondary-link" disabled={Boolean(editing)} onClick={() => setDraft({group,member,role})}>Editar integrante</button>}
  </article>
}


export function QuickGroupEditor({group, onClose}: {group: RentalGroup; onClose: () => void}) {
  const data = useOperations()
  const save = useSave()
  const [draft, setDraft] = useState(group)
  return <InlineFormGuard busy={save.busy} onCancel={onClose}><form className="operation-form" onSubmit={async event => {
    event.preventDefault()
    if (await save.run(() => data.saveRentalGroup({...draft,name:draft.name.trim(),backupId:draft.organizerId === draft.backupId ? '' : draft.backupId},group.id))) onClose()
  }}><Feedback action={save} /><fieldset disabled={save.busy}><Group title="Editar grupo">
    <Field label="Nome do grupo" required value={draft.name} onChange={name => setDraft({...draft,name})} />
    <Field label="Responsável pelo grupo" value={draft.organizerId} options={[{value:'',label:'A confirmar'},...draft.members.filter(m=>m.status==='Ativo').map(m=>({value:m.id,label:m.name}))]} onChange={organizerId=>setDraft({...draft,organizerId})} />
    <Field label="Quadra" required value={draft.courtId} options={data.courts.map(c=>({value:c.id,label:c.name}))} onChange={courtId=>setDraft({...draft,courtId})} />
    <Field label="Dia da semana" value={draft.weekDay} options={weekDays.map((label,index)=>({value:String(index),label}))} onChange={v=>setDraft({...draft,weekDay:Number(v)})} />
    <Field label="Início" type="time" required value={draft.startTime} onChange={startTime=>setDraft({...draft,startTime})} />
    <Field label="Término" type="end-time" required value={draft.endTime} onChange={endTime=>setDraft({...draft,endTime})} />
    {data.canRead('financeEntries') && <Field label="Valor mensal (R$)" type="number" min={0} step="0.01" disabled={!data.canWrite('financeEntries')} value={draft.monthlyAmount??''} onChange={v=>setDraft({...draft,monthlyAmount:v===''?null:Number(v)})} />}
  </Group><p>Altera o acordo para meses ainda não gerados. Encontros, cobranças e presenças existentes são preservados; edite-os na ficha do grupo.</p><SaveRow label="Salvar grupo" busy={save.busy} onCancel={onClose} /></fieldset></form></InlineFormGuard>
}
