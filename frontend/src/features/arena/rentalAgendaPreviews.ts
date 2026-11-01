import type { RentalGroup, RentalMonth } from './rentals'
import type { Reservation } from './types'

export type RentalAgendaPreview = { group: RentalGroup; date: string; startTime: string; endTime: string }

const dayMilliseconds = 86_400_000
function dayNumber(value: string): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return null
  const timestamp = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp / dayMilliseconds : null
}
function validMonth(value: string | undefined): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}$/.test(value) && dayNumber(`${value}-01`) !== null
}
function minute(value: string, end = false): number | null {
  if (end && value === '24:00') return 1440
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null
}
const monthKey = (groupId: string, month: string) => JSON.stringify([groupId, month])
const occurrenceKey = (groupId: string, date: string, start: string, end: string) => JSON.stringify([groupId, date, start, end])

// Display only: existing competencies and individual changes always take precedence.
export function rentalAgendaPreviews(groups: RentalGroup[], months: RentalMonth[], reservations: Reservation[], from: string, to: string): RentalAgendaPreview[] {
  const first = dayNumber(from), last = dayNumber(to)
  if (first === null || last === null || last < first || last - first + 1 > 366) return []
  const generated = new Set<string>()
  const existing = new Set<string>()
  for (const month of months) if (month.rentalGroupId && validMonth(month.month)) generated.add(monthKey(month.rentalGroupId, month.month))
  for (const reservation of reservations) {
    if (!reservation.rentalGroupId) continue
    const dateValid = dayNumber(reservation.date) !== null
    const month = validMonth(reservation.rentalMonth) ? reservation.rentalMonth : dateValid ? reservation.date.slice(0, 7) : null
    if (month) generated.add(monthKey(reservation.rentalGroupId, month))
    if (dateValid) existing.add(occurrenceKey(reservation.rentalGroupId, reservation.date, reservation.startTime, reservation.endTime))
  }
  const previews: RentalAgendaPreview[] = []
  const projected = new Set<string>()
  for (const group of groups) {
    const start = dayNumber(group.startDate), end = group.endDate ? dayNumber(group.endDate) : last
    const begins = minute(group.startTime), ends = minute(group.endTime, true)
    if (group.status !== 'Ativo' || !group.id?.trim() || !group.courtId?.trim() || !Number.isInteger(group.weekDay) || group.weekDay < 0 || group.weekDay > 6
      || start === null || end === null || end < start || begins === null || ends === null || begins >= ends) continue
    for (let day = Math.max(first, start); day <= Math.min(last, end); day++) {
      const instant = new Date(day * dayMilliseconds)
      if (instant.getUTCDay() !== group.weekDay) continue
      const date = instant.toISOString().slice(0, 10)
      const key = occurrenceKey(group.id, date, group.startTime, group.endTime)
      if (generated.has(monthKey(group.id, date.slice(0, 7))) || existing.has(key) || projected.has(key)) continue
      previews.push({ group, date, startTime: group.startTime, endTime: group.endTime })
      projected.add(key)
    }
  }
  return previews.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.group.id.localeCompare(b.group.id) || a.endTime.localeCompare(b.endTime))
}
