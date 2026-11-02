import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../features/auth/authContext'
import { DemoDataProvider } from '../features/operations/DemoDataProvider'
import type { ArenaClass, Court, CourtSchedule, CourtScheduleBlock } from '../features/arena/types'
import { ClassDetailsPage, SchoolPage } from './ArenaPages'
import { SchoolAgendaPage } from './SchoolAgendaPage'

const courts: Court[] = [
  { id: 'court-alpha', name: 'Quadra Alfa', sport: 'Futevôlei', status: 'Disponível', openingTime: '06:00', closingTime: '24:00', scheduleConfirmed: true },
  { id: 'court-beta', name: 'Quadra Beta', sport: 'Futevôlei', status: 'Disponível', openingTime: '06:00', closingTime: '24:00', scheduleConfirmed: true },
]
const classes: ArenaClass[] = [
  { id: 'mon-empty', name: 'Turma sem alunos', courtId: 'court-alpha', weekDay: 1, startTime: '06:00', endTime: '07:00' },
  { id: 'mon-evening', name: 'Turma de segunda à noite', courtId: 'court-alpha', weekDay: 1, startTime: '18:00', endTime: '19:00' },
  { id: 'tue-alpha', name: 'Turma com nome repetido', courtId: 'court-alpha', weekDay: 2, startTime: '19:00', endTime: '20:00' },
  { id: 'tue-beta', name: 'Turma com nome repetido', courtId: 'court-beta', weekDay: 2, startTime: '19:00', endTime: '20:00', teacherId: 'teacher-beta' },
  { id: 'wed', name: 'Turma de quarta', courtId: 'court-alpha', weekDay: 3, startTime: '20:00', endTime: '21:00' },
  { id: 'thu', name: 'Turma de quinta', courtId: 'court-alpha', weekDay: 4, startTime: '17:00', endTime: '18:00' },
  { id: 'fri', name: 'Turma de sexta até meia-noite', courtId: 'court-alpha', weekDay: 5, startTime: '23:00', endTime: '24:00' },
  { id: 'sat', name: 'Turma de sábado', courtId: 'court-beta', weekDay: 6, startTime: '08:00', endTime: '09:00' },
  { id: 'sun', name: 'Turma de domingo', courtId: 'court-alpha', weekDay: 0, startTime: '09:00', endTime: '10:00' },
  { id: 'future', name: 'Turma com início futuro', courtId: 'court-beta', weekDay: 4, startTime: '18:00', endTime: '19:00', startDate: '2026-11-12' },
  { id: 'paused', name: 'Turma pausada', courtId: 'court-alpha', weekDay: 2, startTime: '08:00', endTime: '09:00', status: 'Pausada' as const },
  { id: 'ended', name: 'Turma encerrada', courtId: 'court-beta', weekDay: 3, startTime: '08:00', endTime: '09:00', status: 'Encerrada' as const },
].map(row => ({ sport: 'Futevôlei', startDate: '2026-01-01', teacherId: 'teacher-alpha', capacity: 8, studentIds: [], status: 'Ativa' as const, notes: '', ...row }))

