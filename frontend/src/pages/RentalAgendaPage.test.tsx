import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../features/auth/authContext'
import type { AuthUser } from '../features/auth/types'
import type { Court, CourtSchedule, Reservation } from '../features/arena/types'
import type { RentalGroup, RentalMonth } from '../features/arena/rentals'
import { DemoDataProvider } from '../features/operations/DemoDataProvider'
import { RentalAgendaPage } from './RentalAgendaPage'
import { RentalGroupPage, RentalGroupsPage } from './RentalGroupsPage'
import { AgendaPage } from './AgendaPage'

const day = '2026-11-04'
const manager: AuthUser = { id: 'manager-test', name: 'Gestor de teste', email: 'manager@example.invalid', roles: ['Manager'], permissions: [] }
const attendant: AuthUser = { ...manager, id: 'attendant-test', name: 'Atendente de teste', roles: ['Operations'], permissions: ['projects:read', 'projects:write'] }
const court: Court = { id: 'court-test', name: 'Quadra 1', sport: 'Futevôlei', status: 'Disponível', openingTime: '16:00', closingTime: '23:00', scheduleConfirmed: true }
const group: RentalGroup = { id: 'group-active', name: 'Grupo de novembro', courtId: court.id, sport: 'Futevôlei', weekDay: 3, startTime: '20:00', endTime: '21:00', startDate: '2026-01-01', endDate: '', status: 'Ativo', capacity: 12, organizerId: 'organizer', backupId: '', members: [{ id: 'organizer', name: 'Responsável atual', phone: '', status: 'Ativo' }], monthlyAmount: 500, dueDay: 10, fifthPolicy: 'Incluído', extraAmount: null, notes: '', version: 1 }
const paused: RentalGroup = { ...group, id: 'group-paused', name: 'Grupo de outubro pausado', status: 'Pausado', weekDay: 5, startTime: '19:00', endTime: '20:00', members: [...group.members, { id: 'new-member', name: 'Integrante adicionado depois', phone: '', status: 'Ativo' }] }
const withoutMeetings: RentalGroup = { ...group, id: 'group-not-generated', name: 'Grupo sem encontros gerados', weekDay: 1, startTime: '20:00', endTime: '22:00' }
const meeting: Reservation = { id: 'meeting-active', name: group.name, courtId: court.id, date: day, startTime: '20:00', endTime: '21:00', customerName: 'Responsável atual', phone: '', amount: 0, status: 'Confirmada', notes: '', rentalGroupId: group.id, rentalMonth: '2026-11' }
const rescheduled: Reservation = { ...meeting, id: 'meeting-rescheduled', name: paused.name, rentalGroupId: paused.id, rentalMonth: '2026-10', startTime: '18:00', endTime: '19:00', notes: 'Reposição combinada para novembro.' }
const ordinary: Reservation = { ...meeting, id: 'ordinary-rental', name: 'Locação avulsa', startTime: '16:00', endTime: '17:00', rentalGroupId: undefined, rentalMonth: undefined }
const recurring: Reservation = { ...ordinary, id: 'recurring-rental', name: 'Recorrência avulsa', startTime: '17:00', endTime: '18:00', groupId: 'recurring-only', groupTitle: 'Semanal avulsa', occurrenceIndex: 2 }
const block: Reservation = { ...ordinary, id: 'blocked', name: 'Manutenção de rede', startTime: '21:00', endTime: '22:00', status: 'Bloqueio' }
const reservations = [meeting, rescheduled, ordinary, recurring, block]
const months: RentalMonth[] = [
  { id: 'month-october', version: 1, name: 'Competência de outubro', rentalGroupId: paused.id, month: '2026-10', dates: ['2026-10-30'], amount: 500, dueDate: '2026-10-10', createCharge: false, members: [{ id: 'snapshot-october', name: 'Participante da competência de outubro' }] },
  { id: 'month-november', version: 1, name: 'Competência de novembro', rentalGroupId: group.id, month: '2026-11', dates: [day], amount: 500, dueDate: '2026-11-10', createCharge: false, members: [{ id: 'snapshot-november', name: 'Participante de novembro' }] },
]
const clients: QueryClient[] = []
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function RouteState() {
  const location = useLocation()
  return <><output data-testid="route">{location.pathname}{location.search}</output><output data-testid="route-state">{JSON.stringify(location.state)}</output></>
}
function routeUrl() { return new URL(screen.getByTestId('route').textContent!, 'https://test.invalid') }
function start(path: string, user: AuthUser = manager, compact = false) {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ media: query, matches: compact, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: () => true })))
  const auth: AuthContextValue = { user, isBootstrapping: false, signIn: async () => {}, signInWithGoogle: async () => {}, signOut: async () => {}, changePassword: async () => {}, completeFirstAccessWithGoogle: async () => {} }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); clients.push(client)
  render(<QueryClientProvider client={client}><AuthContext.Provider value={auth}><DemoDataProvider enabled><MemoryRouter initialEntries={[path]}><RouteState /><Routes>
    <Route path="/mensalistas" element={<RentalGroupsPage />} />
    <Route path="/mensalistas/agenda" element={<RentalAgendaPage />} />
    <Route path="/mensalistas/:groupId" element={<RentalGroupPage />} />
    <Route path="/agenda" element={<AgendaPage />} />
  </Routes></MemoryRouter></DemoDataProvider></AuthContext.Provider></QueryClientProvider>)
}

