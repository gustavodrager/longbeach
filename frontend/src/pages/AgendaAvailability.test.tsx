import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { UnsavedChangesProvider } from '../components/managementUi'
import { AuthContext, type AuthContextValue } from '../features/auth/authContext'
import type { AuthUser } from '../features/auth/types'
import type { ArenaClass, Court, CourtSchedule, CourtScheduleRow, Reservation } from '../features/arena/types'
import { DemoDataProvider } from '../features/operations/DemoDataProvider'
import { AgendaPage } from './AgendaPage'
import { ReservationDetailsPage } from './ArenaPages'

const firstDay = '2030-05-06'
const lastDay = '2030-05-12'
const owner: AuthUser = {
  id: '11111111-1111-4111-8111-111111111111', name: 'Operador sintético',
  email: 'agenda@example.invalid', roles: ['Manager'], permissions: [],
}
const courtA: Court = {
  id: '22222222-2222-4222-8222-222222222221', name: 'Quadra Alfa', sport: 'Futevôlei',
  status: 'Disponível', openingTime: '10:00', closingTime: '16:00', scheduleConfirmed: true,
}
const courtB: Court = { ...courtA, id: '22222222-2222-4222-8222-222222222222', name: 'Quadra Beta' }
const reservation: Reservation = {
  id: '33333333-3333-4333-8333-333333333333', version: 1, name: 'Reserva sintética Alfa',
  courtId: courtA.id, date: firstDay, startTime: '10:00', endTime: '11:00',
  customerName: 'Grupo fictício', phone: '', amount: 0, status: 'Confirmada', notes: '',
}
const lesson: ArenaClass = {
  id: '44444444-4444-4444-8444-444444444444', name: 'Turma sintética', sport: 'Futevôlei',
  courtId: courtA.id, weekDay: 1, startDate: firstDay, startTime: '14:00', endTime: '15:00',
  teacherId: '', capacity: 6, studentIds: [], status: 'Ativa', notes: '',
}
const dateLabel = '06/05/2030'
const disposers: (() => void)[] = []
const requests: { method: string; path: string }[] = []

function scheduleFor(date: string, courts: Court[]): CourtSchedule {
  return {
    date, updatedAtUtc: '2030-05-01T12:00:00Z', courts: courts.map(court => {
      const occupied = court.id === courtA.id && date === firstDay
      return {
        courtId: court.id, openingTime: '10:00', closingTime: '16:00',
        operatingMinutes: 360, availableMinutes: occupied ? 240 : 360,
        reservedMinutes: occupied ? 60 : 0, classMinutes: occupied ? 60 : 0,
        occupiedMinutes: occupied ? 120 : 0, schedulePending: false,
        closedForDay: false, closedForMaintenance: false, hasConflict: false,
        blocks: occupied ? [
          { source: 'Reserva', sourceId: reservation.id, startTime: '10:00', endTime: '11:00' },
          { source: 'Aula', sourceId: lesson.id, startTime: '14:00', endTime: '15:00' },
        ] : [],
        freeIntervals: occupied ? [
          { startTime: '11:00', endTime: '14:00' }, { startTime: '15:00', endTime: '16:00' },
        ] : [{ startTime: '10:00', endTime: '16:00' }],
      } satisfies CourtScheduleRow
    }),
  }
}

type KnownClosure = 'closedForDay' | 'closedForMaintenance'

