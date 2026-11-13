import { ClassStudents } from '../features/arena/ClassStudents'
import { formatMonth, formatPhone } from '../lib/inputFormatting'
import { CustomerPicker } from '../features/customers/CustomerPicker'
import { EnrollmentStudentPicker } from '../features/arena/EnrollmentStudentPicker'
import { SchoolViewNavigation } from './AgendaViewNavigation'
import { ClassDeletionAction, ClassDeletionNotice } from './ClassDeletionAction'
import { deletionDateLabel, enrollmentCoversDate, reservationIsClassHistory } from '../features/arena/classLifecycle'
import { isManagement } from '../features/auth/access'
import { allocationChoice, allocationFields, allocationLabel, allocationOptions } from '../features/finance/businessUnits'
import { BusinessAllocationField } from '../features/finance/BusinessAllocationField'
import { ReceiptSourceFields } from '../features/finance/ReceiptSourceFields'
import { receiptSourceLabel, receiptUnit } from '../features/finance/receiptSources'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../features/auth/authContext'
import { useOperations } from '../features/operations/DemoDataProvider'
import { BarArenaMetrics } from '../features/attendance/BarArenaMetrics'
import { CourtRentalPrices, CourtPriceSummary } from '../features/arena/CourtRentalPrices'
import { ReservationGroupDetails } from './RecurringReservationsPage'
import type { ArenaClass, Court, Enrollment, FinanceEntry, Maintenance, Reservation } from '../features/arena/types'
import { Breadcrumb, DetailList, Empty, Feedback, Field, Group, Heading, ListSummary, NoAccess, Notes, Pagination, SaveRow, Search, Status, currency, displayDate, quantity, today, useFilters, useSave, validDate } from './arenaUi'

import { ContextLink, Disclosure, EditorPanel, safeReturn, useEditorQuery, useRecordForm } from '../components/managementUi'
import './arena-entry-clean.css'
import '../features/finance/finance-clean.css'

const weekdays=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado']
const blankCourt=():Omit<Court,'id'>=>({name:'',sport:'Futevôlei',status:'Disponível',openingTime:'07:00',closingTime:'23:00',operatingDays:[0,1,2,3,4,5,6],scheduleConfirmed:false})
const blankReservation=(date:string):Omit<Reservation,'id'>=>({name:'',courtId:'',date,startTime:'18:00',endTime:'19:00',customerName:'',phone:'',amount:0,status:'Confirmada',notes:''})
const blankClass=():Omit<ArenaClass,'id'>=>({name:'Iniciante',sport:'Futevôlei',courtId:'',startDate:today(),weekDay:1,startTime:'18:00',endTime:'19:00',teacherId:'',capacity:8,studentIds:[],status:'Ativa',notes:''})
const blankFinance=():Omit<FinanceEntry,'id'>=>({name:'',direction:'Receber',origin:'Arena',amount:0,dueDate:today(),status:'Pendente',paidDate:'',notes:''})
const blankMaintenance=():Omit<Maintenance,'id'>=>({name:'',area:'',owner:'',dueDate:'',status:'Aberta',priority:'Normal',notes:''})
function useEditor<T extends { id: string }>(existing:T|undefined,blank:()=>Omit<T,'id'>,isNew:boolean){
  const[form,setForm]=useState<Omit<T,'id'>>(()=>existing?{...existing}:blank());const[editing,setEditing]=useEditorQuery(isNew,existing?.id);const draftId=useRef(crypto.randomUUID())
  const hydrated = useRef(existing?.id)
  useEffect(()=>{if(existing&&(!editing||hydrated.current!==existing.id)){setForm({...existing});hydrated.current=existing.id}},[existing,editing])
  return{form,setForm,editing,setEditing,draftId}
}

export function CourtsPage(){
  const data=useOperations();const filters=useFilters();const save=useSave();const draftId=useRef(crypto.randomUUID());const {form,setForm,editId,open:openForm,close}=useRecordForm(data.courts,blankCourt)
  if(!data.canRead('courts'))return <NoAccess />
  const open=(court?:Court)=>{draftId.current=crypto.randomUUID();openForm(court)}
  const submit=async(event:FormEvent)=>{event.preventDefault();if(!form)return;const id=await save.run(()=>data.saveCourt({...form,operatingDays:[0,1,2,3,4,5,6]},editId??draftId.current));if(id)close()}
  return <main className="operation-page arena-page arena-entry-clean"><Breadcrumb to="/agenda" label="Agenda" /><Heading eyebrow="" title="Funcionamento e preços" action={data.canWrite('courts')&&data.courts.length!==1&&<button className="primary-link" onClick={()=>open()}>{data.courts.length ? '+ Adicionar quadra' : 'Configurar funcionamento'}</button>} />{!form&&<Feedback action={save} />}
    {form&&data.canWrite('courts')&&<EditorPanel className="arena-entry-editor" title="Quadra e horários" busy={save.busy} onClose={close}><Feedback action={save}/><form className="operation-card operation-form" onSubmit={submit}><p className="arena-hint">Aulas e reservas compartilham a disponibilidade da quadra.</p><Group title="Espaço e funcionamento">{data.courts.length!==1&&<Field label="Nome da quadra" required value={form.name} onChange={v=>setForm({...form,name:v})} />}<Field label="Esporte" required value={form.sport} onChange={v=>setForm({...form,sport:v})} /><Field label="Situação" value={form.status} onChange={v=>setForm({...form,status:v as Court['status']})} options={['Disponível','Manutenção']} /><Field label="Abre às" required type="time" value={form.openingTime} onChange={v=>setForm({...form,openingTime:v})} /><Field label="Fecha às" required type="end-time" placeholder="HH:mm ou 24:00" value={form.closingTime} onChange={v=>setForm({...form,closingTime:v})} /></Group>{data.canWrite('financeEntries')&&<CourtRentalPrices court={form} change={setForm} />}<p className="arena-hint">Todos os dias</p><label className="arena-check"><input type="checkbox" checked={form.scheduleConfirmed!==false} onChange={event=>setForm({...form,scheduleConfirmed:event.target.checked})} />Agenda atual conferida: reservas e aulas cadastradas</label><p className="arena-hint">Meia-noite: 24:00. Confira a agenda para exibir horas livres.</p><SaveRow busy={save.busy} label="Salvar quadra" onCancel={close} /></form></EditorPanel>}
    <div className="record-list">{data.courts.map(court=><article className="record-row" key={court.id}><span className="record-avatar" aria-hidden="true">▦</span><span className="record-main"><strong>{data.courts.length===1?'Funcionamento da arena':court.name}</strong><small>{court.sport} · {court.openingTime}–{court.closingTime}</small><small>Todos os dias</small><CourtPriceSummary court={court} />{court.scheduleConfirmed===false&&<small>Agenda atual aguardando conferência</small>}</span><Status warning={court.status==='Manutenção'}>{court.status}</Status><span className="arena-record-actions"><Link to={`/agenda?court=${court.id}`}>Ver agenda →</Link>{data.canWrite('courts')&&<button className="text-button" onClick={()=>open(court)}>Editar</button>}</span></article>)}</div>{!data.courts.length&&<Empty>Nenhuma quadra cadastrada.</Empty>}
  </main>
}