function schedule(date: string, redacted = false): CourtSchedule {
  const occupied = date === day
  return { date, updatedAtUtc: '2026-11-01T12:00:00Z', courts: [{ courtId: court.id, openingTime: '16:00', closingTime: '23:00', closedForDay: false, closedForMaintenance: false, schedulePending: false, hasConflict: false, operatingMinutes: 420, availableMinutes: occupied ? 60 : 420, occupiedMinutes: occupied ? 360 : 0, reservedMinutes: occupied ? 300 : 0, classMinutes: occupied ? 60 : 0,
    blocks: occupied ? [...reservations.map(row => ({ source: row.status === 'Bloqueio' ? 'Bloqueio' as const : 'Reserva' as const, sourceId: row.id, startTime: row.startTime, endTime: row.endTime })), { source: 'Aula', sourceId: redacted ? null : 'class-test', startTime: '19:00', endTime: '20:00' }] : [],
    freeIntervals: [{ startTime: occupied ? '22:00' : '16:00', endTime: '23:00' }],
  }] }
}
function mockApi({ user = manager, failure, partial = false }: { user?: AuthUser; failure?: 'day' | 'week'; partial?: boolean } = {}) {
  const redacted = user.roles.includes('Operations')
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'https://test.invalid')
    if (init?.method && init.method !== 'GET') throw new Error('Esta consulta não pode gravar dados.')
    if (url.pathname.endsWith('/courts/schedule-range')) {
      if (failure === 'week') return json({ message: 'Consulta de horários indisponível.' }, 503)
      const from = url.searchParams.get('from')!, to = url.searchParams.get('to')!
      const count = (Date.parse(to + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / 86_400_000 + 1
      const days = Array.from({ length: count }, (_, index) => schedule(new Date(Date.parse(from + 'T12:00:00Z') + index * 86_400_000).toISOString().slice(0, 10), redacted))
      return json({ from, to, days: partial ? days.filter(row => row.date === day) : days })
    }
    if (url.pathname.endsWith('/courts/schedule')) return failure === 'day' ? json({ message: 'Consulta de horários indisponível.' }, 503) : json(schedule(url.searchParams.get('date')!, redacted))
    if (url.pathname.endsWith('/courts')) return json([court])
    if (url.pathname.endsWith('/reservations')) return json(reservations)
    if (url.pathname.endsWith('/rentalGroups')) return json([group, paused, withoutMeetings].map(row => redacted ? { ...row, costsVisible: false, monthlyAmount: null, extraAmount: null } : row))
    if (url.pathname.endsWith('/rentalMonths')) return json(months.map(row => redacted ? { ...row, costsVisible: false, amount: null } : row))
    if (url.pathname.endsWith('/classes')) return json([{ id: 'class-test', name: 'Turma de quarta', courtId: court.id, weekDay: 3, startTime: '19:00', endTime: '20:00', sport: 'Futevôlei', startDate: '2026-01-01', teacherId: '', capacity: 6, studentIds: [], status: 'Ativa', notes: '' }])
    return json([])
  })
}
function expectReadOnly(fetchMock: ReturnType<typeof mockApi>) {
  expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true)
  expect(fetchMock.mock.calls.some(([input]) => /\/rentals\/groups\/[^/]+\/months(?:\?|$)/.test(String(input)))).toBe(false)
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.stubEnv('VITE_DEMO_MODE', 'false'); vi.stubEnv('VITE_OPERATIONAL_STORAGE', 'postgres'); vi.stubEnv('VITE_API_URL', '') })
afterEach(() => { clients.splice(0).forEach(client => client.clear()); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it.each([[false, 'week'], [true, 'day']] as const)('abre a agenda de mensalistas com a visualização responsiva compacta=%s', async (compact, view) => {
  const fetchMock = mockApi()
  start(`/mensalistas/agenda?date=${day}&month=2026-11`, manager, compact)
  expect(await screen.findByRole('heading', { level: 1, name: 'Mensalistas' })).toBeInTheDocument()
  expect(screen.getByLabelText('Visualização')).toHaveValue(view)
  const navigation = screen.getByRole('navigation', { name: 'Visão de mensalistas' })
  expect(new URL(within(navigation).getByRole('link', { name: 'Grupos' }).getAttribute('href')!, 'https://test.invalid').pathname).toBe('/mensalistas')
  expect(within(navigation).getByRole('link', { name: 'Agenda' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('link', { name: /Cadastrar grupo/ })).toHaveAttribute('href', expect.stringContaining('/mensalistas/novo'))
  expect(screen.queryByRole('link', { name: /Nova reserva|Reservar|Reservas semanais/ })).not.toBeInTheDocument()
  expectReadOnly(fetchMock)
})

it.each(['day', 'list'] as const)('mantém encontros confirmados na vista %s, mesmo com activity adulterada e grupo já pausado', async view => {
  const fetchMock = mockApi()
  start(`/mensalistas/agenda?view=${view}&date=${day}&from=${day}&to=${day}&month=2026-11&activity=livre`)
  expect(await screen.findByRole('button', { name: new RegExp(paused.name) })).toHaveTextContent('18:00–19:00')
  expect(screen.getByRole('button', { name: new RegExp(group.name) })).toHaveTextContent('20:00–21:00')
  expect(screen.queryByRole('button', { name: /Locação avulsa|Recorrência avulsa|Manutenção de rede|Turma de quarta/ })).not.toBeInTheDocument()
  expect(screen.queryByText(withoutMeetings.name)).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Mostrar')).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /Nova reserva|Reservar|Reservas semanais/ })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: new RegExp(paused.name) }))
  const panel = screen.getByRole('dialog', { name: paused.name })
  expect(within(panel).getByText('04/11/2026')).toBeInTheDocument()
  expect(within(panel).getByText('Participantes registrados no mês 10/2026.')).toBeInTheDocument()
  expect(within(panel).getByText('Participante da competência de outubro')).toBeInTheDocument()
  expect(within(panel).queryByText('Integrante adicionado depois')).not.toBeInTheDocument()
  expectReadOnly(fetchMock)
})

it.each(['week', 'day', 'list'] as const)('exibe o grupo de segunda sem competência gerada como A confirmar na vista %s', async view => {
  const fetchMock = mockApi()
  const monday = '2026-11-02'
  start(`/mensalistas/agenda?view=${view}&date=${monday}&from=${monday}&to=${monday}`)
  const preview = await screen.findByRole('button', { name: new RegExp(withoutMeetings.name) })
  expect(preview).toHaveTextContent('20:00–22:00')
  expect(preview).toHaveTextContent('A confirmar')
  expect(preview.getAttribute('aria-label') ?? '').not.toContain('Ocupado')
  if (view === 'week') {
    expect(preview).toHaveStyle({ width: '100%' })
    await userEvent.click(screen.getByText('Resumo da semana'))
    const summary = screen.getByRole('region', { name: 'Resumo da semana' })
    expect(within(summary).getByText('Mensalistas').parentElement).toHaveTextContent('2 · 2 h')
  } else expect(screen.getByText('0 encontros · 1 a confirmar')).toBeInTheDocument()
  await userEvent.click(preview)
  const panel = screen.getByRole('dialog', { name: withoutMeetings.name })
  expect(within(panel).getByText('02/11/2026')).toBeInTheDocument()
  expect(within(panel).getByText('Mensalista · A confirmar')).toBeInTheDocument()
  expect(within(panel).queryByRole('link', { name: 'Ver reserva' })).not.toBeInTheDocument()
  const destination = new URL(within(panel).getByRole('link', { name: 'Ver grupo' }).getAttribute('href')!, 'https://test.invalid')
  expect(destination.pathname).toBe(`/mensalistas/${withoutMeetings.id}`)
  expect(destination.searchParams.get('month')).toBe('2026-11')
  expectReadOnly(fetchMock)
})

it('permite filtrar previsões sem misturar com reservas confirmadas', async () => {
  const fetchMock = mockApi()
  start('/mensalistas/agenda?view=list&from=2026-11-02&to=2026-11-08&status=A+confirmar')
  expect(await screen.findByRole('button', { name: new RegExp(withoutMeetings.name) })).toHaveTextContent('A confirmar')
  expect(screen.queryByRole('button', { name: new RegExp(group.name) })).not.toBeInTheDocument()
  expect(screen.getByText('0 encontros · 1 a confirmar')).toBeInTheDocument()
  expectReadOnly(fetchMock)
})

it('mantém a agenda geral baseada nas ocupações registradas', async () => {
  const fetchMock = mockApi()
  start('/agenda?view=week&date=2026-11-02')
  await screen.findByRole('button', { name: /Mensalista.*Grupo de novembro/ })
  expect(screen.queryByRole('button', { name: new RegExp(withoutMeetings.name) })).not.toBeInTheDocument()
  expect(screen.queryByText('A confirmar: horário previsto, sem reserva da quadra.')).not.toBeInTheDocument()
  expectReadOnly(fetchMock)
})

it('mantém todas as ocupações na semana e esmaece as que não são mensalistas', async () => {
  mockApi()
  start(`/mensalistas/agenda?view=week&date=${day}&activity=aula`)
  expect(await screen.findByRole('button', { name: new RegExp(`Mensalista.*${paused.name}`) })).not.toHaveClass('is-muted')
  expect(screen.getByRole('button', { name: new RegExp(`Mensalista.*${group.name}`) })).not.toHaveClass('is-muted')
  for (const label of ['Locação.*Locação avulsa', 'Locação.*Recorrência avulsa', 'Bloqueado.*Manutenção de rede', 'Aula.*Turma de quarta']) expect(screen.getByRole('button', { name: new RegExp(label) })).toHaveClass('is-muted')
  expect(screen.queryByLabelText('Destacar atividade')).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /Nova reserva|Reservar|Reservas semanais/ })).not.toBeInTheDocument()
})

it('troca semana, dia, lista, atalhos de dia e limpa filtros sem sair de mensalistas', async () => {
  const fetchMock = mockApi()
  start(`/mensalistas/agenda?view=week&date=${day}&month=2026-11&q=outubro&status=Confirmada`)
  const user = userEvent.setup()
  await screen.findByRole('button', { name: new RegExp(paused.name) })
  await user.selectOptions(screen.getByLabelText('Visualização'), 'day')
  expect(await screen.findByRole('button', { name: new RegExp(paused.name) })).toBeInTheDocument()
  expect(routeUrl().pathname).toBe('/mensalistas/agenda')
  await user.selectOptions(screen.getByLabelText('Visualização'), 'list')
  expect(await screen.findByRole('button', { name: new RegExp(paused.name) })).toBeInTheDocument()
  expect(routeUrl().searchParams.get('from')).toBe(day)
  expect(routeUrl().searchParams.get('to')).toBe(day)
  await user.click(screen.getByRole('link', { name: 'Limpar filtros' }))
  expect(await screen.findByRole('button', { name: new RegExp(group.name) })).toBeInTheDocument()
  expect(routeUrl().pathname).toBe('/mensalistas/agenda')
  expect(routeUrl().searchParams.get('month')).toBe('2026-11')
  expect(screen.queryByRole('button', { name: /Recorrência avulsa/ })).not.toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Visualização'), 'day')
  const days = screen.getByRole('navigation', { name: 'Escolher dia da semana' })
  const next = within(days).getByRole('link', { name: '05/11/2026' })
  expect(new URL(next.getAttribute('href')!, 'https://test.invalid').pathname).toBe('/mensalistas/agenda')
  await user.click(next)
  expect(routeUrl().searchParams.get('date')).toBe('2026-11-05')
  expect(routeUrl().pathname).toBe('/mensalistas/agenda')
  expectReadOnly(fetchMock)
})

it('abre o grupo na competência original do encontro remarcado e volta ao endereço completo de mensalistas', async () => {
  const fetchMock = mockApi()
  const initial = `/mensalistas/agenda?view=day&date=${day}&month=2026-11&q=outubro&status=Confirmada`
  start(initial)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: new RegExp(paused.name) }))
  const panel = screen.getByRole('dialog', { name: paused.name })
  const link = within(panel).getByRole('link', { name: 'Ver grupo' })
  expect(new URL(link.getAttribute('href')!, 'https://test.invalid').searchParams.get('month')).toBe('2026-10')
  await user.click(link)
  expect(await screen.findByRole('heading', { level: 1, name: paused.name })).toBeInTheDocument()
  expect(screen.getByLabelText('Competência')).toHaveValue('2026-10')
  expect(JSON.parse(screen.getByTestId('route-state').textContent!)).toMatchObject({ returnLabel: 'Mensalistas', returnTo: initial })
  const back = screen.getByRole('link', { name: '← Mensalistas' })
  expect(back).toHaveAttribute('href', initial)
  await user.click(back)
  expect(await screen.findByRole('heading', { level: 1, name: 'Mensalistas' })).toBeInTheDocument()
  expect(screen.getByTestId('route')).toHaveTextContent(initial)
  expectReadOnly(fetchMock)
})