// Explicit API occurrences, independent of the frontend recurrence helpers.
// The directory also contains future/paused/ended records that have no block in this week.
const occurrences: [string, string][] = [
  ['2026-10-26', 'mon-empty'], ['2026-10-26', 'mon-evening'],
  ['2026-10-27', 'tue-alpha'], ['2026-10-27', 'tue-beta'],
  ['2026-10-28', 'wed'], ['2026-10-29', 'thu'], ['2026-10-30', 'fri'], ['2026-10-31', 'sat'], ['2026-11-01', 'sun'],
  ['2026-11-02', 'mon-empty'], ['2026-11-02', 'mon-evening'],
  ['2026-11-03', 'tue-alpha'], ['2026-11-03', 'tue-beta'],
  ['2026-11-04', 'wed'], ['2026-11-05', 'thu'], ['2026-11-06', 'fri'], ['2026-11-07', 'sat'], ['2026-11-08', 'sun'],
  ['2026-11-09', 'mon-empty'], ['2026-11-09', 'mon-evening'],
  ['2026-11-10', 'tue-alpha'], ['2026-11-10', 'tue-beta'],
  ['2026-11-11', 'wed'], ['2026-11-12', 'thu'], ['2026-11-12', 'future'], ['2026-11-13', 'fri'], ['2026-11-14', 'sat'], ['2026-11-15', 'sun'],
]
const clients: QueryClient[] = []
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
const minute = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
const time = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`

function schedule(date: string): CourtSchedule {
  return { date, updatedAtUtc: '2026-11-02T12:00:00Z', courts: courts.map(court => {
    const blocks: CourtScheduleBlock[] = occurrences.filter(([day]) => day === date).map(([, id]) => classes.find(row => row.id === id)!)
      .filter(row => row.courtId === court.id).map(row => ({ source: 'Aula' as const, sourceId: row.id, startTime: row.startTime, endTime: row.endTime }))
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
    const freeIntervals: { startTime: string; endTime: string }[] = []
    let cursor = 360
    for (const block of blocks) {
      if (minute(block.startTime) > cursor) freeIntervals.push({ startTime: time(cursor), endTime: block.startTime })
      cursor = minute(block.endTime)
    }
    if (cursor < 1440) freeIntervals.push({ startTime: time(cursor), endTime: '24:00' })
    const occupiedMinutes = blocks.reduce((total, block) => total + minute(block.endTime) - minute(block.startTime), 0)
    return { courtId: court.id, openingTime: '06:00', closingTime: '24:00', operatingMinutes: 1080, availableMinutes: 1080 - occupiedMinutes,
      occupiedMinutes, reservedMinutes: 0, classMinutes: occupiedMinutes, closedForDay: false, closedForMaintenance: false, schedulePending: false, hasConflict: false, blocks, freeIntervals }
  }) }
}

function mockApi() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (init?.method && init.method !== 'GET') throw new Error('Conferir a agenda não pode gravar dados.')
    const url = new URL(String(input), 'https://test.invalid')
    if (url.pathname.endsWith('/courts/schedule-range')) {
      const from = url.searchParams.get('from')!, to = url.searchParams.get('to')!
      const days: CourtSchedule[] = []
      for (let stamp = Date.parse(from + 'T12:00:00Z'); stamp <= Date.parse(to + 'T12:00:00Z'); stamp += 86_400_000) days.push(schedule(new Date(stamp).toISOString().slice(0, 10)))
      return json({ from, to, updatedAtUtc: '2026-11-02T12:00:00Z', days })
    }
    if (url.pathname.endsWith('/courts/schedule')) return json(schedule(url.searchParams.get('date')!))
    if (url.pathname.endsWith('/courts')) return json(courts)
    if (url.pathname.endsWith('/classes')) return json(classes)
    if (url.pathname.endsWith('/team')) return json([{ id: 'teacher-alpha', name: 'Professor Alfa', status: 'Ativo' }, { id: 'teacher-beta', name: 'Professor Beta', status: 'Ativo' }])
    return json([])
  })
}

function RouteState() {
  const location = useLocation()
  return <><output data-testid="coverage-route">{location.pathname}{location.search}</output><output data-testid="coverage-state">{JSON.stringify(location.state)}</output></>
}
function start(path: string) {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ media: query, matches: false, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: () => true })))
  const auth: AuthContextValue = { user: { id: 'coverage-manager', name: 'Gestor de teste', email: 'coverage@example.invalid', roles: ['Manager'], permissions: [] }, isBootstrapping: false, signIn: async () => {}, signInWithGoogle: async () => {}, signOut: async () => {}, changePassword: async () => {}, completeFirstAccessWithGoogle: async () => {} }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); clients.push(client)
  render(<QueryClientProvider client={client}><AuthContext.Provider value={auth}><DemoDataProvider enabled><MemoryRouter initialEntries={[path]}><RouteState /><Routes>
    <Route path="/escola" element={<SchoolPage />} />
    <Route path="/escola/agenda" element={<SchoolAgendaPage />} />
    <Route path="/escola/turmas/:classId" element={<ClassDetailsPage />} />
  </Routes></MemoryRouter></DemoDataProvider></AuthContext.Provider></QueryClientProvider>)
}
function assertReadOnly(fetchMock: ReturnType<typeof mockApi>) {
  expect(fetchMock.mock.calls.length).toBeGreaterThan(0)
  expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true)
}
function classCards() { return screen.getAllByRole('button', { name: /^\d\d:\d\d–\d\d:\d\d\s*Turma/ }) }

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.stubEnv('VITE_DEMO_MODE', 'false'); vi.stubEnv('VITE_OPERATIONAL_STORAGE', 'postgres'); vi.stubEnv('VITE_API_URL', ''); vi.spyOn(window, 'scrollTo').mockImplementation(() => {}) })
afterEach(() => { clients.splice(0).forEach(client => client.clear()); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it('a semana exibe nove ocorrências nos sete dias, sem depender de matrículas ou de confirmação mensal', async () => {
  const fetchMock = mockApi()
  start('/escola/agenda?view=week&date=2026-11-02&activity=mensalista&status=Cancelada&group=outro-grupo')
  await screen.findByRole('button', { name: /Aula · 06:00–07:00 · Turma sem alunos/ })
  expect(screen.getAllByRole('button', { name: /^Aula ·/ })).toHaveLength(9)
  const expected = [
    ['02/11/2026', ['Turma sem alunos', 'Turma de segunda à noite']],
    ['03/11/2026', ['Turma com nome repetido', 'Turma com nome repetido']],
    ['04/11/2026', ['Turma de quarta']], ['05/11/2026', ['Turma de quinta']],
    ['06/11/2026', ['Turma de sexta até meia-noite']], ['07/11/2026', ['Turma de sábado']], ['08/11/2026', ['Turma de domingo']],
  ] as const
  for (const [date, names] of expected) {
    const day = within(screen.getByRole('region', { name: date }))
    expect(day.getAllByRole('button', { name: /^Aula ·/ })).toHaveLength(names.length)
    for (const name of names) expect(day.getAllByRole('button', { name: new RegExp(name) }).length).toBeGreaterThan(0)
  }
  expect(screen.getByRole('button', { name: 'Aula · 19:00–20:00 · Turma com nome repetido · Quadra Alfa · Ocupado' })).not.toHaveClass('is-muted')
  expect(screen.getByRole('button', { name: 'Aula · 19:00–20:00 · Turma com nome repetido · Quadra Beta · Ocupado' })).not.toHaveClass('is-muted')
  expect(screen.queryByRole('button', { name: /Turma pausada|Turma encerrada|Turma com início futuro/ })).not.toBeInTheDocument()
  assertReadOnly(fetchMock)
})

it.each([
  ['2026-11-02', 2, 'Turma sem alunos'], ['2026-11-03', 2, 'Turma com nome repetido'],
  ['2026-11-04', 1, 'Turma de quarta'], ['2026-11-05', 1, 'Turma de quinta'],
  ['2026-11-06', 1, 'Turma de sexta até meia-noite'], ['2026-11-07', 1, 'Turma de sábado'], ['2026-11-08', 1, 'Turma de domingo'],
] as const)('o dia %s mostra todas as %s aulas do contrato, inclusive fins de semana', async (date, count, name) => {
  const fetchMock = mockApi()
  start(`/escola/agenda?view=day&date=${date}&activity=livre&status=Confirmada&group=outro-grupo`)
  await screen.findAllByRole('button', { name: new RegExp(name) })
  expect(classCards()).toHaveLength(count)
  expect(screen.queryByRole('button', { name: /Turma pausada|Turma encerrada|Turma com início futuro/ })).not.toBeInTheDocument()
  if (date === '2026-11-06') expect(screen.getByRole('button', { name: /23:00–24:00/ })).toBeInTheDocument()
  assertReadOnly(fetchMock)
})

it('a lista da semana mantém as nove ocorrências e os dois registros com mesmo nome em quadras diferentes', async () => {
  const fetchMock = mockApi()
  start('/escola/agenda?view=list&date=2026-11-02&from=2026-11-02&to=2026-11-08')
  await screen.findByRole('button', { name: /Turma sem alunos/ })
  expect(classCards()).toHaveLength(9)
  expect(screen.getByText('9 aulas', { exact: true })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Turma com nome repetido.*03\/11\/2026 · Quadra Alfa/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Turma com nome repetido.*03\/11\/2026 · Quadra Beta/ })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Turma pausada|Turma encerrada|Turma com início futuro/ })).not.toBeInTheDocument()
  assertReadOnly(fetchMock)
})

it.each(['day', 'week', 'list'] as const)('a visão %s mostra a turma futura quando o contrato inclui seu primeiro encontro', async view => {
  const fetchMock = mockApi()
  start(`/escola/agenda?view=${view}&date=2026-11-12&from=2026-11-12&to=2026-11-12`)
  expect(await screen.findByRole('button', { name: /18:00–19:00.*Turma com início futuro|Turma com início futuro.*18:00–19:00/ })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Turma pausada|Turma encerrada/ })).not.toBeInTheDocument()
  assertReadOnly(fetchMock)
})

it.each([
  ['Quadra Alfa', 'tue-alpha', 'Professor Alfa'], ['Quadra Beta', 'tue-beta', 'Professor Beta'],
] as const)('a turma de nome repetido na %s abre seu próprio ID e professor, sem trocar o vínculo', async (court, id, teacher) => {
  const fetchMock = mockApi()
  const initial = '/escola/agenda?view=day&date=2026-11-03'
  start(initial)
  await screen.findAllByRole('button', { name: /Turma com nome repetido/ })
  const user = userEvent.setup()
  await user.click(within(screen.getByRole('region', { name: court })).getByRole('button', { name: /Turma com nome repetido/ }))
  const panel = within(screen.getByRole('dialog', { name: 'Turma com nome repetido' }))
  expect(panel.getByText(teacher, { exact: true })).toBeInTheDocument()
  expect(new URL(panel.getByRole('link', { name: 'Ver turma' }).getAttribute('href')!, 'https://test.invalid').pathname).toBe(`/escola/turmas/${id}`)
  await user.click(panel.getByRole('link', { name: 'Ver turma' }))
  expect(await screen.findByRole('heading', { level: 1, name: 'Turma com nome repetido' })).toBeInTheDocument()
  expect(screen.getByTestId('coverage-route')).toHaveTextContent(`/escola/turmas/${id}`)
  expect(JSON.parse(screen.getByTestId('coverage-state').textContent!)).toMatchObject({ returnLabel: 'Aulas', returnTo: initial })
  await user.click(screen.getByRole('link', { name: '← Aulas' }))
  await waitFor(() => expect(screen.getByTestId('coverage-route')).toHaveTextContent(initial))
  expect(classCards()).toHaveLength(2)
  assertReadOnly(fetchMock)
})

it('a lista atravessa o mês com 28 ocorrências, pagina 20+8 e retorna da turma à segunda página', async () => {
  const fetchMock = mockApi()
  const initial = '/escola/agenda?view=list&date=2026-10-26&from=2026-10-26&to=2026-11-15'
  start(initial)
  await screen.findAllByRole('button', { name: /Turma sem alunos/ })
  expect(screen.getByText('28 aulas', { exact: true })).toBeInTheDocument()
  expect(classCards()).toHaveLength(20)
  expect(screen.getByRole('button', { name: /Turma sem alunos.*26\/10\/2026/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Turma de segunda à noite.*09\/11\/2026/ })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /15\/11\/2026/ })).not.toBeInTheDocument()
  const pages = within(screen.getByRole('navigation', { name: 'Páginas dos registros' }))
  expect(pages.getByText('1 de 2 · 28 registros')).toBeInTheDocument()
  const user = userEvent.setup()
  await user.click(pages.getByRole('button', { name: 'Próxima' }))
  expect(classCards()).toHaveLength(8)
  expect(screen.getByText('2 de 2 · 28 registros')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Turma de domingo.*15\/11\/2026/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Turma com início futuro.*12\/11\/2026/ })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /26\/10\/2026/ })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /Turma com nome repetido.*10\/11\/2026 · Quadra Beta/ }))
  await user.click(within(screen.getByRole('dialog', { name: 'Turma com nome repetido' })).getByRole('link', { name: 'Ver turma' }))
  expect(await screen.findByRole('heading', { level: 1, name: 'Turma com nome repetido' })).toBeInTheDocument()
  expect(screen.getByTestId('coverage-route')).toHaveTextContent('/escola/turmas/tue-beta')
  expect(screen.getByRole('link', { name: '← Aulas' })).toHaveAttribute('href', initial + '&page=2')
  await user.click(screen.getByRole('link', { name: '← Aulas' }))
  await waitFor(() => expect(screen.getByTestId('coverage-route')).toHaveTextContent(initial + '&page=2'))
  expect(classCards()).toHaveLength(8)
  await user.click(screen.getByRole('button', { name: 'Anterior' }))
  expect(classCards()).toHaveLength(20)
  expect(screen.getByText('1 de 2 · 28 registros')).toBeInTheDocument()
  assertReadOnly(fetchMock)
})
