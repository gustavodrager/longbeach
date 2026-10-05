import type { OperationalData, OperationalKind } from '../operations/DemoDataProvider'
import type { ArenaClass, Court, Enrollment, FinanceEntry, Presence, Reservation } from './types'

const overlaps = (a: { startTime: string; endTime: string }, b: { startTime: string; endTime: string }) => a.startTime < b.endTime && b.startTime < a.endTime
/** Local demonstration mirrors the critical server rules; production always uses server validation. */
export function validateArenaRecord(kind: OperationalKind, input: { id: string }, data: OperationalData): string | null {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  if (kind === 'classes' || kind === 'reservations') {
    const record = input as ArenaClass | Reservation
    const court = data.courts.find(row => row.id === record.courtId)
    if (!court) return 'Escolha uma quadra cadastrada.'
    if (!record.startTime || !record.endTime || record.startTime >= record.endTime || record.startTime < court.openingTime || record.endTime > court.closingTime) return 'O horário deve ficar dentro do funcionamento da quadra, com término depois do início.'
    if (record.status !== 'Cancelada' && record.status !== 'Pausada' && record.status !== 'Encerrada') {
      if (court.status !== 'Disponível') return 'Esta quadra está em manutenção.'
      if (kind === 'reservations' && (record as Reservation).date > today && (record.status === 'Chegou' || record.status === 'Concluída')) return 'A chegada ou conclusão só pode ser registrada na data da reserva ou depois dela.'
      const weekday = kind === 'classes' ? (record as ArenaClass).weekDay : new Date(`${(record as Reservation).date}T12:00:00`).getDay()
      if (data.classes.some(row => row.id !== record.id && row.courtId === record.courtId && row.status === 'Ativa' && row.weekDay === weekday && overlaps(row, record)) || data.reservations.some(row => row.id !== record.id && row.courtId === record.courtId && row.status !== 'Cancelada' && (kind === 'reservations' ? row.date === (record as Reservation).date : row.date >= today && new Date(`${row.date}T12:00:00`).getDay() === weekday) && overlaps(row, record))) return 'Este horário já está ocupado por uma reserva ou aula nesta quadra.'
    }
    if (kind === 'classes') {
      const arenaClass = record as ArenaClass
      if (!data.team.some(row => row.id === arenaClass.teacherId)) return 'Escolha um professor cadastrado na equipe.'
      if (arenaClass.studentIds.length) return 'Registre os alunos pelo cadastro de matrículas, para preservar vagas e histórico.'
      if (!Number.isInteger(arenaClass.capacity) || arenaClass.capacity < 1 || arenaClass.capacity < data.enrollments.filter(row => row.classId === record.id && row.status === 'Ativa').length) return 'Confira a capacidade da turma e suas matrículas ativas.'
    }
  }
  if (kind === 'courts') {
    const court = input as Court
    if (!court.openingTime || !court.closingTime || court.openingTime >= court.closingTime) return 'Confira os horários de funcionamento da quadra.'
  }
  if (kind === 'enrollments') {
    const enrollment = input as Enrollment
    const arenaClass = data.classes.find(row => row.id === enrollment.classId)
    if (!arenaClass || !data.students.some(row => row.id === enrollment.studentId)) return 'Escolha um aluno e uma turma cadastrados.'
    if (enrollment.status === 'Encerrada' && (!enrollment.endDate || enrollment.endDate < enrollment.startDate)) return 'Informe uma data de encerramento a partir do início da matrícula.'
    if (enrollment.status === 'Ativa' && enrollment.endDate) return 'Uma matrícula ativa deve ficar sem data de encerramento.'
    if (enrollment.status === 'Ativa') {
      if (arenaClass.status !== 'Ativa') return 'Só é possível matricular em uma turma ativa.'
      const others = data.enrollments.filter(row => row.id !== enrollment.id && row.classId === enrollment.classId && row.status === 'Ativa')
      if (others.some(row => row.studentId === enrollment.studentId)) return 'Este aluno já possui matrícula ativa nesta turma.'
      if (others.length >= arenaClass.capacity) return 'Esta turma não possui vagas disponíveis.'
    }
  }
  if (kind === 'presences') {
    const presence = input as Presence
    if (presence.date > today) return 'A presença só pode ser registrada na data da aula ou depois dela.'
    if (!data.enrollments.some(row => row.classId === presence.classId && row.studentId === presence.studentId && row.startDate <= presence.date && (row.status === 'Ativa' || Boolean(row.endDate && presence.date <= row.endDate)))) return 'O aluno não tem matrícula nesta turma para a data informada.'
    if (data.presences.some(row => row.id !== presence.id && row.classId === presence.classId && row.studentId === presence.studentId && row.date === presence.date)) return 'Esta presença já foi registrada. Abra o registro para corrigir.'
  }
  if (kind === 'financeEntries') {
    const entry = input as FinanceEntry
    if (!Number.isFinite(entry.amount) || entry.amount <= 0 || Math.abs(Math.round(entry.amount * 100) - entry.amount * 100) > 0.00001) return 'Confira o valor do lançamento.'
    if (entry.status === 'Pago' && (!entry.paidDate || entry.paidDate > today)) return 'Informe a data do pagamento confirmado.'
    if (entry.sourceKind === 'enrollments' && entry.sourceId && entry.status !== 'Cancelado' && data.financeEntries.some(row => row.id !== entry.id && row.sourceKind === entry.sourceKind && row.sourceId === entry.sourceId && row.month === entry.month && row.status !== 'Cancelado')) return 'Já existe uma mensalidade desta matrícula para a competência informada.'
  }
  return null
}
