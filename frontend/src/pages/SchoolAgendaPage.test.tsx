import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../features/auth/authContext'
import { DemoDataProvider } from '../features/operations/DemoDataProvider'
import { SchoolAgendaPage } from './SchoolAgendaPage'
import { ClassDetailsPage, SchoolPage } from './ArenaPages'
import type { Reservation } from '../features/arena/types'

const date = '2026-11-04'
const court = { id: 'school-court', name: 'Quadra 1', sport: 'Futevôlei', status: 'Disponível', openingTime: '16:00', closingTime: '22:00', scheduleConfirmed: true }
const lesson = { id: 'school-class', name: 'Turma de quarta', courtId: court.id, weekDay: 3, startTime: '18:00', endTime: '19:00', sport: 'Futevôlei', startDate: '2026-01-01', teacherId: 'school-teacher', capacity: 6, studentIds: [], status: 'Ativa', notes: '' }
const reservation = { id: 'ordinary-reservation', name: 'Locação fora de Aulas', courtId: court.id, date, startTime: '19:00', endTime: '20:00', customerName: 'Cliente de teste', phone: '', amount: 0, status: 'Confirmada', notes: '' }
const clients: QueryClient[] = []
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
function RouteState() { const location = useLocation(); return <><output data-testid="school-route">{location.pathname}{location.search}</output><output data-testid="school-state">{JSON.stringify(location.state)}</output></> }
function currentUrl() { return new URL(screen.getByTestId('school-route').textContent!, 'https://test.invalid') }
function daySchedule(day: string, extra: Reservation[] = []) {
  const additional = extra.filter(row => row.date === day && row.status !== 'Cancelada')
  const occupied = day === date
  return { date: day, courts: [{ courtId: court.id, openingTime: '16:00', closingTime: '22:00', schedulePending: false, closedForDay: false, closedForMaintenance: false, hasConflict: false, availableMinutes: (occupied ? 240 : 360) - additional.length * 60, occupiedMinutes: (occupied ? 120 : 0) + additional.length * 60, reservedMinutes: occupied ? 60 : 0, classMinutes: (occupied ? 60 : 0) + additional.length * 60,
    blocks: [...(occupied ? [{ source: 'Aula', sourceId: lesson.id, startTime: '18:00', endTime: '19:00' }, { source: 'Reserva', sourceId: reservation.id, startTime: '19:00', endTime: '20:00' }] : []), ...additional.map(row => ({ source: row.activityKind === 'SingleLesson' ? 'Aula avulsa' : 'Aula experimental', sourceId: row.id, startTime: row.startTime, endTime: row.endTime }))],
    freeIntervals: occupied ? [{ startTime: '16:00', endTime: '18:00' }, { startTime: '20:00', endTime: '22:00' }] : [{ startTime: '16:00', endTime: '22:00' }],
  }] }
}
function mockApi(extra: Reservation[] = []) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (init?.method && init.method !== 'GET') throw new Error('A agenda de aulas não pode gravar dados durante a consulta.')
    const url = new URL(String(input), 'https://test.invalid')
    if (url.pathname.endsWith('/courts/schedule-range')) {
      const from = url.searchParams.get('from')!, to = url.searchParams.get('to')!
      const count = (Date.parse(to + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / 86_400_000 + 1
      return json({ from, to, days: Array.from({ length: count }, (_, index) => daySchedule(new Date(Date.parse(from + 'T12:00:00Z') + index * 86_400_000).toISOString().slice(0, 10), extra)) })
    }
    if (url.pathname.endsWith('/courts/schedule')) return json(daySchedule(url.searchParams.get('date')!, extra))
    if (url.pathname.endsWith('/courts')) return json([court])
    if (url.pathname.endsWith('/classes')) return json([lesson])
    if (url.pathname.endsWith('/reservations')) return json([reservation, ...extra])
    if (url.pathname.endsWith('/team')) return json([{ id: 'school-teacher', name: 'Professor de teste', status: 'Ativo' }])
    return json([])
  })
}
function start(path: string) {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ media: query, matches: false, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: () => true })))
  const auth: AuthContextValue = { user: { id: 'school-manager', name: 'Gestor de teste', email: 'school@example.invalid', roles: ['Manager'], permissions: [] }, isBootstrapping: false, signIn: async () => {}, signInWithGoogle: async () => {}, signOut: async () => {}, changePassword: async () => {}, completeFirstAccessWithGoogle: async () => {} }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); clients.push(client)
  render(<QueryClientProvider client={client}><AuthContext.Provider value={auth}><DemoDataProvider enabled><MemoryRouter initialEntries={[path]}><RouteState /><Routes>
    <Route path="/escola" element={<SchoolPage />} />
    <Route path="/escola/agenda" element={<SchoolAgendaPage />} />
    <Route path="/escola/turmas/:classId" element={<ClassDetailsPage />} />
  </Routes></MemoryRouter></DemoDataProvider></AuthContext.Provider></QueryClientProvider>)
}
function expectReadOnly(fetchMock: ReturnType<typeof mockApi>) { expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true) }
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(`${date}T12:00:00Z`)); localStorage.clear(); sessionStorage.clear(); vi.stubEnv('VITE_DEMO_MODE', 'false'); vi.stubEnv('VITE_OPERATIONAL_STORAGE', 'postgres'); vi.stubEnv('VITE_API_URL', '') })
afterEach(() => { clients.splice(0).forEach(client => client.clear()); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it.each(['day', 'list'] as const)('Aulas em %s fixa a atividade e mostra apenas aulas cadastradas mesmo com filtro adulterado', async view => {
  const fetchMock = mockApi()
  start(`/escola/agenda?view=${view}&date=${date}&from=${date}&to=${date}&activity=livre&status=Confirmada`)
  expect(await screen.findByRole('button', { name: /Turma de quarta/ })).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 1, name: 'Aulas' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Locação fora de Aulas/ })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Mostrar')).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /Nova reserva|Reservar|Reservas semanais/ })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Nova turma' })).toHaveAttribute('href', expect.stringContaining('/escola/novo'))
  expectReadOnly(fetchMock)
})