it.each(['day', 'week'] as const)('uma falha de horários em %s preserva a incerteza e não oferece novas reservas', async view => {
  const fetchMock = mockApi({ failure: view })
  start(`/mensalistas/agenda?view=${view}&date=${day}`)
  if (view === 'week') expect(await screen.findByRole('alert')).toHaveTextContent('Agenda incompleta')
  else expect(await screen.findByText('Não foi possível verificar a disponibilidade.')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /Nova reserva|Reservar|Reservas semanais/ })).not.toBeInTheDocument()
  expect(screen.queryByText(/\d+ h livres no dia/)).not.toBeInTheDocument()
  if (view === 'day') expect(screen.getByRole('button', { name: new RegExp(paused.name) })).toBeInTheDocument()
  expectReadOnly(fetchMock)
})

it('resposta parcial da semana deixa o dia não consultado a confirmar, sem inventar horários livres', async () => {
  mockApi({ partial: true })
  start(`/mensalistas/agenda?view=week&date=${day}`)
  await screen.findByRole('button', { name: new RegExp(paused.name) })
  const missing = screen.getByRole('region', { name: '05/11/2026' })
  expect(within(missing).getByText('Horários vazios a confirmar')).toBeInTheDocument()
  expect(within(missing).queryByText('Livre', { exact: true })).not.toBeInTheDocument()
  expect(within(missing).queryByRole('link', { name: /Nova reserva/ })).not.toBeInTheDocument()
  await userEvent.click(screen.getByText('Resumo da semana'))
  expect(within(screen.getByRole('region', { name: 'Resumo da semana' })).getByText('A confirmar')).toBeInTheDocument()
})

