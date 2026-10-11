import type { CourtScheduleRow } from './types'

export const minuteOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
export const clockTime = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
export function moveDate(date: string, days: number) {
  const next = new Date(`${date}T12:00:00Z`)
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString().slice(0, 10)
}
export function weekDates(date: string) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
  const monday = moveDate(date, -((weekday + 6) % 7))
  return Array.from({ length: 7 }, (_, index) => moveDate(monday, index))
}
export function dayAvailability(row?: CourtScheduleRow) {
  if (!row) return 'Disponibilidade não verificada'
  if (row.closedForMaintenance) return 'Em manutenção'
  if (row.closedForDay) return 'Fechado'
  if (row.schedulePending || row.availableMinutes === null || !row.freeIntervals) return 'A confirmar'
  return row.availableMinutes === 0 ? 'Sem horários livres' : 'Funcionamento confirmado'
}
export function reservationUrl(date: string, court: string, start: string, end: string) {
  const params = new URLSearchParams({ date, court, start, end: clockTime(Math.min(minuteOf(start) + 60, minuteOf(end))), view: 'week' })
  return `/agenda/novo?${params}`
}