function mountAgenda(path: string, multipleCourts = false, knownClosure?: KnownClosure) {
  const courts = multipleCourts ? [courtA, courtB] : [courtA]
  const scheduleResponse = (date: string): CourtSchedule => {
    const schedule = scheduleFor(date, courts)
    return !knownClosure ? schedule : {
      ...schedule,
      courts: schedule.courts.map(row => ({
        ...row, [knownClosure]: true, schedulePending: true,
        operatingMinutes: 0, availableMinutes: null, freeIntervals: null,
        reservedMinutes: 0, classMinutes: 0, occupiedMinutes: 0, blocks: [],
      })),
    }
  }
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://synthetic.invalid')
    requests.push({ method, path: url.pathname + url.search })
    if (method !== 'GET' || url.origin !== 'http://synthetic.invalid') {
      throw new Error('Availability regression fixtures allow mocked relative GET requests only')
    }
    let body: unknown
    if (url.pathname === '/api/v1/operations/courts/schedule-range') {
      const from = url.searchParams.get('from')!
      const to = url.searchParams.get('to')!
      const days: CourtSchedule[] = []
      for (let date = new Date(from + 'T12:00:00Z'); date.toISOString().slice(0, 10) <= to; date.setUTCDate(date.getUTCDate() + 1)) {
        days.push(scheduleResponse(date.toISOString().slice(0, 10)))
      }
      body = { from, to, updatedAtUtc: '2030-05-01T12:00:00Z', days }
    } else if (url.pathname === '/api/v1/operations/courts/schedule') {
      body = scheduleResponse(url.searchParams.get('date')!)
    } else if (/^\/api\/v1\/operations\/[A-Za-z]+$/.test(url.pathname)) {
      body = url.pathname.endsWith('/courts') ? courts
        : url.pathname.endsWith('/reservations') ? [reservation]
          : url.pathname.endsWith('/classes') ? [lesson] : []
    } else throw new Error('Unexpected mocked GET in availability regression fixture')
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
  })
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const auth: AuthContextValue = {
    user: owner, isBootstrapping: false, signIn: async () => {}, signInWithGoogle: async () => {},
    signOut: async () => {}, changePassword: async () => {}, completeFirstAccessWithGoogle: async () => {},
  }
  function Root() {
    return <QueryClientProvider client={query}><UnsavedChangesProvider><AuthContext.Provider value={auth}>
      <DemoDataProvider enabled demoMode={false}><Outlet /></DemoDataProvider>
    </AuthContext.Provider></UnsavedChangesProvider></QueryClientProvider>
  }
  const router = createMemoryRouter([{ element: <Root />, children: [
    { path: '/agenda', element: <AgendaPage /> },
    { path: '/agenda/:reservationId', element: <ReservationDetailsPage /> },
  ] }], { initialEntries: [path] })
  const view = render(<RouterProvider router={router} />)
  disposers.push(() => { view.unmount(); router.dispose(); query.clear() })
  return { router, query, user: userEvent.setup() }
}

beforeEach(() => {
  requests.length = 0
  vi.stubEnv('VITE_DEMO_MODE', 'false')
  vi.stubEnv('VITE_OPERATIONAL_STORAGE', 'postgres')
  vi.stubEnv('VITE_API_URL', '')
})
afterEach(() => {
  while (disposers.length) disposers.pop()!()
  cleanup()
  expect(requests.every(request => request.method === 'GET')).toBe(true)
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

it('identifies the court on occupied and free weekly slots and lets the operator select a court', async () => {
  const { user, router } = mountAgenda(`/agenda?view=week&date=${firstDay}`, true)
  const occupied = await screen.findByRole('button', { name: /Reserva sintética Alfa/ })
  const selector = screen.getByRole('combobox', { name: 'Quadra' })
  expect(within(selector).getByRole('option', { name: courtA.name })).toBeInTheDocument()
  expect(within(selector).getByRole('option', { name: courtB.name })).toBeInTheDocument()
  expect(within(occupied).getByText(courtA.name)).toBeVisible()
  const free = screen.getByRole('link', { name: new RegExp(`Nova reserva.*${dateLabel}.*10:00–16:00`) })
  expect(free).toHaveTextContent(courtB.name)
  expect(free).toHaveAccessibleName(expect.stringContaining(courtB.name))
  expect(new URL(free.getAttribute('href')!, 'http://synthetic.invalid').searchParams.get('court')).toBe(courtB.id)

  await user.selectOptions(selector, courtB.id)
  expect(new URLSearchParams(router.state.location.search).get('court')).toBe(courtB.id)
  expect(screen.queryByRole('button', { name: /Reserva sintética Alfa/ })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: new RegExp(`Nova reserva.*${dateLabel}.*10:00–16:00`) })).toBeInTheDocument()
  await user.selectOptions(screen.getByRole('combobox', { name: 'Quadra' }), courtA.id)
  expect(await screen.findByRole('button', { name: /Reserva sintética Alfa/ })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: new RegExp(`Nova reserva.*${dateLabel}.*10:00–16:00`) })).not.toBeInTheDocument()
})