it('Atendente consulta encontros e participantes sem valores, acesso financeiro ou gravações', async () => {
  const fetchMock = mockApi({ user: attendant })
  start(`/mensalistas/agenda?view=week&date=${day}&month=2026-11`, attendant)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: new RegExp(`Mensalista.*${paused.name}`) }))
  const panel = screen.getByRole('dialog', { name: paused.name })
  expect(within(panel).getByText('Participante da competência de outubro')).toBeInTheDocument()
  expect(screen.queryByText(/R\$/)).not.toBeInTheDocument()
  expect(within(panel).queryByRole('link', { name: /financeiro|cobrança|pagamento/i })).not.toBeInTheDocument()
  await user.click(within(panel).getByRole('button', { name: `Fechar ${paused.name}` }))
  await user.selectOptions(screen.getByLabelText('Visualização'), 'list')
  expect(await screen.findByRole('button', { name: new RegExp(group.name) })).toBeInTheDocument()
  expect(fetchMock.mock.calls.some(([input]) => /\/(financeEntries|billing|expenses|financial-history|bar|classes|students|team)(?:\/|\?|$)/.test(String(input)))).toBe(false)
  expectReadOnly(fetchMock)
})

it('a troca entre Grupos e Agenda preserva o mês e não mistura situações de grupo com situações de reserva', async () => {
  const fetchMock = mockApi()
  start('/mensalistas?month=2026-11&status=Ativo')
  const user = userEvent.setup()
  await screen.findByRole('link', { name: `Ver ${group.name}` })
  const navigation = screen.getByRole('navigation', { name: 'Visão de mensalistas' })
  await user.click(within(navigation).getByRole('link', { name: 'Agenda' }))
  expect(await screen.findByLabelText('Visualização')).toBeInTheDocument()
  expect(routeUrl().pathname).toBe('/mensalistas/agenda')
  expect(routeUrl().searchParams.get('date')).toMatch(/^2026-11-/)
  expect(routeUrl().searchParams.get('status')).not.toBe('Ativo')
  await user.selectOptions(screen.getByLabelText('Visualização'), 'day')
  fireEvent.change(screen.getByLabelText('Situação da reserva'), { target: { value: 'Confirmada' } })
  await user.click(within(screen.getByRole('navigation', { name: 'Visão de mensalistas' })).getByRole('link', { name: 'Grupos' }))
  expect(await screen.findByLabelText('Situação do grupo')).toHaveValue('')
  expect(routeUrl().searchParams.get('month')).toBe('2026-11')
  expect(screen.getByRole('link', { name: `Ver ${paused.name}` })).toBeInTheDocument()
  expectReadOnly(fetchMock)
})
