import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../features/auth/authContext'
import { DemoDataProvider } from '../features/operations/DemoDataProvider'
import { LegacyDestination } from '../components/RouteDestinations'
import { ClassDetailsPage, SchoolPage } from './ArenaPages'
import { RentalGroupPage, RentalGroupsPage } from './RentalGroupsPage'
import { RentalAgendaPage } from './RentalAgendaPage'
import { SchoolAgendaPage } from './SchoolAgendaPage'

const date = '2026-11-04'
const court = { id: 'return-court', name: 'Quadra retorno', sport: 'Futevôlei', status: 'Disponível', openingTime: '16:00', closingTime: '23:00', scheduleConfirmed: true }
const group = { id: 'return-group', name: 'Grupo retorno', courtId: court.id, sport: 'Futevôlei', weekDay: 3, startTime: '20:00', endTime: '21:00', startDate: '2026-01-01', endDate: '', status: 'Ativo', capacity: 12, organizerId: 'organizer', backupId: '', members: [{ id: 'organizer', name: 'Organizador de teste', phone: '', status: 'Ativo' }], monthlyAmount: 500, dueDay: 10, fifthPolicy: 'Incluído', extraAmount: null, notes: '', version: 1 }
const marker = { originalContext: 'synthetic-return-state' }
const clients: QueryClient[] = []
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })

function RouteState() {
  const location = useLocation()
  return <><output data-testid="creation-route">{location.pathname}{location.search}</output><output data-testid="creation-state">{JSON.stringify(location.state)}</output></>
}
function start(path: string, state: unknown = marker, permissions?: string[]) {
  const auth: AuthContextValue = { user: { id: 'creation-user', name: 'Pessoa de teste', email: 'creation@example.invalid', roles: permissions ? ['Operations'] : ['Manager'], permissions: permissions ?? [] }, isBootstrapping: false, signIn: async () => {}, signInWithGoogle: async () => {}, signOut: async () => {}, changePassword: async () => {}, completeFirstAccessWithGoogle: async () => {} }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); clients.push(client)
  const url = new URL(path, 'https://test.invalid')
  return render(<QueryClientProvider client={client}><AuthContext.Provider value={auth}><DemoDataProvider enabled><MemoryRouter initialEntries={[{ pathname: url.pathname, search: url.search, state }]}><RouteState /><Routes>
    <Route path="/mensalistas" element={<RentalGroupsPage />} />
    <Route path="/mensalistas/agenda" element={<RentalAgendaPage />} />
    <Route path="/mensalistas/:groupId" element={<RentalGroupPage />} />
    <Route path="/escola" element={<SchoolPage />} />
    <Route path="/escola/agenda" element={<SchoolAgendaPage />} />
    <Route path="/escola/turmas/:classId" element={<ClassDetailsPage />} />
    <Route path="/escola/:classId" element={<LegacyDestination to="/escola/turmas" parameter="classId" />} />
  </Routes></MemoryRouter></DemoDataProvider></AuthContext.Provider></QueryClientProvider>)
}
function fixture() {
  const saved: Record<string, unknown>[] = []
  const classes: Record<string, unknown>[] = []
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'https://test.invalid')
    if (init?.method && init.method !== 'GET') {
      if (init.method !== 'PUT' || !url.pathname.includes('/operations/classes/')) throw new Error('Unexpected write in return test.')
      const record = { ...JSON.parse(String(init.body)), version: 1 }; saved.push(record); classes.push(record)
      return json(record)
    }
    const schedule = (day: string) => ({ date: day, courts: [{ courtId: court.id, openingTime: '16:00', closingTime: '23:00', availableMinutes: 420, occupiedMinutes: 0, reservedMinutes: 0, classMinutes: 0, schedulePending: false, blocks: [], freeIntervals: [{ startTime: '16:00', endTime: '23:00' }] }] })
    if (url.pathname.endsWith('/courts/schedule')) return json(schedule(url.searchParams.get('date')!))
    if (url.pathname.endsWith('/courts/schedule-range')) {
      const from = url.searchParams.get('from')!, to = url.searchParams.get('to')!
      const count = (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000 + 1
      return json({ from, to, days: Array.from({ length: count }, (_, index) => schedule(new Date(Date.parse(`${from}T12:00:00Z`) + index * 86_400_000).toISOString().slice(0, 10))) })
    }
    if (url.pathname.endsWith('/courts')) return json([court])
    if (url.pathname.endsWith('/rentalGroups')) return json([group])
    if (url.pathname.endsWith('/classes')) return json(classes)
    if (url.pathname.endsWith('/team')) return json([{ id: 'return-teacher', name: 'Professor retorno', status: 'Ativo' }])
    return json([])
  })
  return { fetch, saved }
}
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.stubEnv('VITE_DEMO_MODE', 'false'); vi.stubEnv('VITE_OPERATIONAL_STORAGE', 'postgres'); vi.stubEnv('VITE_API_URL', '') })
afterEach(() => { clients.splice(0).forEach(client => client.clear()); vi.unstubAllEnvs() })

