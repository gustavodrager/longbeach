import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useOperations } from '../operations/DemoDataProvider'
import { EnrollmentStudentPicker } from './EnrollmentStudentPicker'
import type { ArenaClass, Enrollment } from './types'
import { Disclosure, EditorPanel } from '../../components/managementUi'
import { Empty, Feedback, Field, SaveRow, currency, displayDate, today, useSave } from '../../pages/arenaUi'

export function ClassStudents({ lesson }: { lesson: ArenaClass }) {
  const data = useOperations(), save = useSave()
  const [adding, setAdding] = useState(false), [studentId, setStudentId] = useState(''), [studentBusy, setStudentBusy] = useState(false)
  const [monthlyAmount, setMonthlyAmount] = useState<number | null>(null)
  const [editing, setEditing] = useState<Enrollment | null>(null)
  const attempt = useRef(crypto.randomUUID())
  const rows = data.enrollments.filter(row => row.classId === lesson.id)
  const canAdd = !lesson.deletedAt && data.canWrite('enrollments') && data.canRead('students')
  const canEditMonthlyAmount = (row: Enrollment) => !lesson.deletedAt && row.status === 'Ativa' && row.costsVisible !== false
    && !row.closedByClassDeletion && !row.cancelledBeforeStart
    && data.canWrite('enrollments') && data.canRead('financeEntries') && data.canWrite('financeEntries')
  function close() { setAdding(false); setStudentId(''); setMonthlyAmount(null) }
  async function include() {
    if (!studentId || studentBusy || !canAdd) return
    const student = data.students.find(row => row.id === studentId)
    const id = await save.run(() => data.saveEnrollment({ name: `${student?.name ?? 'Aluno'} · ${lesson.name}`, studentId, classId: lesson.id, startDate: today(), status: 'Ativa', monthlyAmount }, attempt.current))
    if (id) close()
  }
  async function updateMonthlyAmount(event: FormEvent) {
    event.preventDefault()
    if (!editing || !canEditMonthlyAmount(editing)) return
    const id = await save.run(() => data.saveEnrollment(editing, editing.id), 'Mensalidade atualizada.')
    if (id) setEditing(null)
  }
  if (!data.canRead('enrollments')) return <section className="operation-card"><p>Acesso restrito aos alunos desta turma.</p></section>
  return <section className="operation-card">
    <h2>{lesson.deletedAt ? 'Histórico de matrículas' : 'Alunos da turma'}</h2>
    {!editing && <Feedback action={save} />}
    {editing && canEditMonthlyAmount(editing) && <EditorPanel title="Editar mensalidade" busy={save.busy} onClose={() => setEditing(null)}>
      <form className="operation-form" onSubmit={updateMonthlyAmount}>
        <p><strong>{data.students.find(student => student.id === editing.studentId)?.name ?? editing.name}</strong></p>
        <Feedback action={save} />
        <Field label="Mensalidade nesta turma (R$)" type="money" min={0} disabled={save.busy} value={editing.monthlyAmount ?? ''}
          onChange={value => setEditing(current => current ? { ...current, monthlyAmount: value === '' ? null : Number(value) } : current)} />
        <p className="arena-hint">Para alunos em mais de uma turma, a soma desses valores forma a mensalidade do aluno. Deixe em branco se estiver a combinar.</p>
        <p className="arena-hint">Cobranças já emitidas mantêm os valores registrados.</p>
        <SaveRow label="Salvar mensalidade" busy={save.busy} onCancel={() => setEditing(null)} />
      </form>
    </EditorPanel>}
    {canAdd && !adding && <button className="primary-link" onClick={() => { attempt.current = crypto.randomUUID(); setAdding(true) }}>Incluir aluno</button>}
    {adding && canAdd && <div role="group" aria-label="Incluir aluno na turma">
      {!studentId ? <>
        {(!data.customerRegistryEnabled || !data.canWrite('students')) && <Field label="Aluno já cadastrado" value={studentId} onChange={setStudentId} options={[{value:'',label:'Escolha um aluno'}, ...data.students.filter(student => !rows.some(row => row.studentId === student.id && row.status === 'Ativa')).map(student => ({value:student.id,label:student.name}))]} />}
        <EnrollmentStudentPicker contextKey={`class:${lesson.id}:${attempt.current}`} simplified onBusyChange={setStudentBusy} onCancel={close} onSelect={setStudentId} />
      </> : <><p>Aluno: <strong>{data.students.find(row => row.id === studentId)?.name ?? 'Cadastro selecionado'}</strong></p>
        {data.canWrite('financeEntries') && <Field label="Mensalidade combinada (R$)" type="money" min={0} value={monthlyAmount ?? ''} onChange={value => setMonthlyAmount(value === '' ? null : Number(value))} />}
        <button className="primary-link" disabled={save.busy || studentBusy} onClick={() => void include()}>Confirmar inclusão</button>
        <button className="text-button" disabled={save.busy} onClick={() => setStudentId('')}>Trocar aluno</button>
        <button className="text-button" disabled={save.busy} onClick={close}>Cancelar</button>
      </>}
    </div>}
    {lesson.deletedAt && lesson.studentIds?.length > 0 && <Disclosure title="Alunos vinculados no cadastro anterior">{data.canRead('students') ? <ul>{lesson.studentIds.map(id => <li key={id}><Link to={`/alunos/${id}`}>{data.students.find(student => student.id === id)?.name ?? 'Cadastro de aluno não disponível'}</Link></li>)}</ul> : <p>Acesso restrito aos alunos.</p>}</Disclosure>}
    {rows.length ? <div className="record-list">{rows.map(row => <article className="record-row" key={row.id}>
      <span className="record-main"><strong>{data.students.find(student => student.id === row.studentId)?.name ?? row.name}</strong>
        <small>{row.cancelledBeforeStart ? 'Cancelada antes do início' : `Desde ${displayDate(row.startDate)}${row.endDate ? ` · até ${displayDate(row.endDate)}` : ''}`}</small>
        {data.canRead('financeEntries') && <small>{row.monthlyAmount == null ? 'Mensalidade a combinar' : `${currency(row.monthlyAmount)}/mês`}</small>}
      </span>
      {data.canRead('financeEntries') && <Link to={`/financeiro?origin=Escola&source=${row.id}&sourceKind=enrollments&range=all`}>Ver cobranças</Link>}
      {canEditMonthlyAmount(row) && <button type="button" className="text-button" disabled={save.busy}
        aria-label={`Editar mensalidade de ${data.students.find(student => student.id === row.studentId)?.name ?? row.name}`}
        onClick={() => setEditing({ ...row })}>Editar mensalidade</button>}
      {!lesson.deletedAt && row.status === 'Ativa' && data.canWrite('enrollments') && <button className="text-button" disabled={save.busy} onClick={() => void save.run(() => data.saveEnrollment({...row,status:'Encerrada',endDate:today()},row.id),'Aluno retirado da turma. Histórico preservado.')}>Retirar da turma</button>}
      {row.status === 'Encerrada' && <small>Histórico</small>}
    </article>)}</div> : <Empty>{lesson.deletedAt ? 'Nenhuma matrícula registrada nesta turma.' : 'Nenhum aluno incluído nesta turma.'}</Empty>}
  </section>
}