export { AgendaPage } from './AgendaPage'

export function ReservationDetailsPage(){
  const{reservationId}=useParams();const navigate=useNavigate();const data=useOperations();const filters=useFilters();const save=useSave();const existing=data.reservations.find(item=>item.id===reservationId);const isNew=reservationId==='novo'
  const editor=useEditor(existing,()=>({...blankReservation(filters.params.get('date')??today()),courtId:data.courts.length===1?data.courts[0].id:filters.params.get('court')??'',startTime:filters.params.get('start')??'18:00',endTime:filters.params.get('end')??'19:00'}),isNew);const{form,setForm}=editor
  useEffect(()=>{if(isNew&&data.courts.length===1&&!form.courtId)setForm(current=>({...current,courtId:data.courts[0].id}))},[isNew,data.courts,form.courtId,setForm])
  const singleLesson=form.activityKind==='SingleLesson'
  const canChooseType=!existing?.rentalGroupId&&!existing?.groupId&&existing?.activityKind!=='Trial'&&!(existing?.teacherId&&!existing.activityKind)&&existing?.status!=='Bloqueio'&&form.status!=='Bloqueio'
  const teachers=(data.canLookup?.('team') ?? data.canRead('team'))?data.team.filter(person=>person.status==='Ativo'||person.id===form.teacherId):[]
  const teacherOptions=[{value:'',label:'Escolha o professor'},...teachers.map(person=>({value:person.id,label:`${person.name}${person.status==='Ativo'?'':' · Inativo'}`})),...(!teachers.some(person=>person.id===form.teacherId)&&form.teacherId?[{value:form.teacherId,label:'Professor atual · acesso restrito'}]:[])]
  const readOnly=reservationIsClassHistory(existing,data.classes)
  if(!data.canRead('reservations'))return <NoAccess />
  async function submit(event:FormEvent){event.preventDefault();if(readOnly)return;const id=await save.run(()=>data.saveReservation(form,isNew?editor.draftId.current:reservationId));if(id){if(isNew)navigate(filters.href(`/agenda/${id}`));else editor.setEditing(false)}}
  return <main className="operation-page arena-page arena-entry-clean"><Breadcrumb to={filters.href('/agenda')} label="Agenda" /><Heading eyebrow="" title={isNew?'Nova reserva':existing?.name??'Reserva'} action={!editor.editing&&existing&&!readOnly&&data.canWrite('reservations')&&<button className="secondary-link" onClick={()=>editor.setEditing(true)}>Editar reserva</button>} />{!editor.editing&&<Feedback action={save} />}
    {editor.editing&&!readOnly&&data.canWrite('reservations')?<EditorPanel className="arena-entry-editor" title={isNew?'Nova reserva':'Editar reserva'} busy={save.busy} onClose={()=>isNew?navigate(filters.href('/agenda')):editor.setEditing(false)}><Feedback action={save} /><form className="operation-card operation-form" onSubmit={submit}>{canChooseType&&<Field label="Tipo" value={singleLesson?'SingleLesson':'Rental'} onChange={value=>setForm(current=>({...current,activityKind:value==='SingleLesson'?'SingleLesson':undefined,...(value==='Rental'?{teacherId:undefined}:{})}))} options={[{value:'Rental',label:'Locação'},{value:'SingleLesson',label:'Aula avulsa'}]} />}{existing?.activityKind==='Trial'&&<p>Aula experimental</p>}<Group title="Espaço e horário"><Field label="Nome da reserva" required value={form.name} onChange={v=>setForm({...form,name:v})} />{data.courts.length !== 1 && <Field label="Quadra" required disabled={!(data.canLookup?.('courts') ?? data.canRead('courts'))} value={form.courtId} onChange={v=>setForm({...form,courtId:v})} options={[{value:'',label:'Escolha a quadra'},...((data.canLookup?.('courts') ?? data.canRead('courts'))?data.courts.map(item=>({value:item.id,label:item.name})):form.courtId?[{value:form.courtId,label:'Quadra atual · acesso restrito'}]:[])]} />}<Field label="Data" type="date" required value={form.date} onChange={v=>setForm({...form,date:v})} /><Field label="Começa às" type="time" required value={form.startTime} onChange={v=>setForm({...form,startTime:v})} /><Field label="Termina às" type="end-time" placeholder="HH:mm ou 24:00" required value={form.endTime} onChange={v=>setForm({...form,endTime:v})} /><Field label="Situação" value={form.status} onChange={v=>setForm({...form,status:v as Reservation['status']})} options={singleLesson?['Confirmada','Chegou','Concluída','Cancelada']:['Confirmada','Chegou','Concluída','Cancelada','Bloqueio']} />{singleLesson&&<Field label="Professor" required disabled={!(data.canLookup?.('team') ?? data.canRead('team'))} value={form.teacherId??''} onChange={teacherId=>setForm(current=>({...current,teacherId}))} options={teacherOptions} />}</Group><Group title="Cliente e valor">{data.customerRegistryEnabled||singleLesson ? <><CustomerPicker scope="reservations" contextKey={`reservation:${reservationId??'novo'}`} label={singleLesson?'Cliente da aula':'Cliente da reserva'} required={singleLesson||Boolean(existing?.customerId)} disabled={save.busy} value={form.customerId?{id:form.customerId,name:form.customerName}:null} onChange={person=>setForm(current=>({...current,customerId:person?.id??null,customerName:person?.name??'',phone:person?.id===current.customerId?current.phone:''}))} />{!form.customerId&&existing?.customerName&&<p className="arena-hint">Cliente anterior: {existing.customerName}. A seleção não altera acessos nem cobranças.</p>}</> : <><Field label="Nome do cliente ou grupo" value={form.customerName} onChange={v=>setForm({...form,customerName:v})} /><Field label="Telefone" type="tel" value={form.phone} onChange={v=>setForm({...form,phone:v})} /></>}{data.canWrite('financeEntries')&&!form.rentalGroupId&&<Field label="Valor combinado (R$)" type="money" min={0} value={form.amount} onChange={v=>setForm({...form,amount:Number(v)})} />}<Notes value={form.notes} onChange={v=>setForm({...form,notes:v})} /></Group><p className="arena-hint">O valor combinado não confirma pagamento.</p><SaveRow label="Salvar reserva" busy={save.busy} disabled={singleLesson&&!(data.canLookup?.('team') ?? data.canRead('team'))&&!form.teacherId} onCancel={()=>isNew?navigate(filters.href('/agenda')):editor.setEditing(false)} /></form></EditorPanel>:existing?<><section className="operation-card"><Status>{existing.status}</Status>{readOnly&&<p className="arena-message">Reserva preservada no histórico de uma turma excluída. Disponível somente para consulta.</p>}<h2>Reserva e cliente</h2><DetailList items={[["Tipo",existing.activityKind==='SingleLesson'?'Aula avulsa':existing.activityKind==='Trial'?'Aula experimental':existing.rentalGroupId?'Mensalista':'Locação'],["Data",displayDate(existing.date)],["Horário",`${existing.startTime}–${existing.endTime}`],...(existing.activityKind==='SingleLesson'||existing.activityKind==='Trial'?[["Professor",(data.canLookup?.('team') ?? data.canRead('team'))?data.team.find(person=>person.id===existing.teacherId)?.name??'Não informado':'Acesso restrito']] as [string,string][]:[]),["Cliente ou grupo",existing.customerName],["Telefone",formatPhone(existing.phone)],["Valor combinado",data.canRead('financeEntries')?(existing.rentalGroupId?'Incluído no acordo mensal':currency(existing.amount)):'Acesso restrito']]} />{existing.notes&&<Disclosure title="Observações e origem"><p className="detail-notes">{existing.notes}</p></Disclosure>}<div className="arena-actions">{!readOnly&&data.canWrite('reservations')&&existing.status==='Confirmada'&&<button className="primary-link" disabled={save.busy} onClick={()=>void save.run(()=>data.saveReservation({...existing,status:'Chegou'},existing.id),'Chegada registrada.')}>Confirmar chegada</button>}{!readOnly&&data.canWrite('reservations')&&existing.status==='Chegou'&&<button className="secondary-link" disabled={save.busy} onClick={()=>void save.run(()=>data.saveReservation({...existing,status:'Concluída'},existing.id),'Reserva concluída.')}>Concluir reserva</button>}{existing.rentalGroupId?<Link className="secondary-link" to={`/mensalistas/${existing.rentalGroupId}`}>Ver grupo e mensalidade →</Link>:data.canRead('financeEntries')&&<Link className="secondary-link" to={existing.activityKind==='SingleLesson'||existing.activityKind==='Trial'?`/financeiro?source=${existing.id}&sourceKind=reservations&range=all`:`/financeiro?origin=Locações&source=${existing.id}&range=all`}>Ver cobranças da reserva →</Link>}</div></section><ReservationGroupDetails reservation={existing} /></>:<Empty>{data.persistenceStatus==='connecting'?'Carregando reserva…':'Reserva não encontrada.'}</Empty>}
  </main>
}

