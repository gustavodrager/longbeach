import { validRentalMusicPreferences } from './rentalMusic'
import type { RentalGroup, RentalAttendance } from './rentals'
import { allocationError } from '../finance/businessUnits'
import { receiptError } from '../finance/receiptSources'
import type { OperationalData, OperationalKind } from '../operations/DemoDataProvider'
import type { ArenaClass, Court, Enrollment, FinanceEntry, Presence, Reservation } from './types'
import { classScheduledOn, enrollmentCoversDate, reservationIsClassHistory } from './classLifecycle'

const validTime = (time: string, end = false) => /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(time) || end && time === '24:00'
const validWeekDay = (day: number) => Number.isInteger(day) && day >= 0 && day <= 6
const validDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
const overlaps = (a: { startTime: string; endTime: string }, b: { startTime: string; endTime: string }) => a.startTime < b.endTime && b.startTime < a.endTime
/** Local demonstration mirrors the critical server rules; production always uses server validation. */
export function validateArenaRecord(kind: OperationalKind, input: { id: string }, data: OperationalData): string | null {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  if (kind === 'rentalMonths') return 'Gere a competência na área de mensalistas conectada à arena.'
  if (kind === 'rentalGroups') {
    const music = (input as RentalGroup).musicPreferences
    if (music !== undefined && !validRentalMusicPreferences(music)) return 'Confira as preferências musicais, sem repetir estilos.'
    const group = input as RentalGroup, court = data.courts.find(c => c.id === group.courtId)
    if (!court || !validWeekDay(group.weekDay) || !validTime(group.startTime) || !validTime(group.endTime, true) || group.startTime >= group.endTime || group.startTime < court.openingTime || group.endTime > court.closingTime) return 'Confira o dia e o horário dentro do funcionamento da quadra.'
    if (!group.name.trim() || !validDate(group.startDate) || group.endDate && (!validDate(group.endDate) || group.endDate < group.startDate)) return 'Confira o nome e as datas do acordo.'
    if (group.members.some(m => !m.name.trim()) || new Set(group.members.map(m => m.name.trim().toLocaleLowerCase('pt-BR'))).size !== group.members.length) return 'Confira os nomes de todos os integrantes, sem repetir pessoas.'
    const active = group.members.filter(m => m.status === 'Ativo')
    if (group.organizerId && !active.some(m => m.id === group.organizerId) || group.backupId && (!active.some(m => m.id === group.backupId) || group.backupId === group.organizerId)) return 'Escolha um responsável ativo e um suplente diferente.'
    if (active.length > 50 || group.capacity !== null && (!Number.isInteger(group.capacity) || active.length > group.capacity || group.capacity < 1 || group.capacity > 50)) return 'Confira a quantidade prevista de integrantes.'
    if (data.rentalGroups.find(g => g.id === group.id)?.members.some(m => !group.members.some(n => n.id === m.id))) return 'Marque integrantes como inativos para preservar o histórico.'
  }
  if (kind === 'rentalAttendances') {
    const presence = input as RentalAttendance, reservation = data.reservations.find(r => r.id === presence.reservationId)
    if (!reservation || reservation.rentalGroupId !== presence.rentalGroupId || reservation.status === 'Cancelada' || reservation.date > today) return 'Escolha um encontro válido, na data de hoje ou anterior.'
    if (!data.rentalGroups.find(g => g.id === presence.rentalGroupId)?.members.some(m => m.id === presence.memberId)) return 'O integrante não pertence ao grupo.'
    if (data.rentalAttendances.some(p => p.id !== presence.id && p.reservationId === presence.reservationId && p.memberId === presence.memberId)) return 'A presença já existe. Edite o registro.'
  }
  if (kind === 'classes' || kind === 'reservations') {
    const record = input as ArenaClass | Reservation
    const court = data.courts.find(row => row.id === record.courtId)
    if (!court) return 'Escolha uma quadra cadastrada.'
    if (kind === 'classes') {
      const lesson = record as ArenaClass
      if (lesson.deletedAt || data.classes.find(row => row.id === lesson.id)?.deletedAt) return 'Esta turma foi excluída. O histórico está disponível para consulta.'
      if (!validWeekDay(lesson.weekDay) || lesson.startDate && !validDate(lesson.startDate)) return 'Confira o dia da semana e a data de início da turma.'
    }
    if (kind === 'reservations') {
      const reservation = record as Reservation
      if (!validDate(reservation.date)) return 'Informe uma data válida para a reserva.'
      if (reservation.activityKind === 'SingleLesson') {
        if (!reservation.customerId) return 'Selecione o cliente da aula avulsa.'
        if (!data.team.some(row => row.id === reservation.teacherId && (reservation.status === 'Cancelada' || row.status === 'Ativo'))) return reservation.status === 'Cancelada' ? 'Escolha um professor cadastrado.' : 'Escolha um professor ativo para a aula avulsa.'
        if (reservation.rentalGroupId || reservation.groupId || reservation.status === 'Bloqueio') return 'A aula avulsa deve ser um encontro individual, sem grupo mensalista ou bloqueio.'
      }
      const previous = data.reservations.find(row => row.id === reservation.id)
      if (reservationIsClassHistory(reservation, data.classes) || reservationIsClassHistory(previous, data.classes)) return 'Esta reserva pertence ao histórico de uma turma excluída.'
      if (previous && previous.activityKind !== reservation.activityKind && (previous.activityKind === 'Trial' || previous.rentalGroupId || previous.groupId || !previous.activityKind && previous.teacherId)) return 'O tipo deste encontro não pode ser alterado.'
    }
    if (!validTime(record.startTime) || !validTime(record.endTime, true) || record.startTime >= record.endTime || record.startTime < court.openingTime || record.endTime > court.closingTime) return 'O horário deve ficar dentro do funcionamento da quadra, com término depois do início.'
    if (record.status !== 'Cancelada' && record.status !== 'Pausada' && record.status !== 'Encerrada') {
      if (court.status !== 'Disponível') return 'Esta quadra está em manutenção.'
      if (kind === 'reservations' && (record as Reservation).date > today && (record.status === 'Chegou' || record.status === 'Concluída')) return 'A chegada ou conclusão só pode ser registrada na data da reserva ou depois dela.'
      const weekday = kind === 'classes' ? (record as ArenaClass).weekDay : new Date(`${(record as Reservation).date}T12:00:00`).getDay()
      if (data.classes.some(row => row.id !== record.id && row.courtId === record.courtId && (kind === 'classes' ? !row.deletedAt && row.status === 'Ativa' : classScheduledOn(row, (record as Reservation).date)) && row.weekDay === weekday && overlaps(row, record)) || data.reservations.some(row => row.id !== record.id && row.courtId === record.courtId && row.status !== 'Cancelada' && (kind === 'reservations' ? row.date === (record as Reservation).date : row.date >= today && (!(record as ArenaClass).startDate || row.date >= (record as ArenaClass).startDate!) && new Date(`${row.date}T12:00:00`).getDay() === weekday) && overlaps(row, record))) return 'Este horário já está ocupado por uma reserva ou aula nesta quadra.'
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
    if (!validTime(court.openingTime) || !validTime(court.closingTime, true) || court.openingTime >= court.closingTime) return 'Confira os horários de funcionamento da quadra.'
    // Preserve the legacy field's shape without using it to restrict daily operation.
    if (court.operatingDays != null && (!Array.isArray(court.operatingDays) || court.operatingDays.length > 7 || new Set(court.operatingDays).size !== court.operatingDays.length || court.operatingDays.some(day => !validWeekDay(day)))) return 'Confira os dias informados, sem repetir e usando valores de 0 a 6.'
    const bookings = [...data.reservations.filter(row => row.courtId === court.id && row.status !== 'Cancelada' && row.date >= today), ...data.classes.filter(row => row.courtId === court.id && row.status === 'Ativa')]
    if (bookings.some(row => row.startTime < court.openingTime || row.endTime > court.closingTime)) return 'O funcionamento não comporta suas reservas ou aulas. Ajuste a agenda primeiro.'
  }
  if (kind === 'enrollments') {
    const enrollment = input as Enrollment
    const arenaClass = data.classes.find(row => row.id === enrollment.classId)
    if (!arenaClass || !data.students.some(row => row.id === enrollment.studentId)) return 'Escolha um aluno e uma turma cadastrados.'
    const previous = data.enrollments.find(row => row.id === enrollment.id)
    if (arenaClass.deletedAt || enrollment.closedByClassDeletion || previous?.closedByClassDeletion || previous && data.classes.find(row => row.id === previous.classId)?.deletedAt) return 'Esta matrícula pertence ao histórico de uma turma excluída.'
    if (enrollment.status === 'Encerrada' && (!enrollment.endDate || enrollment.endDate < enrollment.startDate)) return 'Informe uma data de encerramento a partir do início da matrícula.'
    if (enrollment.status === 'Ativa' && enrollment.endDate) return 'Uma matrícula ativa deve ficar sem data de encerramento.'
    if (enrollment.status === 'Ativa') {
      if (arenaClass.startDate && enrollment.startDate < arenaClass.startDate) return 'A matrícula não pode começar antes da turma.'
      if (arenaClass.status !== 'Ativa') return 'Só é possível matricular em uma turma ativa.'
      const others = data.enrollments.filter(row => row.id !== enrollment.id && row.classId === enrollment.classId && row.status === 'Ativa')
      if (others.some(row => row.studentId === enrollment.studentId)) return 'Este aluno já possui matrícula ativa nesta turma.'
      if (others.length >= arenaClass.capacity) return 'Esta turma não possui vagas disponíveis.'
    }
  }
  if (kind === 'presences') {
    const presence = input as Presence
    const lesson = data.classes.find(row => row.id === presence.classId)
    const previous = data.presences.find(row => row.id === presence.id)
    if (lesson?.deletedAt || previous && data.classes.find(row => row.id === previous.classId)?.deletedAt) return 'Esta turma foi excluída. As presenças estão disponíveis somente para consulta.'
    if (presence.date > today) return 'A presença só pode ser registrada na data da aula ou depois dela.'
    if (!data.enrollments.some(row => row.classId === presence.classId && row.studentId === presence.studentId && enrollmentCoversDate(row, presence.date))) return 'O aluno não tem matrícula nesta turma para a data informada.'
    if (data.presences.some(row => row.id !== presence.id && row.classId === presence.classId && row.studentId === presence.studentId && row.date === presence.date)) return 'Esta presença já foi registrada. Abra o registro para corrigir.'
  }
  if (kind === 'financeEntries') {
    const entry = input as FinanceEntry
    const classification = allocationError(entry.origin, entry)
    if (classification) return classification
    const receipt = receiptError(entry)
    if (receipt) return receipt
    if (!Number.isFinite(entry.amount) || entry.amount <= 0 || Math.abs(Math.round(entry.amount * 100) - entry.amount * 100) > 0.00001) return 'Confira o valor do lançamento.'
    if (entry.status === 'Pago' && (!entry.paidDate || entry.paidDate > today)) return 'Informe a data do pagamento confirmado.'
    if (entry.sourceKind === 'enrollments' && entry.sourceId && entry.status !== 'Cancelado' && data.financeEntries.some(row => row.id !== entry.id && row.sourceKind === entry.sourceKind && row.sourceId === entry.sourceId && row.month === entry.month && row.status !== 'Cancelado')) return 'Já existe uma mensalidade desta matrícula para a competência informada.'
  }
  return null
}
