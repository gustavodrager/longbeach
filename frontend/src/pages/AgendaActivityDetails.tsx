import { formatMonth } from '../lib/inputFormatting'
import { ModalPanel, ContextLink } from '../components/managementUi'
import { useOperations } from '../features/operations/DemoDataProvider'
import type { ArenaClass, Reservation } from '../features/arena/types'
import type { RentalAgendaPreview } from '../features/arena/rentalAgendaPreviews'
import { classStatus, enrollmentCoversDate } from '../features/arena/classLifecycle'
import { DetailList, displayDate, useFilters } from './arenaUi'

export type AgendaSelection = { date: string; startTime: string; endTime: string; lesson?: ArenaClass; reservation?: Reservation; isClass?: boolean; rentalPreview?: RentalAgendaPreview }
export function AgendaActivityDetails({ selected, onClose, returnLabel = 'Agenda' }: { selected: AgendaSelection; onClose: () => void; returnLabel?: string }) {
  const data = useOperations()
  const filters = useFilters()
  const lesson = data.canRead('classes') ? selected.lesson : undefined
  const reservation = selected.reservation
  const preview = data.canRead('rentalGroups') ? selected.rentalPreview : undefined
  const groupId = reservation?.rentalGroupId ?? preview?.group.id
  const group = data.canRead('rentalGroups') && groupId ? data.rentalGroups.find(row => row.id === groupId) : undefined
  const month = data.canRead('rentalMonths') && group ? data.rentalMonths.find(row => row.rentalGroupId === group.id && row.month === (reservation?.rentalMonth ?? selected.date.slice(0, 7))) : undefined
  const enrolled = lesson && data.canRead('enrollments') ? data.enrollments.filter(row => row.classId === lesson.id && (lesson.deletedAt ? enrollmentCoversDate(row, selected.date) : row.status === 'Ativa')) : undefined
  const participants = month?.members ?? group?.members.filter(row => row.status === 'Ativo')
  const title = selected.isClass ? lesson?.name ?? 'Aula' : group?.name ?? reservation?.name ?? (preview ? 'Horário previsto' : 'Horário ocupado')
  return <ModalPanel title={title} onClose={onClose} className="agenda-detail-panel">
    <div className="agenda-detail-content">
      <p className="agenda-detail-kind">{preview ? 'Mensalista · A confirmar' : selected.isClass ? 'Aula' : reservation?.status === 'Bloqueio' ? 'Bloqueio' : reservation?.activityKind === 'Trial' ? 'Aula experimental' : reservation?.activityKind === 'SingleLesson' ? 'Aula avulsa' : reservation?.rentalGroupId ? 'Mensalista' : 'Locação'}</p>
      <DetailList items={[["Data", displayDate(selected.date)], ["Horário", `${selected.startTime}–${selected.endTime}`]]} />
      {preview ? group ? <>
        <p>Horário previsto. Confirme os encontros do mês para reservar a quadra.</p>
        <DetailList items={[["Responsável", group.members.find(row => row.id === group.organizerId)?.name ?? 'A confirmar']]} />
        <ContextLink className="primary-link" state={{ returnLabel }} to={filters.href(`/mensalistas/${group.id}`, { month: selected.date.slice(0, 7) })}>Ver grupo</ContextLink>
      </> : <p>Detalhes do grupo indisponíveis para seu acesso.</p> : selected.isClass ? lesson ? <>
        <h3>{lesson.deletedAt ? 'Histórico da turma' : 'Turma e matrículas atuais'}</h3>
        <DetailList items={[["Professor", (data.canLookup?.('team') ?? data.canRead('team')) ? data.team.find(row => row.id === lesson.teacherId)?.name ?? 'Não informado' : 'Acesso restrito'], ["Situação", classStatus(lesson)], [lesson.deletedAt ? "Matrículas na data" : "Matrículas ativas", enrolled ? String(enrolled.length) : 'Acesso restrito']]} />
        <h3>Alunos</h3>{!data.canRead('students') || !enrolled ? <p>Acesso restrito aos alunos.</p> : enrolled.length ? <ul>{enrolled.map(row => <li key={row.id}>{data.students.find(student => student.id === row.studentId)?.name ?? 'Aluno não disponível'}</li>)}</ul> : <p>{lesson.deletedAt ? 'Nenhuma matrícula elegível nesta data.' : 'Nenhuma matrícula ativa no cadastro atual.'}</p>}
        {lesson.notes && <><h3>Observações</h3><p className="detail-notes">{lesson.notes}</p></>}
        <ContextLink className="primary-link" state={{ returnLabel }} to={`/escola/turmas/${lesson.id}`}>Ver turma</ContextLink>
      </> : <p>Detalhes da aula indisponíveis para seu acesso.</p> : reservation ? <>
        <DetailList items={[["Situação", reservation.status], ["Responsável", group ? group.members.find(row => row.id === group.organizerId)?.name ?? 'Não informado' : reservation.customerName || 'Não informado']]} />
        {(reservation.activityKind === 'Trial' || reservation.activityKind === 'SingleLesson') && <DetailList items={[["Professor", (data.canLookup?.('team') ?? data.canRead('team')) ? data.team.find(row=>row.id===reservation.teacherId)?.name??'Não informado' : 'Acesso restrito'], ["Tipo de encontro", reservation.activityKind === 'SingleLesson' ? "Aula avulsa individual" : "Aula experimental individual"]]} />}
        {reservation.rentalGroupId && <>
          <h3>Participantes</h3>
          {!data.canRead('rentalGroups') || !group ? <p>Detalhes do grupo indisponíveis para seu acesso.</p> : <><p className="arena-hint">{month ? `Participantes registrados no mês ${formatMonth(month.month)}.` : 'Participantes atuais do grupo; mês não disponível.'}</p>{participants?.length ? <ul>{participants.map(row => <li key={row.id}>{row.name}</li>)}</ul> : <p>Nenhum participante registrado.</p>}</>}
        </>}
        {(reservation.notes || group?.notes) && <><h3>Observações</h3>{reservation.notes && <p className="detail-notes">{reservation.notes}</p>}{group?.notes && group.notes !== reservation.notes && <p className="detail-notes">{group.notes}</p>}</>}
        <div className="arena-actions"><ContextLink className="primary-link" state={{ returnLabel }} to={filters.href(`/agenda/${reservation.id}`)}>Ver reserva</ContextLink>{group && <ContextLink className="secondary-link" state={{ returnLabel }} to={filters.href(`/mensalistas/${group.id}`, { month: reservation.rentalMonth ?? selected.date.slice(0, 7) })}>Ver grupo</ContextLink>}</div>
      </> : <p>Os detalhes desta ocupação não estão disponíveis.</p>}
    </div>
  </ModalPanel>
}