it('a semana de Aulas mantém outras ocupações esmaecidas sem oferecer reserva avulsa', async () => {
  const fetchMock = mockApi()
  start(`/escola/agenda?date=${date}&activity=mensalista`)
  expect(await screen.findByRole('button', { name: /Aula.*Turma de quarta/ })).not.toHaveClass('is-muted')
  expect(screen.getByRole('button', { name: /Locação.*Locação fora de Aulas/ })).toHaveClass('is-muted')
  expect(screen.getByLabelText('Visualização')).toHaveValue('week')
  const navigation = screen.getByRole('navigation', { name: 'Visão de aulas' })
  expect(within(navigation).getByRole('link', { name: 'Agenda' })).toHaveAttribute('aria-current', 'page')
  expect(new URL(within(navigation).getByRole('link', { name: 'Turmas' }).getAttribute('href')!, 'https://test.invalid').pathname).toBe('/escola')
  expect(screen.queryByLabelText('Destacar atividade')).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /Nova reserva|Reservar|Reservas semanais/ })).not.toBeInTheDocument()
  expectReadOnly(fetchMock)
})

it('troca as três visualizações, limpa filtros e escolhe um dia mantendo a rota de Aulas', async () => {
  const fetchMock = mockApi()
  start(`/escola/agenda?view=week&date=${date}&q=Turma`)
  const user = userEvent.setup()
  await screen.findByRole('button', { name: /Turma de quarta/ })
  await user.selectOptions(screen.getByLabelText('Visualização'), 'day')
  expect(await screen.findByRole('button', { name: /Turma de quarta/ })).toBeInTheDocument()
  expect(currentUrl().pathname).toBe('/escola/agenda')
  await user.selectOptions(screen.getByLabelText('Visualização'), 'list')
  expect(await screen.findByRole('button', { name: /Turma de quarta/ })).toBeInTheDocument()
  await user.click(screen.getByRole('link', { name: 'Limpar filtros' }))
  expect(currentUrl().pathname).toBe('/escola/agenda')
  expect(currentUrl().searchParams.has('q')).toBe(false)
  expect(screen.queryByRole('button', { name: /Locação fora de Aulas/ })).not.toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Visualização'), 'day')
  await user.click(within(screen.getByRole('navigation', { name: 'Escolher dia da semana' })).getByRole('link', { name: '05/11/2026' }))
  expect(currentUrl().pathname).toBe('/escola/agenda')
  expect(currentUrl().searchParams.get('date')).toBe('2026-11-05')
  await user.click(within(screen.getByRole('navigation', { name: 'Visão de aulas' })).getByRole('link', { name: 'Turmas' }))
  expect(await screen.findByRole('heading', { level: 1, name: 'Turmas' })).toBeInTheDocument()
  await user.click(within(screen.getByRole('navigation', { name: 'Visão de aulas' })).getByRole('link', { name: 'Agenda' }))
  expect(await screen.findByRole('heading', { level: 1, name: 'Aulas' })).toBeInTheDocument()
  expectReadOnly(fetchMock)
})

