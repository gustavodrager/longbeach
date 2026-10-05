import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../lib/http'
import { useAuth } from '../auth/authContext'
import { useOperations } from '../operations/DemoDataProvider'
import type { CourtSchedule, CourtScheduleBlock } from './types'

const minute = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
export function useCourtSchedule(date: string) {
  const { user } = useAuth()
  const data = useOperations()
  const accessScope = user ? `${user.id}:${[...user.roles].sort().join(',')}:${[...user.permissions].sort().join(',')}` : 'demo'
  const demoMode = import.meta.env.VITE_DEMO_MODE === 'true' && import.meta.env.VITE_OPERATIONAL_STORAGE !== 'postgres'
  return useQuery<CourtSchedule>({
    queryKey: ['arena', 'court-schedule', accessScope, date, data.dataUpdatedAt],
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    enabled: data.canRead('courts') && /^\d{4}-\d{2}-\d{2}$/.test(date) && Boolean(data.dataUpdatedAt),
    queryFn: async () => {
      if (!demoMode) return apiFetch<CourtSchedule>(`/api/v1/operations/courts/schedule?date=${encodeURIComponent(date)}`)
      const weekday = new Date(`${date}T12:00:00`).getDay()
      return { date, updatedAtUtc: data.dataUpdatedAt ?? new Date().toISOString(), courts: data.courts.map(court => {
        const blocks: CourtScheduleBlock[] = [
          ...data.reservations.filter(row => row.courtId === court.id && row.date === date && row.status !== 'Cancelada').map(row => ({ source: row.status === 'Bloqueio' ? 'Bloqueio' as const : 'Reserva' as const, startTime: row.startTime, endTime: row.endTime, sourceId: row.id })),
          ...data.classes.filter(row => row.courtId === court.id && row.weekDay === weekday && row.status === 'Ativa').map(row => ({ source: 'Aula' as const, startTime: row.startTime, endTime: row.endTime, sourceId: row.id })),
        ].sort((a,b) => a.startTime.localeCompare(b.startTime))
        const begin = minute(court.openingTime), end = minute(court.closingTime)
        let cursor = begin, used = 0
        for (const block of blocks) { const start = Math.max(begin, minute(block.startTime)), finish = Math.min(end, minute(block.endTime)); used += Math.max(0, finish - Math.max(cursor,start)); cursor = Math.max(cursor,finish) }
        const reservedMinutes = blocks.filter(block => block.source !== 'Aula').reduce((sum,block) => sum + Math.max(0, Math.min(end,minute(block.endTime))-Math.max(begin,minute(block.startTime))),0)
        const classMinutes = blocks.filter(block => block.source === 'Aula').reduce((sum,block) => sum + Math.max(0, Math.min(end,minute(block.endTime))-Math.max(begin,minute(block.startTime))),0)
        return { courtId: court.id, openingTime: court.openingTime, closingTime: court.closingTime, availableMinutes: court.status === 'Manutenção' ? 0 : Math.max(0,end-begin-used), reservedMinutes, classMinutes, closedForMaintenance: court.status === 'Manutenção', hasConflict: reservedMinutes+classMinutes>used, blocks }
      }) }
    },
  })
}
