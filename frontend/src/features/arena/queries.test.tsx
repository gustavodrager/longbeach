import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useCourtSchedule, useCourtScheduleRange } from './queries'
import type { ArenaClass, Court, Reservation } from './types'

const court: Court = { id: 'court', name: 'Quadra de teste', sport: 'Futevôlei', status: 'Disponível', openingTime: '07:00', closingTime: '23:00', scheduleConfirmed: true }
const operations = { courts: [] as Court[], reservations: [] as Reservation[], classes: [] as ArenaClass[], dataUpdatedAt: '2030-05-01T12:00:00Z', scheduleRevision: 0, canRead: () => true }
vi.mock('../operations/DemoDataProvider', () => ({ useOperations: () => operations }))
vi.mock('../auth/authContext', () => ({ useAuth: () => ({ user: null }) }))
const clients: QueryClient[] = []
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client)
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
beforeEach(() => {
  vi.stubEnv('VITE_DEMO_MODE', 'true'); vi.stubEnv('VITE_OPERATIONAL_STORAGE', 'local')
  operations.courts = [court]; operations.reservations = []; operations.classes = []
})
afterEach(() => { clients.splice(0).forEach(client => client.clear()); vi.unstubAllEnvs() })
const legacy = [{ label: 'lista vazia', operatingDays: [] }, { label: 'dias úteis legados', operatingDays: [1, 2, 3, 4, 5] }]

it.each(legacy.flatMap(value => Array.from({ length: 7 }, (_, weekDay) => ({ ...value, weekDay }))))('mostra disponibilidade demo: $label, dia $weekDay', async ({ operatingDays, weekDay }) => {
  operations.courts = [{ ...court, operatingDays }]
  const date = `2030-05-${String(5 + weekDay).padStart(2, '0')}`
  const { result } = renderHook(() => useCourtSchedule(date), { wrapper })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data?.courts[0]).toMatchObject({ closedForDay: false, closedForMaintenance: false, operatingMinutes: 960, availableMinutes: 960, freeIntervals: [{ startTime: '07:00', endTime: '23:00' }] })
})

it.each(legacy)('a semana inclui sábado e domingo: $label', async ({ operatingDays }) => {
  operations.courts = [{ ...court, operatingDays }]
  const { result } = renderHook(() => useCourtScheduleRange('2030-05-05', '2030-05-11', true), { wrapper })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data?.days).toHaveLength(7)
  expect(result.current.data?.days.every(day => day.courts[0].closedForDay === false && day.courts[0].availableMinutes === 960)).toBe(true)
})

it('preserva manutenção, agenda não conferida, horários ocupados e conflitos', async () => {
  operations.courts = [
    { ...court, id: 'maintenance', operatingDays: [], status: 'Manutenção' },
    { ...court, id: 'pending', operatingDays: [], scheduleConfirmed: false },
    { ...court, operatingDays: [1] },
  ]
  operations.reservations = [
    { id: 'reservation', name: 'Reserva', courtId: court.id, date: '2030-05-05', startTime: '10:00', endTime: '12:00', status: 'Confirmada', customerName: '', phone: '', amount: 0, notes: '' },
    { id: 'overlap', name: 'Conflito', courtId: court.id, date: '2030-05-05', startTime: '11:00', endTime: '13:00', status: 'Confirmada', customerName: '', phone: '', amount: 0, notes: '' },
  ]
  const { result } = renderHook(() => useCourtSchedule('2030-05-05'), { wrapper })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  const rows = result.current.data!.courts
  expect(rows[0]).toMatchObject({ closedForDay: false, closedForMaintenance: true, operatingMinutes: 0, availableMinutes: 0, freeIntervals: [] })
  expect(rows[1]).toMatchObject({ closedForDay: false, schedulePending: true, operatingMinutes: 960, availableMinutes: null, freeIntervals: null })
  expect(rows[2]).toMatchObject({ closedForDay: false, occupiedMinutes: 180, availableMinutes: 780, hasConflict: true, freeIntervals: [{ startTime: '07:00', endTime: '10:00' }, { startTime: '13:00', endTime: '23:00' }] })
})

it('mantém closedForDay informado pela API, sem recalcular o fechamento no navegador', async () => {
  vi.stubEnv('VITE_DEMO_MODE', 'false'); vi.stubEnv('VITE_OPERATIONAL_STORAGE', 'postgres')
  const response = { date: '2030-05-05', updatedAtUtc: operations.dataUpdatedAt, courts: [{ courtId: court.id, closedForDay: true, closedForMaintenance: false, availableMinutes: 0, freeIntervals: [], blocks: [] }] }
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(response), { headers: { 'Content-Type': 'application/json' } }))
  const { result } = renderHook(() => useCourtSchedule('2030-05-05'), { wrapper })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data).toEqual(response)
  expect(fetch).toHaveBeenCalledWith('/api/v1/operations/courts/schedule?date=2030-05-05', expect.anything())
})