it.each(['day', 'list'].flatMap(view => ['livre', 'classes', 'aula'].map(activity => ({ view, activity }))))(
  '$view keeps $activity meaningful with legacy reservation filters and disables incompatible status changes',
  async ({ view, activity }) => {
    const { user, query } = mountAgenda(`/agenda?view=${view}&date=${firstDay}&from=${firstDay}&to=${firstDay}&activity=${activity}&status=Confirmada&group=grupo-legado`)
    await waitFor(() => {
      expect(requests.some(request => request.path.includes('/courts/schedule'))).toBe(true)
      expect(query.getQueryCache().getAll().some(entry => entry.queryKey[0] === 'arena' && entry.state.status === 'success')).toBe(true)
      expect(screen.queryByText('Carregando seleção…')).not.toBeInTheDocument()
      expect(screen.queryByText(/conferindo aulas/)).not.toBeInTheDocument()
    })
    const expectRelevantRows = () => {
      if (activity === 'livre') {
        expect(screen.getAllByText('Horário livre', { exact: true }).length).toBeGreaterThan(0)
        expect(screen.queryByText('0 horários livres')).not.toBeInTheDocument()
      } else {
        expect(screen.getByRole('button', { name: /Turma sintética/ })).toBeInTheDocument()
        expect(screen.queryByText('0 atividades')).not.toBeInTheDocument()
      }
    }
    expectRelevantRows()
    const status = screen.getByLabelText('Situação da reserva')
    expect(status).toBeDisabled()

    // Reverse the previously covered order: select the activity first, then
    // try the reservation-only status. It must not erase known availability.
    const activitySelector = screen.getByLabelText('Mostrar')
    await user.selectOptions(activitySelector, '')
    await user.selectOptions(activitySelector, activity === 'livre' ? 'livre' : 'classes')
    expect(screen.getByLabelText('Situação da reserva')).toBeDisabled()
    await user.selectOptions(screen.getByLabelText('Situação da reserva'), 'Confirmada')
    expectRelevantRows()
  },
)

it.each(['day', 'week'] as const)('anchors %s to the visible future list period when the URL has no date', async target => {
  const { user } = mountAgenda(`/agenda?view=list&from=${firstDay}&to=${lastDay}`)
  await screen.findByRole('button', { name: /Turma sintética/ })
  await user.selectOptions(screen.getByLabelText('Visualização'), target)
  await waitFor(() => expect(screen.getByLabelText(target === 'day' ? 'Dia' : 'Data de referência')).toHaveValue(firstDay))
  expect(screen.getByLabelText('Visualização')).toHaveValue(target)
})

it('starts a new reservation on the visible future list period when the URL has no date', async () => {
  const { user, router } = mountAgenda(`/agenda?view=list&from=${firstDay}&to=${lastDay}`)
  await screen.findByRole('button', { name: /Turma sintética/ })
  await user.click(screen.getByRole('link', { name: '+ Nova reserva' }))
  await screen.findByRole('dialog')
  expect(router.state.location.pathname).toBe('/agenda/novo')
  expect(screen.getByLabelText('Data', { exact: true })).toHaveValue(firstDay)
  expect(new URLSearchParams(router.state.location.search).get('view')).toBe('list')
  expect(new URLSearchParams(router.state.location.search).get('from')).toBe(firstDay)
})

it.each((['day', 'list'] as const).flatMap(view =>
  (['closedForDay', 'closedForMaintenance'] as const).map(closure => ({ view, closure })),
))('$view treats known $closure as closed even while schedule confirmation is pending', async ({ view, closure }) => {
  const { query } = mountAgenda(`/agenda?view=${view}&date=${firstDay}&from=${firstDay}&to=${firstDay}&activity=livre`, false, closure)
  await waitFor(() => {
    expect(query.getQueryCache().getAll().some(entry => entry.queryKey[0] === 'arena' && entry.state.status === 'success')).toBe(true)
    expect(screen.getByText('0 horários livres')).toBeInTheDocument()
  })
  expect(screen.queryByText('Disponibilidade a confirmar')).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Reservar' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /^Nova reserva \d/ })).not.toBeInTheDocument()
  if (view === 'day') {
    expect(screen.getByText(closure === 'closedForDay' ? 'Fechada neste dia da semana' : 'Quadra em manutenção')).toBeInTheDocument()
  }
})