it('Ver turma conserva o retorno completo e o rótulo Aulas ao voltar da ficha', async () => {
  const fetchMock = mockApi()
  const initial = `/escola/agenda?view=day&date=${date}&q=Turma`
  start(initial)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: /Turma de quarta/ }))
  const panel = screen.getByRole('dialog', { name: lesson.name })
  expect(within(panel).getByText('Professor de teste')).toBeInTheDocument()
  await user.click(within(panel).getByRole('link', { name: 'Ver turma' }))
  expect(await screen.findByRole('heading', { level: 1, name: lesson.name })).toBeInTheDocument()
  expect(JSON.parse(screen.getByTestId('school-state').textContent!)).toMatchObject({ returnLabel: 'Aulas', returnTo: initial })
  const back = screen.getByRole('link', { name: '← Aulas' })
  expect(back).toHaveAttribute('href', initial)
  await user.click(back)
  await waitFor(() => expect(screen.getByTestId('school-route')).toHaveTextContent(initial))
  expectReadOnly(fetchMock)
})

it.each(['day', 'list', 'week'] as const)('Aulas em %s inclui aula avulsa e experimental no dia correto, com professor e cliente preservados', async view => {
  const single: Reservation = { ...reservation, id: 'single-lesson', activityKind: 'SingleLesson', teacherId: 'school-teacher', customerId: 'single-customer', customerName: 'Cliente da aula avulsa', name: 'Encontro avulso de teste', startTime: '20:00', endTime: '21:00', status: 'Confirmada' }
  const trial: Reservation = { ...single, id: 'trial-lesson', activityKind: 'Trial', name: 'Experimental de teste', startTime: '21:00', endTime: '22:00' }
  const fetchMock = mockApi([single, trial]); start(`/escola/agenda?view=${view}&date=${date}&from=${date}&to=${date}`)
  const button = await screen.findByRole('button', { name: /Encontro avulso de teste/ }); expect(button).not.toHaveClass('is-muted')
  expect(await screen.findByRole('button', { name: /Experimental de teste/ })).not.toHaveClass('is-muted')
  if (view !== 'week') { expect(screen.queryByRole('button', { name: /Locação fora de Aulas/ })).not.toBeInTheDocument(); expect(screen.getByText('3 aulas', { exact: true })).toBeInTheDocument() }
  await userEvent.click(button); const panel = within(screen.getByRole('dialog', { name: single.name })); expect(panel.getByText('Aula avulsa', { exact: true })).toBeInTheDocument(); expect(panel.getByText('Professor de teste')).toBeInTheDocument(); expect(panel.getByText(single.customerName)).toBeInTheDocument(); expect(panel.queryByRole('link', { name: 'Ver turma' })).not.toBeInTheDocument(); expect(panel.getByRole('link', { name: 'Ver reserva' })).toHaveAttribute('href', expect.stringContaining(`/agenda/${single.id}`)); expectReadOnly(fetchMock)
})
