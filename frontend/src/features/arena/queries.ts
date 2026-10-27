import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../lib/http'
import { useAuth } from '../auth/authContext'
import { useOperations } from '../operations/DemoDataProvider'
import type { CourtSchedule, CourtScheduleBlock, CourtScheduleRange } from './types'

const minute = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
export function useCourtSchedule(date: string, enabled = true) {
  const { user } = useAuth()
  const data = useOperations()
  const accessScope = user ? `${user.id}:${[...user.roles].sort().join(',')}:${[...user.permissions].sort().join(',')}` : 'demo'
  const demoMode = import.meta.env.VITE_DEMO_MODE === 'true' && import.meta.env.VITE_OPERATIONAL_STORAGE !== 'postgres'
  return useQuery<CourtSchedule>({
    queryKey: ['arena', 'court-schedule', accessScope, date, data.dataUpdatedAt, data.scheduleRevision],
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    enabled: enabled && data.canRead('courts') && /^\d{4}-\d{2}-\d{2}$/.test(date) && Boolean(data.dataUpdatedAt),
    queryFn: async () => {
      if (!demoMode) return apiFetch<CourtSchedule>(`/api/v1/operations/courts/schedule?date=${encodeURIComponent(date)}`)
      return demoSchedule(date, data)
    },
  })
}

function demoSchedule(date: string, data: ReturnType<typeof useOperations>): CourtSchedule {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
  return { date, updatedAtUtc: data.dataUpdatedAt ?? new Date().toISOString(), courts: data.courts.map(court => {
    const blocks: CourtScheduleBlock[] = [
      ...data.reservations.filter(row => row.courtId === court.id && row.date === date && row.status !== 'Cancelada').map(row => ({ source: row.status === 'Bloqueio' ? 'Bloqueio' as const : row.activityKind === 'Trial' ? 'Aula experimental' as const : 'Reserva' as const, startTime: row.startTime, endTime: row.endTime, sourceId: row.id })),
      ...data.classes.filter(row => row.courtId === court.id && row.weekDay === weekday && row.status === 'Ativa' && (!row.startDate || row.startDate <= date)).map(row => ({ source: 'Aula' as const, startTime: row.startTime, endTime: row.endTime, sourceId: row.id })),
    ].sort((a,b) => a.startTime.localeCompare(b.startTime))
    const begin = minute(court.openingTime), end = minute(court.closingTime)
    let cursor = begin, used = 0
    const freeIntervals: { startTime: string; endTime: string }[] = []
    const time = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
    for (const block of blocks) { const start = Math.max(begin, minute(block.startTime)), finish = Math.min(end, minute(block.endTime)); if (finish <= start) continue; if (start > cursor) freeIntervals.push({ startTime: time(cursor), endTime: time(start) }); used += Math.max(0, finish - Math.max(cursor,start)); cursor = Math.max(cursor,finish) }
    if (cursor < end) freeIntervals.push({ startTime: time(cursor), endTime: time(end) })
    let occupiedMinutes = 0, occupiedEnd = 0
    for (const block of blocks) { occupiedMinutes += Math.max(0, minute(block.endTime) - Math.max(occupiedEnd,minute(block.startTime))); occupiedEnd = Math.max(occupiedEnd,minute(block.endTime)) }
    const reservedMinutes = blocks.filter(block => !['Aula','Aula experimental'].includes(block.source)).reduce((sum,block) => sum + Math.max(0, Math.min(end,minute(block.endTime))-Math.max(begin,minute(block.startTime))),0)
    const classMinutes = blocks.filter(block => ['Aula','Aula experimental'].includes(block.source)).reduce((sum,block) => sum + Math.max(0, Math.min(end,minute(block.endTime))-Math.max(begin,minute(block.startTime))),0)
    const closedForDay = !(court.operatingDays ?? [0,1,2,3,4,5,6]).includes(weekday)
    const closed = closedForDay || court.status === 'Manutenção'
    return { closedForDay, operatingMinutes: closed ? 0 : end-begin, schedulePending: court.scheduleConfirmed === false, courtId: court.id, openingTime: court.openingTime, closingTime: court.closingTime, availableMinutes: closed ? 0 : court.scheduleConfirmed === false ? null : Math.max(0,end-begin-used), reservedMinutes, classMinutes, closedForMaintenance: court.status === 'Manutenção', occupiedMinutes, freeIntervals: court.scheduleConfirmed === false ? null : closed ? [] : freeIntervals, hasConflict: reservedMinutes+classMinutes>used || closed && blocks.length>0 || blocks.some(block => minute(block.startTime) < begin || minute(block.endTime) > end), blocks }
  }) }
}

export function useCourtScheduleRange(from: string, to: string, enabled: boolean) {
  const { user } = useAuth()
  const data = useOperations()
  const accessScope = user ? `${user.id}:${[...user.roles].sort().join(',')}:${[...user.permissions].sort().join(',')}` : 'demo'
  const demoMode = import.meta.env.VITE_DEMO_MODE === 'true' && import.meta.env.VITE_OPERATIONAL_STORAGE !== 'postgres'
  return useQuery<CourtScheduleRange>({
    queryKey: ['arena', 'court-schedule-range', accessScope, from, to, data.dataUpdatedAt, data.scheduleRevision],
    enabled: enabled && data.canRead('courts') && Boolean(data.dataUpdatedAt),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!demoMode) return apiFetch<CourtScheduleRange>(`/api/v1/operations/courts/schedule-range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      const count = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
      if (!Number.isFinite(count) || count < 1 || count > 366) throw new Error('Escolha um período válido de até 366 dias.')
      const days = Array.from({ length: count }, (_, index) => demoSchedule(new Date(Date.parse(`${from}T00:00:00Z`) + index * 86_400_000).toISOString().slice(0, 10), data))
      return { from, to, updatedAtUtc: data.dataUpdatedAt!, days }
    },
  })
}
