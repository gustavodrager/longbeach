import { Link } from 'react-router-dom'
import { ModalPanel, ContextLink } from '../components/managementUi'
import { useOperations } from '../features/operations/DemoDataProvider'
import type { ArenaClass, Reservation } from '../features/arena/types'
import { DetailList, displayDate, useFilters } from './arenaUi'

export type AgendaSelection = { date: string; startTime: string; endTime: string; lesson?: ArenaClass; reservation?: Reservation; isClass?: boolean }
export function AgendaActivityDetails({ selected, onClose }: { selected: AgendaSelection; onClose: () => void }) {
  const data = useOperations()
  const filters = useFilters()
  const lesson = data.canRead('classes') ? selected.lesson : undefined
  const reservation = selected.reservation
  const group = data.canRead('rentalGroups') && reservation?.rentalGroupId ? data.rentalGroups.find(row => row.id === reservation.rentalGroupId) : undefined
  const month = data.canRead('rentalMonths') && group ? data.rentalMonths.find(row => row.rentalGroupId === group.id && row.month === (reservation?.rentalMonth ?? selected.date.slice(0, 7))) : undefined
  const enrolled = lesson && data.canRead('enrollments') ? data.enrollments.filter(row => row.classId === lesson.id && row.status === 'Ativa') : undefined
  const participants = month?.members ?? group?.members.filter(row => row.status === 'Ativo')
  const title = selected.isClass ? lesson?.name ?? 'Aula' : group?.name ?? reservation?.name ?? 'Horário ocupado'
  return <ModalPanel title={title} onClose={onClose} className="agenda-detail-panel">
    <div className="agenda-detail-content">
      <p className="agenda-detail-kind">{selected.isClass ? 'Aula' : reservation?.status === 'Bloqueio' ? 'Bloqueio' : reservation?.rentalGroupId ? 'Mensalista' : 'Locação'}</p>
      <DetailList items={[["Data", displayDate(selected.date)], ["Horário", `${selected.startTime}–${selected.endTime}`]]} />
      {selected.isClass ? lesson ? <>
        <p className="arena-hint">Cadastro atual da turma e das matrículas.</p>
        <DetailList items={[["Professor", data.canRead('team') ? data.team.find(row => row.id === lesson.teacherId)?.name ?? 'Não informado' : 'Acesso restrito'], ["Situação", lesson.status], ["Capacidade", String(lesson.capacity)], ["Matrículas ativas", enrolled ? String(enrolled.length) : 'Acesso restrito'], ["Vagas no cadastro atual", enrolled ? String(Math.max(0, lesson.capacity - enrolled.length)) : 'Acesso restrito']]} />
        <h3>Alunos</h3>{!data.canRead('students') || !enrolled ? <p>Acesso restrito aos alunos.</p> : enrolled.length ? <ul>{enrolled.map(row => <li key={row.id}>{data.students.find(student => student.id === row.studentId)?.name ?? 'Aluno não disponível'}</li>)}</ul> : <p>Nenhuma matrícula ativa no cadastro atual.</p>}
        {lesson.notes && <><h3>Observações</h3><p className="detail-notes">{lesson.notes}</p></>}
        <Link className="primary-link" to={`/escola/${lesson.id}`}>Ver turma completa →</Link>
      </> : <p>Detalhes da aula indisponíveis para seu acesso.</p> : reservation ? <>
        <DetailList items={[["Situação", reservation.status], ["Responsável", group ? group.members.find(row => row.id === group.organizerId)?.name ?? 'Não informado' : reservation.customerName || 'Não informado']]} />
        {reservation.rentalGroupId && <>
          <h3>Participantes</h3>
          {!data.canRead('rentalGroups') || !group ? <p>Detalhes do grupo indisponíveis para seu acesso.</p> : <><p className="arena-hint">{month ? `Participantes registrados no mês ${month.month.slice(5)}/${month.month.slice(0, 4)}.` : 'Participantes atuais do grupo; mês não disponível.'}</p>{participants?.length ? <ul>{participants.map(row => <li key={row.id}>{row.name}</li>)}</ul> : <p>Nenhum participante registrado.</p>}</>}
        </>}
        {(reservation.notes || group?.notes) && <><h3>Observações</h3>{reservation.notes && <p className="detail-notes">{reservation.notes}</p>}{group?.notes && group.notes !== reservation.notes && <p className="detail-notes">{group.notes}</p>}</>}
        <div className="arena-actions"><ContextLink className="primary-link" state={{ returnLabel: 'Agenda' }} to={filters.href(`/agenda/${reservation.id}`)}>Ver reserva completa →</ContextLink>{group && <Link className="secondary-link" to={`/mensalistas/${group.id}`}>Ver grupo →</Link>}</div>
      </> : <p>Os detalhes desta ocupação não estão disponíveis.</p>}
    </div>
  </ModalPanel>
}
