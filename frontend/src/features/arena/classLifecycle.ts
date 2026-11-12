import type { ArenaClass, Enrollment, Reservation } from './types'

export const classStatus = (lesson: ArenaClass) => lesson.deletedAt ? 'Excluída' : lesson.status

export function reservationIsClassHistory(reservation: Reservation | undefined, classes: ArenaClass[]): boolean {
  return Boolean(reservation && (reservation.cancelledByClassDeletion
    || classes.some(lesson => lesson.deletedAt && lesson.id === reservation.classId)))
}

export function deletionDateLabel(deletedAt: string): string {
  const value = new Date(deletedAt)
  return Number.isFinite(value.getTime())
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(value)
    : 'Data não disponível'
}

/** The API remains authoritative; local agenda previews use the same historical cutoff. */
export function classScheduledOn(lesson: ArenaClass, date: string): boolean {
  if (lesson.startDate && lesson.startDate > date) return false
  if (new Date(`${date}T12:00:00Z`).getUTCDay() !== lesson.weekDay) return false
  if (!lesson.deletedAt) return lesson.status === 'Ativa'
  if (lesson.deletedPreviousStatus !== 'Ativa' || !lesson.deletedEffectiveDate) return false
  if (date !== lesson.deletedEffectiveDate) return date < lesson.deletedEffectiveDate
  const deleted = new Date(lesson.deletedAt)
  if (!Number.isFinite(deleted.getTime())) return false
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(deleted)
  return `${lesson.startTime}:00.000` < `${time}.${String(deleted.getUTCMilliseconds()).padStart(3, '0')}`
}

export function enrollmentCoversDate(enrollment: Enrollment, date: string): boolean {
  return !enrollment.cancelledBeforeStart && enrollment.startDate <= date
    && (enrollment.status === 'Ativa' || Boolean(enrollment.endDate && enrollment.endDate >= date))
}