it.each(['cancel', 'close'])('cadastrar grupo pela agenda retorna à mesma seleção e estado ao %s', async action => {
  const { fetch } = fixture()
  const initial = `/mensalistas/agenda?view=day&date=${date}&q=Grupo&status=Confirmada`
  start(initial)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('link', { name: '+ Cadastrar grupo' }))
  await screen.findByRole('heading', { level: 1, name: 'Novo grupo mensalista' })
  await user.click(screen.getByRole('button', { name: action === 'cancel' ? 'Cancelar' : 'Fechar Novo grupo mensalista' }))
  await waitFor(() => expect(screen.getByTestId('creation-route')).toHaveTextContent(initial))
  expect(JSON.parse(screen.getByTestId('creation-state').textContent!)).toEqual(marker)
  expect(fetch.mock.calls.some(([, init]) => init?.method && init.method !== 'GET')).toBe(false)
})

it.each(['cancel', 'close'])('nova turma pela agenda retorna à mesma seleção e estado ao %s', async action => {
  const { fetch } = fixture()
  const initial = `/escola/agenda?view=day&date=${date}&q=Turma&status=Confirmada`
  start(initial)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('link', { name: 'Nova turma' }))
  await screen.findByRole('heading', { level: 1, name: 'Nova turma' })
  await user.click(screen.getByRole('button', { name: action === 'cancel' ? 'Cancelar' : 'Fechar Nova turma' }))
  await waitFor(() => expect(screen.getByTestId('creation-route')).toHaveTextContent(initial))
  expect(JSON.parse(screen.getByTestId('creation-state').textContent!)).toEqual(marker)
  expect(fetch.mock.calls.some(([, init]) => init?.method && init.method !== 'GET')).toBe(false)
})

it('salvar nova turma conserva o retorno para a agenda e a identificação da origem', async () => {
  const { saved } = fixture()
  const initial = `/escola/agenda?view=day&date=${date}&q=Turma`
  start(initial)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('link', { name: 'Nova turma' }))
  await screen.findByRole('option', { name: 'Professor retorno' })
  await user.selectOptions(screen.getByLabelText('Nível'), 'Iniciante')
  await user.selectOptions(screen.getByLabelText('Professor'), 'return-teacher')
  expect(screen.queryByLabelText('Quadra')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Salvar turma' }))
  await screen.findByRole('heading', { level: 1, name: 'Iniciante' })
  expect(saved).toHaveLength(1)
  expect(saved[0]).toMatchObject({ name: 'Iniciante', teacherId: 'return-teacher', courtId: court.id })
  expect(JSON.parse(screen.getByTestId('creation-state').textContent!)).toMatchObject({ returnTo: initial, returnLabel: 'Aulas', returnState: marker })
  await user.click(screen.getByRole('link', { name: '← Aulas' }))
  await waitFor(() => expect(screen.getByTestId('creation-route')).toHaveTextContent(initial))
})

it('desabilita a alternância para Agenda durante edição rápida do grupo e a restaura ao cancelar', async () => {
  const { fetch } = fixture()
  start('/mensalistas?month=2026-11')
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Editar' }))
  const navigation = screen.getByRole('navigation', { name: 'Visão de mensalistas' })
  expect(within(navigation).queryByRole('link', { name: 'Agenda' })).not.toBeInTheDocument()
  expect(within(navigation).getByText('Agenda')).toHaveAttribute('aria-disabled', 'true')
  await user.click(screen.getByRole('button', { name: 'Cancelar' }))
  await user.click(within(navigation).getByRole('link', { name: 'Agenda' }))
  await waitFor(() => expect(screen.getByTestId('creation-route')).toHaveTextContent('/mensalistas/agenda?date=2026-11-'))
  expect(fetch.mock.calls.some(([, init]) => init?.method && init.method !== 'GET')).toBe(false)
})

it('Turmas não oferece agenda sem projects:read e a URL direta permanece restrita', async () => {
  const { fetch } = fixture()
  const view = start('/escola', marker, ['students:read'])
  const navigation = screen.getByRole('navigation', { name: 'Visão de aulas' })
  expect(within(navigation).queryByRole('link', { name: 'Agenda' })).not.toBeInTheDocument()
  expect(within(navigation).getByText('Agenda')).toHaveAttribute('aria-disabled', 'true')
  view.unmount()
  start('/escola/agenda', marker, ['students:read'])
  expect(screen.getByRole('heading', { name: 'Acesso restrito' })).toBeInTheDocument()
  expect(fetch.mock.calls.some(([input]) => String(input).includes('/courts/schedule'))).toBe(false)
})

it.each([
  ['group', 'https://example.invalid/fora'], ['group', '/mensalistas\\agenda'], ['group', '/mensalistas/agenda/fora'], ['group', '/mensalistas/agenda?bad=\nvalue'],
  ['class', '//example.invalid/fora'], ['class', '/escola\\agenda'], ['class', '/escola/agenda/fora'], ['class', '/escola/agenda#fora'],
])('recusa retorno %s fora das duas páginas internas permitidas: %j', async (kind, returnTo) => {
  fixture()
  start(kind === 'group' ? '/mensalistas/novo' : '/escola/turmas/novo', { returnTo })
  await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }))
  await waitFor(() => expect(screen.getByTestId('creation-route')).toHaveTextContent(kind === 'group' ? '/mensalistas' : '/escola'))
  expect(screen.getByTestId('creation-route').textContent).toBe(kind === 'group' ? '/mensalistas' : '/escola')
})