export function SchoolPage() {
  const data = useOperations(), filters = useFilters()
  if (!data.canRead('classes')) return <NoAccess />
  const showingDeleted = filters.status === 'Excluída'
  const rows = data.classes.filter(item =>
    `${item.name} ${item.sport}`.toLocaleLowerCase('pt-BR').includes(filters.query.toLocaleLowerCase('pt-BR'))
    && (showingDeleted ? Boolean(item.deletedAt) : !item.deletedAt))
    .sort((a, b) => ((a.weekDay + 6) % 7) - ((b.weekDay + 6) % 7) || a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime) || a.name.localeCompare(b.name, 'pt-BR'))
  return <main className="operation-page arena-page arena-entry-clean">
    <Heading eyebrow="" title="Turmas" action={data.canWrite('classes') && <Link className="primary-link" to="/escola/novo">Nova turma</Link>} />
    <ClassDeletionNotice /><SchoolViewNavigation active="records" disabled={!data.canRead('reservations') || !(data.canLookup?.('courts') ?? data.canRead('courts'))} /><Feedback />
    <div className="arena-actions">
      {data.canRead('financeEntries') && <Link className="secondary-link" to="/financeiro?origin=Escola&range=all">Mensalidades →</Link>}
      <Link className="secondary-link" to={filters.href('/escola', { status: showingDeleted ? '' : 'Excluída' })}>{showingDeleted ? 'Voltar às turmas' : 'Consultar turmas excluídas'}</Link>
    </div>
    <div className="arena-toolbar"><Search filters={filters} /></div>
    {showingDeleted && <p className="arena-hint">Turmas excluídas ficam disponíveis para consulta, com seus vínculos e registros preservados.</p>}
    <ListSummary count={rows.length} label="turmas" />
    {rows.length ? <div className="project-grid">{rows.map(item => {
      const enrolled = data.enrollments.filter(enrollment => enrollment.classId === item.id && (item.deletedAt || enrollment.status === 'Ativa')).length
      return <Link className="arena-module" to={filters.href(`/escola/turmas/${item.id}`)} key={item.id}>
        <h3>{weekdays[item.weekDay]} · {item.startTime}–{item.endTime}</h3>
        <p>{item.name} · {item.sport}</p>
        <strong>{item.deletedAt ? `${enrolled} matrículas no histórico` : `${enrolled} alunos`}</strong>
        {item.deletedAt && <small>Excluída em {deletionDateLabel(item.deletedAt)}</small>}
        <span className="arena-link-label">{item.deletedAt ? 'Consultar histórico →' : 'Ver turma →'}</span>
      </Link>
    })}</div> : <Empty>Nenhuma turma nesta seleção.</Empty>}
  </main>
}
const classLevels = ['Iniciante', 'Intermediário', 'Amador', 'Profissional']
export function ClassDetailsPage(){
  const {classId}=useParams(); const navigate=useNavigate(); const location=useLocation(); const data=useOperations(); const filters=useFilters(); const save=useSave()
  const existing=data.classes.find(item=>item.id===classId); const isNew=classId==='novo'
  const editor=useEditor(existing,blankClass,isNew); const {form,setForm}=editor
  useEffect(()=>{if(isNew && data.courts.length===1 && !form.courtId)setForm(current=>({...current,courtId:data.courts[0].id}))},[isNew,data.courts,form.courtId,setForm])
  const returnTo=safeReturn(location.state?.returnTo)&&/^\/escola(?:\/agenda)?(?:\?[^#\u0000-\u0020\u007f]*)?$/.test(location.state.returnTo)?location.state.returnTo:filters.href('/escola')
  const closeEditor=()=>isNew?navigate(returnTo,{state:location.state?.returnState}):editor.setEditing(false)
  if(!data.canRead('classes'))return <NoAccess />
  async function submit(event:FormEvent){
    event.preventDefault()
    if(existing?.deletedAt)return
    const id=await save.run(()=>data.saveClass({...form,name:form.name.trim(),...(isNew?{startDate:today(),status:'Ativa' as const}:{})},isNew?editor.draftId.current:classId))
    if(id){if(isNew)navigate(filters.href(`/escola/turmas/${id}`),{state:location.state});else editor.setEditing(false)}
  }
  const canChooseTeacher=data.canLookup?.('team') ?? data.canRead('team')
  const missingCourt=isNew && data.courts.length!==1
  return <main className="operation-page arena-page arena-entry-clean">
    <Breadcrumb to={returnTo} label="Turmas" />
    <Heading eyebrow="" title={isNew?'Nova turma':existing?.name??'Turma'} action={!editor.editing&&existing&&!existing.deletedAt&&data.canWrite('classes')&&<button className="secondary-link" onClick={()=>editor.setEditing(true)}>Editar turma</button>} />
    {!editor.editing&&<Feedback action={save} />}
    {editor.editing&&!existing?.deletedAt&&data.canWrite('classes')?<EditorPanel className="arena-entry-editor" title={isNew?'Nova turma':'Editar turma'} busy={save.busy} onClose={closeEditor}>
      <Feedback action={save} /><form className="operation-card operation-form" onSubmit={submit}>
        <Group title="Turma e professor">
          <Field label="Nível" required value={form.name} onChange={name=>setForm({...form,name})} options={[...(!classLevels.includes(form.name)?[{value:form.name,label:`${form.name} (cadastro anterior)`}]:[]),...classLevels]} />
          <Field label="Esporte" required value={form.sport} onChange={sport=>setForm({...form,sport})} />
          <Field label="Professor" required disabled={!canChooseTeacher} value={form.teacherId} onChange={teacherId=>setForm({...form,teacherId})} options={[{value:'',label:'Escolha o professor'},...(canChooseTeacher?data.team.filter(item=>item.status==='Ativo'||item.id===form.teacherId).map(item=>({value:item.id,label:item.name})):form.teacherId?[{value:form.teacherId,label:'Professor atual'}]:[])]} />
        </Group>
        <Group title="Dia e horário">
          <Field label="Dia da semana" value={form.weekDay} onChange={v=>setForm({...form,weekDay:Number(v)})} options={[1,2,3,4,5,6,0].map(day=>({value:String(day),label:weekdays[day]}))} />
          <Field label="Começa às" required type="time" value={form.startTime} onChange={startTime=>setForm({...form,startTime})} />
          <Field label="Termina às" required type="end-time" placeholder="HH:mm ou 24:00" value={form.endTime} onChange={endTime=>setForm({...form,endTime})} />
          <Notes value={form.notes} onChange={notes=>setForm({...form,notes})} />
        </Group>
        {missingCourt&&<p role="alert">Não foi possível identificar a quadra única da arena. Confira o funcionamento antes de cadastrar a turma.</p>}
        <SaveRow label="Salvar turma" disabled={missingCourt||!canChooseTeacher} busy={save.busy} onCancel={closeEditor} />
      </form>
    </EditorPanel>:existing?<>
      <section className="operation-card">
        {existing.deletedAt&&<p className="arena-message">Turma excluída em {deletionDateLabel(existing.deletedAt)}. Alunos, presenças e registros financeiros preservados para consulta.</p>}
        <h2>Dia e horário</h2>
        <DetailList items={[["Nível",existing.name],["Esporte",existing.sport],["Professor",canChooseTeacher?data.team.find(item=>item.id===existing.teacherId)?.name:'Acesso restrito'],["Horário",`${weekdays[existing.weekDay]} · ${existing.startTime}–${existing.endTime}`]]} />
        {existing.notes&&<Disclosure title="Observações"><p className="detail-notes">{existing.notes}</p></Disclosure>}
        <ClassDeletionAction key={existing.id} lesson={existing} returnTo={returnTo} returnState={location.state?.returnState} />
      </section>
      <ClassStudents key={existing.id} lesson={existing} />
      {data.canRead('presences')&&<Disclosure title={existing.deletedAt?'Histórico de presenças':'Presenças da turma'}><PresencesPage embeddedClassId={existing.id} /></Disclosure>}
    </>:<Empty>{data.persistenceStatus==='connecting'?'Carregando turma…':'Turma não encontrada.'}</Empty>}
  </main>
}

export function SchoolLegacyRedirect() {
  const location=useLocation(); const classId=new URLSearchParams(location.search).get('class')
  return <Navigate replace to={classId ? `/escola/turmas/${encodeURIComponent(classId)}` : '/escola'} />
}

export function EnrollmentsPage(){
  const data=useOperations();const filters=useFilters();const save=useSave();const draftId=useRef(crypto.randomUUID());const {form,setForm,editId,open:openForm,close:closeForm}=useRecordForm(data.enrollments,()=>({name:'',studentId:filters.params.get('student')??'',classId:filters.params.get('class')??'',startDate:today(),status:'Ativa' as const,monthlyAmount:null}))
  const [addingStudent,setAddingStudent]=useState(false);const [studentBusy,setStudentBusy]=useState(false);const studentField=useRef<HTMLDivElement>(null)
  if(!data.canRead('enrollments'))return <NoAccess />
  const close=()=>{setAddingStudent(false);closeForm()}
  const returnToStudent=()=>{setAddingStudent(false);requestAnimationFrame(()=>studentField.current?.querySelector<HTMLSelectElement>('select')?.focus())}
  const readOnlyEnrollment=(item:Pick<Enrollment,'classId'|'closedByClassDeletion'>)=>Boolean(item.closedByClassDeletion||data.classes.find(lesson=>lesson.id===item.classId)?.deletedAt)
  const selectedClass=data.classes.find(lesson=>lesson.id===filters.params.get('class'))
  const open=(item?:Enrollment)=>{if(item&&readOnlyEnrollment(item))return;draftId.current=crypto.randomUUID();setAddingStudent(false);openForm(item)}
  async function submit(event:FormEvent){event.preventDefault();if(!form||addingStudent||studentBusy||readOnlyEnrollment(form))return;const student=data.students.find(item=>item.id===form.studentId);const lesson=data.classes.find(item=>item.id===form.classId);const id=await save.run(()=>data.saveEnrollment({...form,name:`${student?.name??'Aluno'} · ${lesson?.name??'Turma'}`},editId??draftId.current));if(id)close()}
  const rows=data.enrollments.filter(item=>(!filters.params.get('enrollment')||item.id===filters.params.get('enrollment'))&&(!filters.params.get('class')||item.classId===filters.params.get('class'))&&(!filters.params.get('student')||item.studentId===filters.params.get('student'))&&(!filters.status||item.status===filters.status))
  return <main className="operation-page arena-page arena-entry-clean"><Breadcrumb to="/escola" label="Turmas" /><Heading eyebrow="" title="Matrículas" action={data.canWrite('enrollments')&&!selectedClass?.deletedAt&&<button className="primary-link" onClick={()=>open()}>Matricular aluno</button>} />{!form&&<Feedback action={save} />}
    {form&&!readOnlyEnrollment(form)&&data.canWrite('enrollments')&&<EditorPanel className="arena-entry-editor" title="Matrícula" busy={save.busy||studentBusy} onClose={close}><Feedback action={save}/><form className="operation-card operation-form" onSubmit={submit}><Group title="Aluno e turma"><div ref={studentField}><Field label="Aluno" required disabled={addingStudent||save.busy} value={form.studentId} onChange={v=>setForm({...form,studentId:v})} options={[{value:'',label:'Escolha o aluno'},...data.students.map(item=>({value:item.id,label:item.name}))]} /></div>{data.canRead('students')&&data.canWrite('students')&&!addingStudent&&<button type="button" className="secondary-link" disabled={save.busy} onClick={()=>setAddingStudent(true)}>+ Cadastrar aluno</button>}{addingStudent&&<EnrollmentStudentPicker key={editId??draftId.current} contextKey={`enrollment:${editId??'novo'}`} onBusyChange={setStudentBusy} onCancel={returnToStudent} onSelect={studentId=>{setForm(current=>current?{...current,studentId}:current);returnToStudent()}} />}<Field label="Turma" required disabled={studentBusy} value={form.classId} onChange={v=>setForm({...form,classId:v})} options={[{value:'',label:'Escolha a turma'},...data.classes.filter(item=>!item.deletedAt&&(item.status==='Ativa'||item.id===form.classId)).map(item=>({value:item.id,label:item.name}))]} /><Field label="Início da matrícula" type="date" required value={form.startDate} onChange={v=>setForm({...form,startDate:v})} />{data.canWrite('financeEntries')&&<Field label="Mensalidade combinada (R$)" type="money" min={0} value={form.monthlyAmount ?? ''} onChange={v=>setForm({...form,monthlyAmount:v === '' ? null : Number(v)})} />}<Field label="Situação" value={form.status} onChange={v=>setForm({...form,status:v as Enrollment['status'],endDate:v==='Encerrada'?(form.endDate||today()):''})} options={['Ativa','Encerrada']} />{form.status==='Encerrada'&&<Field label="Data de encerramento" type="date" required value={form.endDate??''} onChange={v=>setForm({...form,endDate:v})} />}</Group><SaveRow label="Salvar matrícula" busy={save.busy||studentBusy} disabled={addingStudent} onCancel={close} /></form></EditorPanel>}
    <div className="arena-toolbar"><Field label="Turma" value={filters.params.get('class')??''} onChange={v=>filters.set('class',v)} options={[{value:'',label:'Todas'},...data.classes.map(item=>({value:item.id,label:`${item.name}${item.deletedAt?' · Excluída':''}`}))]} /><Field label="Situação" value={filters.status} onChange={v=>filters.set('status',v)} options={[{value:'',label:'Todas'},'Ativa','Encerrada']} /></div><ListSummary count={rows.length} label="matrículas" />
    {selectedClass?.deletedAt && <p className="arena-message">Matrículas preservadas no histórico da turma excluída. Os lançamentos financeiros continuam disponíveis para consulta.</p>}
    {rows.length ? <div className="record-list">{rows.map(item => {
      const lesson = data.classes.find(value => value.id === item.classId)
      const readOnly = readOnlyEnrollment(item)
      return <article className="record-row" key={item.id}>
        <span className="record-main"><strong>{data.students.find(student => student.id === item.studentId)?.name ?? item.name}</strong>
          <small>{lesson?.name} · {item.cancelledBeforeStart ? `Cancelada antes do início previsto em ${displayDate(item.startDate)}` : `desde ${displayDate(item.startDate)}${item.endDate ? ` · até ${displayDate(item.endDate)}` : ''}`}{data.canRead('financeEntries') && <> · {item.monthlyAmount === null ? 'Mensalidade a combinar' : `${currency(item.monthlyAmount)}/mês`}</>}</small>
          {readOnly && <small>Histórico da turma excluída</small>}
        </span>
        <Status>{item.status}</Status>
        <span className="arena-record-actions"><Link to={`/alunos/${item.studentId}`}>Ver aluno →</Link>
          {data.canWrite('enrollments') && !readOnly && <button className="text-button" onClick={() => open(item)}>Editar matrícula</button>}
          {data.canWrite('financeEntries') && !readOnly && <Link to={`/financeiro/novo?origin=Escola&source=${item.id}&sourceKind=enrollments`}>Criar mensalidade →</Link>}
          {readOnly && data.canRead('financeEntries') && <Link to={`/financeiro?origin=Escola&source=${item.id}&sourceKind=enrollments&range=all`}>Ver cobranças →</Link>}
        </span>
      </article>
    })}</div> : <Empty>Nenhuma matrícula nesta seleção.</Empty>}
  </main>
}

export function PresencesPage({ embeddedClassId }: { embeddedClassId?: string } = {}) {
  const data = useOperations(), filters = useFilters(), save = useSave()
  const classId = embeddedClassId ?? filters.params.get('class') ?? ''
  const lesson = data.classes.find(item => item.id === classId)
  const archived = Boolean(lesson?.deletedAt)
  const date = filters.params.get('date') ?? (archived ? '' : today())
  if (!data.canRead('presences')) return <NoAccess />
  const rows = data.enrollments.filter(item => item.classId === classId && enrollmentCoversDate(item, date))
  const registered = data.presences.filter(item => item.classId === classId && (!date || item.date === date))
    .sort((first, second) => second.date.localeCompare(first.date))
  const Container = embeddedClassId ? 'section' : 'main'
  return <Container className="operation-page arena-page arena-entry-clean">
    {!embeddedClassId && <Breadcrumb to="/escola" label="Turmas" />}<Heading eyebrow="" title={archived ? 'Histórico de presenças' : 'Presenças'} /><Feedback action={save} />
    <div className="arena-toolbar">
      {!embeddedClassId && <Field label="Turma" value={classId} onChange={value => filters.set('class', value)} options={[{ value: '', label: 'Escolha a turma' }, ...data.classes.map(item => ({ value: item.id, label: `${item.name}${item.deletedAt ? ' · Excluída' : ''}` }))]} />}
      <Field label="Data da aula" type="date" value={date} onChange={value => filters.set('date', value)} />
      {archived && date && <button className="text-button" onClick={() => filters.set('date', '')}>Ver todas as datas</button>}
    </div>
    {archived && <p className="arena-message">Turma excluída. As presenças registradas foram preservadas para consulta.</p>}
    {!classId ? <Empty>Selecione uma turma.</Empty> : archived ? registered.length ? <div className="record-list">{registered.map(presence =>
      <article className="record-row" key={presence.id}>
        <span className="record-main"><strong>{data.students.find(student => student.id === presence.studentId)?.name ?? presence.name}</strong><small>{displayDate(presence.date)}</small></span>
        <Status>{presence.status}</Status>
      </article>)}</div> : <Empty>Nenhuma presença registrada nesta seleção.</Empty> : rows.length ? <div className="record-list">{rows.map(item => {
      const student = data.students.find(value => value.id === item.studentId)
      const presence = registered.find(value => value.studentId === item.studentId)
      return <article className="record-row" key={item.id}>
        <span className="record-main"><strong>{student?.name ?? item.name}</strong><small>{presence?.status ?? 'Ainda não marcado'}</small></span>
        <span className="arena-record-actions">{(['Presente', 'Ausente'] as const).map(status =>
          <button key={status} className={presence?.status === status ? 'primary-link' : 'secondary-link'} aria-pressed={presence?.status === status} disabled={!data.canWrite('presences') || save.busy}
            onClick={() => void save.run(() => data.savePresence({ ...presence, name: `${student?.name ?? 'Aluno'} · ${displayDate(date)}`, classId, studentId: item.studentId, date, status }, presence?.id), 'Presença registrada.')}>{status}</button>)}</span>
      </article>
    })}</div> : <Empty>Esta turma ainda não tem matrículas ativas.</Empty>}
  </Container>
}

export function FinancePage(){
  const {user}=useAuth()
  const data=useOperations();const filters=useFilters();const month=today().slice(0,7)
  const monthEnd=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10)
  const from=filters.params.get('from')??month+'-01';const to=filters.params.get('to')??monthEnd
  const all=filters.params.get('range')==='all';const field=filters.params.get('dateField')==='paidDate'?'paidDate':'dueDate'
  if(!data.canRead('financeEntries'))return <NoAccess />
  const rows=data.financeEntries.filter(item=>`${item.name} ${item.notes}`.toLocaleLowerCase('pt-BR').includes(filters.query.toLocaleLowerCase('pt-BR'))&&(!filters.status||item.status===filters.status)&&(!filters.params.get('direction')||item.direction===filters.params.get('direction'))&&(!filters.params.get('origin')||item.origin===filters.params.get('origin'))&&(!filters.params.get('unit')||allocationChoice(item.origin,item)===filters.params.get('unit'))&&(!filters.params.get('source')||item.sourceId===filters.params.get('source'))&&(!filters.params.get('sourceKind')||item.sourceKind===filters.params.get('sourceKind'))&&(filters.params.get('overdue')!=='1'||item.status==='Pendente'&&item.dueDate<today())&&(all||item[field]>=from&&item[field]<=to))
  const advanced=['direction','origin','status','dateField','overdue','source'].filter(key=>filters.params.get(key)).length
  const valid=all||validDate(from)&&validDate(to)&&from<=to
  return <main className="operation-page arena-page finance-clean"><Heading eyebrow="" title="Lançamentos" action={data.canWrite('financeEntries')&&<Link className="primary-link" to={filters.href('/financeiro/novo')}>Novo lançamento</Link>} /><Feedback />
    <p className="arena-hint">{all?'Todas as datas':`${displayDate(from)} a ${displayDate(to)}`} · Por {field==='paidDate'?'pagamento registrado':'vencimento'}</p>
    {valid&&data.dataUpdatedAt&&data.persistenceStatus!=='connecting'&&data.persistenceStatus!=='error'?<div className="summary-row">{([['Receber','Pendente','A receber · valor original'],['Receber','Pago','Recebimentos registrados'],['Pagar','Pendente','A pagar · pendentes'],['Pagar','Pago','Despesas pagas']] as const).map(([direction,status,label])=><div key={label}><strong>{currency(rows.filter(item=>item.direction===direction&&item.status===status).reduce((sum,item)=>sum+item.amount,0))}</strong><span>{label} · nesta seleção</span></div>)}</div>:!valid?<p role="alert" className="arena-message arena-error">Escolha datas válidas. A data final precisa ser igual ou posterior à inicial.</p>:<p className="arena-message">Ainda não disponível · aguarde a atualização da fonte de dados.</p>}
    <div className="compact-filters"><Search filters={filters} placeholder="Buscar lançamento…" /><Field label="Unidade / destinação" value={filters.params.get('unit')??''} onChange={v=>filters.set('unit',v)} options={[{value:'',label:'Todas · inclui compartilhados e a classificar'},...allocationOptions]} /><Field label="Período" value={all?'all':'period'} onChange={v=>filters.set('range',v)} options={[{value:'period',label:'Datas selecionadas'},{value:'all',label:'Todas as datas'}]} />{!all&&<><Field label="De" type="date" value={from} onChange={v=>filters.set('from',v)} /><Field label="Até" type="date" value={to} onChange={v=>filters.set('to',v)} /></>}</div>
    <Disclosure title="Mais filtros" count={advanced}><div className="arena-toolbar"><Field label="Tipo" value={filters.params.get('direction')??''} onChange={v=>filters.set('direction',v)} options={[{value:'',label:'Receber e pagar'},'Receber','Pagar']} /><Field label="Origem" value={filters.params.get('origin')??''} onChange={v=>filters.set('origin',v)} options={[{value:'',label:'Todas'},'Bar','Escola','Locações','Arena']} /><Field label="Situação" value={filters.status} onChange={v=>filters.set('status',v)} options={[{value:'',label:'Todas'},'Pendente','Pago','Cancelado']} /><Field label="Data de referência" value={field} onChange={v=>filters.set('dateField',v)} options={[{value:'dueDate',label:'Vencimento'},{value:'paidDate',label:'Pagamento registrado'}]} /><Field label="Prazo" value={filters.params.get('overdue')??''} onChange={v=>filters.set('overdue',v)} options={[{value:'',label:'Todos os prazos'},{value:'1',label:'Vencidos e pendentes'}]} /></div>{filters.params.get('source')&&<p>Exibindo os lançamentos vinculados ao registro de origem.</p>}{advanced>0&&<Link className="text-button" to={filters.href('/financeiro',{direction:'',origin:'',status:'',dateField:'',overdue:'',source:'',sourceKind:'',page:''})}>Limpar filtros adicionais</Link>}</Disclosure>
    <ListSummary count={rows.length} label="lançamentos" />
    {valid&&(rows.length?<Pagination total={rows.length}>{(start,end)=><div className="record-list">{[...rows].sort((a,b)=>a[field].localeCompare(b[field])).slice(start,end).map(item=><ContextLink state={{returnLabel:'Lançamentos'}} className="record-row" key={item.id} to={filters.href(`/financeiro/${item.id}`)}><span className="record-main"><strong>{item.name}</strong><small>{item.direction} · {allocationLabel(item.origin,item)} · {item.origin} · {field==='paidDate'?'Pago em':'Vence em'} {displayDate(item[field])}</small></span><Status warning={item.status==='Pendente'&&item.dueDate<today()}>{item.status==='Pendente'&&item.dueDate<today()?'Vencido':item.status}</Status><strong>{currency(item.amount)}</strong><span>Ver detalhes →</span></ContextLink>)}</div>}</Pagination>:<Empty action={isManagement(user)&&<Link to="/financeiro/historico">Consultar histórico importado →</Link>}>Nenhum lançamento nesta seleção.</Empty>)}
    <p className="arena-hint">Valores originais, não saldos bancários. Confira pagamentos parciais e estornos na Visão financeira. Recebimentos do Bar e confirmações manuais podem já estar incluídos; confira antes de somar.</p>
    {(!filters.params.get('unit')||filters.params.get('unit')==='bar')&&<Disclosure title="Bar e caixa" lazy><p className="arena-hint">Os indicadores do Bar podem já estar nos lançamentos acima. Confira a composição antes de somar.</p><BarArenaMetrics from={from} to={to} /></Disclosure>}
  </main>
}
export function FinanceDetailsPage(){
  const{entryId}=useParams();const navigate=useNavigate();const data=useOperations();const filters=useFilters();const save=useSave();const existing=data.financeEntries.find(item=>item.id===entryId);const isNew=entryId==='novo';const source=filters.params.get('source')??''
  const sourceKind=(filters.params.get('sourceKind')??(filters.params.get('origin')==='Locações'?'reservations':filters.params.get('origin')==='Escola'?'enrollments':undefined)) as FinanceEntry['sourceKind']
  const validSourceKind=sourceKind&&['enrollments','reservations','projects','maintenance','rentalMonths'].includes(sourceKind)?sourceKind:undefined
  const rentalMonth=validSourceKind==='rentalMonths'?data.rentalMonths.find(item=>item.id===source):undefined
  const enrollment=validSourceKind==='enrollments'?data.enrollments.find(item=>item.id===source):undefined;const reservation=validSourceKind==='reservations'?data.reservations.find(item=>item.id===source):undefined;const maintenance=validSourceKind==='maintenance'?data.maintenance.find(item=>item.id===source):undefined;const project=validSourceKind==='projects'?data.projects.find(item=>item.id===source):undefined
  const editor=useEditor(existing,()=>({...blankFinance(),...(source&&validSourceKind?{sourceId:source,sourceKind:validSourceKind}:{}),...(validSourceKind==='enrollments'?{origin:'Escola' as const,month:today().slice(0,7)}:{}),...(validSourceKind==='rentalMonths'?{origin:'Locações' as const,month:filters.params.get('month')??today().slice(0,7)}:{}),...(validSourceKind==='reservations'?{origin:reservation?.activityKind==='SingleLesson'?'Escola' as const:'Locações' as const}:{}),...(['maintenance','projects'].includes(validSourceKind??'')?{origin:'Arena' as const,direction:'Pagar' as const}:{})}),isNew);const{form,setForm}=editor;const sourcePrefilled=useRef('');const originChanged=useRef(false)
  useEffect(()=>{if(!isNew||!source||sourcePrefilled.current===source||(!enrollment&&!reservation&&!maintenance&&!project&&!rentalMonth))return;sourcePrefilled.current=source;setForm(current=>({...current,name:current.name||(rentalMonth?`Mensalista · ${rentalMonth.name}`:enrollment?`Mensalidade · ${enrollment.name}`:reservation?`${reservation.activityKind==='SingleLesson'?'Aula avulsa':'Locação'} · ${reservation.name}`:maintenance?`Manutenção · ${maintenance.name}`:`Projeto · ${project!.name}`),amount:current.amount||rentalMonth?.amount||enrollment?.monthlyAmount||reservation?.amount||0,...(reservation?.activityKind==='SingleLesson'&&!originChanged.current?{origin:'Escola' as const}:{}),...(rentalMonth?{dueDate:rentalMonth.dueDate,month:rentalMonth.month}:{})}))},[isNew,source,enrollment,reservation,maintenance,project,rentalMonth,setForm])
  if(!data.canRead('financeEntries'))return <NoAccess />
  if(existing && 'expense' in existing) return <Navigate replace to={`/financeiro/despesas?acao=ver&registro=${encodeURIComponent(existing.id)}`} />
  async function submit(event:FormEvent){event.preventDefault();const id=await save.run(()=>data.saveFinanceEntry({...form,...allocationFields(allocationChoice(form.origin,form))},isNew?editor.draftId.current:entryId));if(id){if(isNew)navigate(filters.href(`/financeiro/${id}`));else editor.setEditing(false)}}
  const sourceHref=existing?.sourceId&&existing.sourceKind&&data.canRead(existing.sourceKind)?existing.sourceKind==='enrollments'?`/escola/matriculas?enrollment=${existing.sourceId}`:existing.sourceKind==='reservations'?`/agenda/${existing.sourceId}`:existing.sourceKind==='projects'?`/projetos/${existing.sourceId}`:existing.sourceKind==='maintenance'?`/manutencao/${existing.sourceId}`:existing.sourceKind==='rentalMonths'?`/mensalistas/${data.rentalMonths.find(m=>m.id===existing.sourceId)?.rentalGroupId}`:undefined:undefined
  return <main className="operation-page arena-page finance-clean"><Breadcrumb to={filters.href('/financeiro')} label="Financeiro" /><Heading eyebrow="" title={isNew?'Novo lançamento':existing?.name??'Lançamento'} action={!editor.editing&&existing&&data.canWrite('financeEntries')&&<button className="secondary-link" onClick={()=>editor.setEditing(true)}>Editar lançamento</button>} />{!editor.editing&&<Feedback action={save} />}
    {editor.editing&&data.canWrite('financeEntries')?<EditorPanel className="finance-clean" title={isNew?'Novo lançamento':'Editar lançamento'} busy={save.busy} onClose={()=>isNew?navigate(filters.href('/financeiro')):editor.setEditing(false)}><Feedback action={save} /><form className="operation-card operation-form" onSubmit={submit}><Group title="Valor e origem"><Field label="Descrição do lançamento" required value={form.name} onChange={v=>setForm({...form,name:v})} /><Field label="Tipo" value={form.direction} onChange={v=>setForm({...form,direction:v as FinanceEntry['direction'],...(v==='Pagar'?{receiptSource:null,receivingAccount:null}:{})})} options={['Receber','Pagar']} /><Field label="Origem" value={form.origin} onChange={v=>{originChanged.current=true;setForm({...form,origin:v as FinanceEntry['origin'],receiptSource:null,...allocationFields(allocationChoice(v,{}))})}} options={['Arena','Bar','Escola','Locações']} /><BusinessAllocationField origin={form.origin} value={form} receiptBusinessUnit={receiptUnit(form.receiptSource)} onChange={value=>setForm({...form,...value})} />{form.direction==='Receber'&&<ReceiptSourceFields origin={form.origin} value={form} onChange={value=>setForm({...form,...value})} />}<Field label="Valor (R$)" required type="money" min={0.01} step="0.01" value={form.amount} onChange={v=>setForm({...form,amount:Number(v)})} />{(form.sourceKind==='enrollments'||form.sourceKind==='rentalMonths')&&<Field label="Competência da mensalidade" type="month" required value={form.month??''} onChange={v=>setForm({...form,month:v})} />}</Group><Group title="Vencimento e confirmação"><Field label="Vencimento" type="date" required value={form.dueDate} onChange={v=>setForm({...form,dueDate:v})} /><Field label="Situação" value={form.status} onChange={v=>setForm({...form,status:v as FinanceEntry['status'],paidDate:v==='Pago'?(form.paidDate||today()):''})} options={['Pendente','Pago','Cancelado']} />{form.status==='Pago'&&<Field label="Data do pagamento registrado" type="date" required value={form.paidDate} onChange={v=>setForm({...form,paidDate:v})} />}<Notes label="Referência e observações" value={form.notes} onChange={v=>setForm({...form,notes:v})} /></Group><p className="arena-hint">Marcar como pago é uma confirmação manual do Gestor; não confirma o crédito no banco.</p><SaveRow label="Salvar lançamento" busy={save.busy} onCancel={()=>isNew?navigate(filters.href('/financeiro')):editor.setEditing(false)} /></form></EditorPanel>:existing?<section className="operation-card"><Status warning={existing.status==='Pendente'&&existing.dueDate<today()}>{existing.status}</Status><p className="arena-hint">Valor original do lançamento</p><h2>{currency(existing.amount)}</h2><DetailList items={[["Tipo",existing.direction],["Origem",existing.origin],["Unidade / destinação",allocationLabel(existing.origin,existing)],...(existing.direction==='Receber'?[["Origem do recebimento",receiptSourceLabel(existing.receiptSource)],["Conta de recebimento",existing.receivingAccount??'Não informada']] as [string,string][]:[]),["Vencimento",displayDate(existing.dueDate)],["Pagamento registrado",existing.status==='Pago'?displayDate(existing.paidDate):'Ainda não confirmado'],["Competência",existing.month?formatMonth(existing.month):'Não se aplica'],["Referência",existing.id]]} />{existing.notes&&<Disclosure title="Observações e origem"><p className="detail-notes">{existing.notes}</p></Disclosure>}{sourceHref&&<Link className="secondary-link" to={sourceHref}>Ver registro de origem →</Link>}<p className="arena-hint">Situação informada no lançamento. Consulte o pagamento para confirmar o crédito no banco.</p></section>:<Empty>{data.persistenceStatus==='connecting'?'Carregando lançamento…':'Lançamento não encontrado.'}</Empty>}
  </main>
}

export function MaintenancePage(){
  const data=useOperations();const filters=useFilters();if(!data.canRead('maintenance'))return <NoAccess />
  const rows=data.maintenance.filter(item=>`${item.name} ${item.area} ${item.owner}`.toLocaleLowerCase('pt-BR').includes(filters.query.toLocaleLowerCase('pt-BR'))&&(!filters.params.get('priority')||item.priority===filters.params.get('priority'))&&(!filters.status||(filters.status==='open'?!['Concluída','Cancelada'].includes(item.status):item.status===filters.status)))
  return <main className="operation-page arena-page arena-entry-clean"><Heading eyebrow="" title="Manutenção" action={data.canWrite('maintenance')&&<Link className="primary-link" to={filters.href('/manutencao/novo')}>Nova manutenção</Link>} /><Feedback /><div className="arena-toolbar"><Search filters={filters} /><Field label="Situação" value={filters.status} onChange={v=>filters.set('status',v)} options={[{value:'',label:'Todas'},{value:'open',label:'Serviços abertos'},'Aberta','Em andamento','Concluída','Cancelada']} /><Field label="Prioridade" value={filters.params.get('priority')??''} onChange={v=>filters.set('priority',v)} options={[{value:'',label:'Todas'},'Normal','Urgente']} /></div><ListSummary count={rows.length} label="serviços" />
    {rows.length?<div className="project-grid">{rows.map(item=><Link className="arena-module" key={item.id} to={filters.href(`/manutencao/${item.id}`)}><Status warning={item.priority==='Urgente'}>{item.priority} · {item.status}</Status><h3>{item.name}</h3><p>{item.area} · {item.owner||'Responsável a definir'}<br />Prazo: {displayDate(item.dueDate)}</p><span className="arena-link-label">Ver serviço →</span></Link>)}</div>:<Empty>Nenhum serviço nesta seleção.</Empty>}
  </main>
}
export function MaintenanceDetailsPage(){
  const{maintenanceId}=useParams();const navigate=useNavigate();const data=useOperations();const filters=useFilters();const save=useSave();const existing=data.maintenance.find(item=>item.id===maintenanceId);const isNew=maintenanceId==='novo';const editor=useEditor(existing,blankMaintenance,isNew);const{form,setForm}=editor
  if(!data.canRead('maintenance'))return <NoAccess />
  async function submit(event:FormEvent){event.preventDefault();const id=await save.run(()=>data.saveMaintenance(form,isNew?editor.draftId.current:maintenanceId));if(id){if(isNew)navigate(filters.href(`/manutencao/${id}`));else editor.setEditing(false)}}
  return <main className="operation-page arena-page arena-entry-clean"><Breadcrumb to={filters.href('/manutencao')} label="Manutenção" /><Heading eyebrow="" title={isNew?'Nova manutenção':existing?.name??'Serviço'} action={!editor.editing&&existing&&data.canWrite('maintenance')&&<button className="secondary-link" onClick={()=>editor.setEditing(true)}>Editar serviço</button>} />{!editor.editing&&<Feedback action={save} />}
    {editor.editing&&data.canWrite('maintenance')?<EditorPanel className="arena-entry-editor" title={isNew?'Nova manutenção':'Editar manutenção'} busy={save.busy} onClose={()=>isNew?navigate(filters.href('/manutencao')):editor.setEditing(false)}><Feedback action={save} /><form className="operation-card operation-form" onSubmit={submit}><Group title="Serviço e responsável"><Field label="Nome do serviço" required value={form.name} onChange={v=>setForm({...form,name:v})} /><Field label="Área ou equipamento" required value={form.area} onChange={v=>setForm({...form,area:v})} /><Field label="Responsável" value={form.owner} onChange={v=>setForm({...form,owner:v})} /><Field label="Prazo" type="date" value={form.dueDate} onChange={v=>setForm({...form,dueDate:v})} /><Field label="Prioridade" value={form.priority} onChange={v=>setForm({...form,priority:v as Maintenance['priority']})} options={['Normal','Urgente']} /><Field label="Situação" value={form.status} onChange={v=>setForm({...form,status:v as Maintenance['status']})} options={['Aberta','Em andamento','Concluída','Cancelada']} /><Notes label="Detalhes e observações" value={form.notes} onChange={v=>setForm({...form,notes:v})} /></Group><SaveRow label="Salvar serviço" busy={save.busy} onCancel={()=>isNew?navigate(filters.href('/manutencao')):editor.setEditing(false)} /></form></EditorPanel>:existing?<section className="operation-card"><Status warning={existing.priority==='Urgente'}>{existing.priority} · {existing.status}</Status><h2>Detalhes do serviço</h2><DetailList items={[["Área ou equipamento",existing.area],["Responsável",existing.owner],["Prazo",displayDate(existing.dueDate)],["Referência",existing.id]]} />{existing.notes&&<Disclosure title="Observações e origem"><p className="detail-notes">{existing.notes}</p></Disclosure>}{data.canRead('financeEntries')&&<Link className="secondary-link" to={`/financeiro?origin=Arena&direction=Pagar&source=${existing.id}&sourceKind=maintenance&range=all`}>Ver despesas vinculadas →</Link>}</section>:<Empty>{data.persistenceStatus==='connecting'?'Carregando serviço…':'Manutenção não encontrada.'}</Empty>}
  </main>
}
