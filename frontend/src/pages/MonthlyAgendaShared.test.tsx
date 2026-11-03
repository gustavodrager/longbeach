import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../features/auth/authContext'
import { DemoDataProvider } from '../features/operations/DemoDataProvider'
import { AgendaPage } from './AgendaPage'
import { Breadcrumb } from './arenaUi'

const court = { id: 'court-monthly', name: 'Quadra demonstração', sport: 'Futevôlei', status: 'Disponível', openingTime: '16:00', closingTime: '22:00', scheduleConfirmed: true }
const group = { id: 'monthly-group', name: 'Grupo mensal', organizerId: 'owner', members: [{ id: 'owner', name: 'Responsável atual', status: 'Ativo' }, { id: 'new', name: 'Participante novo', status: 'Ativo' }], notes: '', weekDay: 1, startTime: '20:00', endTime: '21:00', startDate: '2026-01-01', status: 'Ativo', courtId: court.id }
const monthly = { id: 'monthly-meeting', name: 'Encontro mensal', courtId: court.id, date: '2026-10-09', startTime: '20:00', endTime: '21:00', customerName: 'Responsável atual', phone: '', amount: 0, status: 'Confirmada', notes: '', rentalGroupId: group.id, rentalMonth: '2026-09' }
const recurring = { ...monthly, id: 'recurring', name: 'Recorrência avulsa', rentalGroupId: undefined, rentalMonth: undefined, groupId: 'recurring-series', startTime: '18:00', endTime: '19:00' }
const block = { ...recurring, id: 'blocked', name: 'Bloqueio registrado', groupId: undefined, status: 'Bloqueio', startTime: '19:00', endTime: '20:00' }
const lesson = { id: 'lesson', name: 'Aula de sexta', courtId: court.id, weekDay: 5, startTime: '17:00', endTime: '18:00', capacity: 6, studentIds: [], teacherId: '', status: 'Ativa', notes: '' }
const clients: QueryClient[] = []
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })

function RouteState() {
  const location = useLocation()
  return <output data-testid="route">{location.pathname}{location.search}</output>
}
function Destination() {
  const location = useLocation()
  return <><h1>Ficha selecionada</h1><output data-testid="destination-month">{new URLSearchParams(location.search).get('month')}</output><Breadcrumb to="/mensalistas" label="Grupos" /></>
}
function start(path = '/mensalistas/agenda?date=2026-10-09', demoMode = true, customHeader = false) {
  const auth: AuthContextValue = { user: { id: 'manager-synthetic', name: 'Gestor demonstração', email: 'demo@example.invalid', roles: ['Manager'], permissions: [] }, isBootstrapping: false, signIn: async () => {}, signInWithGoogle: async () => {}, signOut: async () => {}, changePassword: async () => {}, completeFirstAccessWithGoogle: async () => {} }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client)
  return render(<QueryClientProvider client={client}><AuthContext.Provider value={auth}><DemoDataProvider enabled demoMode={demoMode}><MemoryRouter initialEntries={[path]}><RouteState /><Routes>
    <Route path="/mensalistas/agenda" element={<AgendaPage context="monthly" header={customHeader ? <header><h1>Agenda dos mensalistas</h1></header> : undefined} />} />
    <Route path="/escola/agenda" element={<AgendaPage context="school" header={customHeader ? <header><h1>Agenda das aulas</h1></header> : undefined} />} />
    <Route path="/mensalistas/:groupId" element={<Destination />} />
    <Route path="/agenda" element={<AgendaPage />} />
    <Route path="/agenda/:reservationId" element={<Destination />} />
    <Route path="/escola/turmas/:classId" element={<Destination />} />
  </Routes></MemoryRouter></DemoDataProvider></AuthContext.Provider></QueryClientProvider>)
}
function seed(scheduleConfirmed = true) {
  localStorage.setItem('longbeach-os-demo-v1', JSON.stringify({ courts: [{ ...court, scheduleConfirmed }], rentalGroups: [group, { ...group, id: 'unconfirmed-group', name: 'Grupo sem encontros' }], rentalMonths: [{ id: 'month-record', rentalGroupId: group.id, month: '2026-09', members: [{ id: 'historic', name: 'Participante do mês' }] }], reservations: [monthly, recurring, block, { ...monthly, id: 'cancelled-monthly', name: 'Mensalista cancelado', status: 'Cancelada', startTime: '21:00', endTime: '22:00' }], classes: [lesson] }))
}
beforeEach(() => { localStorage.clear(); vi.stubEnv('VITE_DEMO_MODE', 'true'); vi.stubEnv('VITE_OPERATIONAL_STORAGE', 'local') })
afterEach(() => { clients.splice(0).forEach(client => client.clear()); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it('reutiliza a semana com cabeçalho único, ocupação real e contexto sem criar reservas avulsas', async () => {
  seed()
  const fetch = vi.spyOn(globalThis, 'fetch')
  start('/mensalistas/agenda?date=2026-10-09&activity=classes', true, true)
  const member = await screen.findByRole('button', { name: /Mensalista.*Grupo mensal/ })
  expect(member).not.toHaveClass('is-muted')
  expect(screen.getByRole('button', { name: /Aula.*Aula de sexta/ })).toHaveClass('is-muted')
  expect(screen.getByRole('button', { name: /Locação.*Recorrência avulsa/ })).toHaveClass('is-muted')
  expect(screen.getByRole('button', { name: /Bloqueado.*Bloqueio registrado/ })).toHaveClass('is-muted')
  expect(screen.getByRole('button', { name: /A confirmar.*Grupo sem encontros/ })).toHaveClass('is-rental-preview')
  expect(screen.queryByRole('button', { name: /Mensalista cancelado/ })).not.toBeInTheDocument()
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  expect(screen.getByRole('heading', { name: 'Agenda dos mensalistas' })).toBeInTheDocument()
  expect(screen.getAllByRole('main')).toHaveLength(1)
  expect(screen.queryByLabelText('Destacar atividade')).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /Nova reserva|Reservas semanais/ })).not.toBeInTheDocument()
  expect(screen.getByTestId('route')).toHaveTextContent('activity=classes')
  const user = userEvent.setup()
  await user.click(screen.getByText('Resumo da semana'))
  const summary = screen.getByRole('region', { name: 'Resumo da semana' })
  expect(within(summary).getByText('38 h')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Limpar filtros' })).not.toBeInTheDocument()
  expect(screen.getByText('Mensalistas em destaque. As demais atividades ocupam seus horários.')).toBeInTheDocument()
  expect(screen.getByText('Filtros')).toBeInTheDocument()
  expect(member).not.toHaveClass('is-muted')
  expect(within(screen.getByRole('region', { name: 'Resumo da semana' })).getByText('38 h')).toBeInTheDocument()
  expect(fetch.mock.calls.some(([, init]) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(init?.method ?? 'GET'))).toBe(false)
})

it('mantém a busca por grupo e o filtro fixo ao trocar semana, dia e lista e limpar filtros', async () => {
  seed()
  start('/mensalistas/agenda?date=2026-10-09&q=Grupo&activity=livre')
  await screen.findByRole('button', { name: /Mensalista.*Grupo mensal/ })
  const user = userEvent.setup()
  await user.selectOptions(screen.getByLabelText('Visualização'), 'day')
  expect(await screen.findByRole('button', { name: /Encontro mensal/ })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Recorrência avulsa|Aula de sexta|Bloqueio registrado/ })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Mostrar')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: '08/10/2026' })).toHaveAttribute('href', expect.stringMatching(/^\/mensalistas\/agenda\?/))
  expect(screen.queryByRole('link', { name: /Nova reserva|Reservas semanais/ })).not.toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Visualização'), 'list')
  expect(await screen.findByRole('button', { name: /Encontro mensal/ })).toBeInTheDocument()
  expect(screen.getByTestId('route')).toHaveTextContent('/mensalistas/agenda?')
  expect(screen.getByTestId('route')).toHaveTextContent('q=Grupo')
  expect(screen.queryByText('Consultar horários livres')).not.toBeInTheDocument()
  await user.click(screen.getByRole('link', { name: 'Limpar filtros' }))
  expect(await screen.findByText('1 encontro')).toBeInTheDocument()
  expect(screen.getByTestId('route')).toHaveTextContent('/mensalistas/agenda?')
  expect(screen.queryByRole('button', { name: /Recorrência avulsa|Aula de sexta|Bloqueio registrado/ })).not.toBeInTheDocument()
})

it('abre o dia no celular e mantém os atalhos na rota mensalista sem sobrescrever a semana explícita', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  seed()
  const view = start()
  expect(screen.getByLabelText('Visualização')).toHaveValue('day')
  await userEvent.click(screen.getByRole('link', { name: '08/10/2026' }))
  expect(screen.getByTestId('route')).toHaveTextContent('/mensalistas/agenda?date=2026-10-08&view=day')
  view.unmount()
  start('/mensalistas/agenda?date=2026-10-09&view=week')
  expect(screen.getByLabelText('Visualização')).toHaveValue('week')
})

it.each(['group', 'reservation'])('preserva a competência histórica e o retorno completo ao abrir a ficha de %s', async target => {
  seed()
  const path = '/mensalistas/agenda?date=2026-10-09&view=week&q=Grupo'
  start(path)
  const user = userEvent.setup()
  const trigger = await screen.findByRole('button', { name: /Mensalista.*Grupo mensal/ })
  await user.click(trigger)
  const panel = screen.getByRole('dialog', { name: 'Grupo mensal' })
  expect(within(panel).getByText('Participante do mês')).toBeInTheDocument()
  expect(within(panel).queryByText('Participante novo')).not.toBeInTheDocument()
  expect(within(panel).queryByText(/cobrança|mensalidade/i)).not.toBeInTheDocument()
  await user.click(within(panel).getByRole('link', { name: target === 'group' ? 'Ver grupo' : 'Ver reserva' }))
  if (target === 'group') expect(screen.getByTestId('destination-month')).toHaveTextContent('2026-09')
  await user.click(screen.getByRole('link', { name: '← Mensalistas' }))
  expect(screen.getByTestId('route')).toHaveTextContent(path)
  expect(await screen.findByRole('button', { name: /Mensalista.*Grupo mensal/ })).toBeInTheDocument()
})

it('mantém foco ao fechar os detalhes e não inventa intervalos livres com funcionamento pendente', async () => {
  seed(false)
  start()
  const trigger = await screen.findByRole('button', { name: /Mensalista.*Grupo mensal/ })
  const user = userEvent.setup()
  await user.click(trigger)
  await user.click(screen.getByRole('button', { name: 'Fechar Grupo mensal' }))
  await waitFor(() => expect(trigger).toHaveFocus())
  await user.click(screen.getByText('Resumo da semana'))
  expect(within(screen.getByRole('region', { name: 'Resumo da semana' })).getByText('A confirmar')).toBeInTheDocument()
  const friday = screen.getByRole('region', { name: `Disponibilidade em 09/10/2026` })
  expect(friday).toHaveTextContent('Horários ainda não conferidos')
  expect(friday).not.toHaveTextContent('16:00–17:00')
})

it('mantém a falha real da consulta semanal e permite tentar novamente', async () => {
  vi.stubEnv('VITE_DEMO_MODE', 'false')
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const path = String(input)
    return path.includes('/schedule-range') ? json({ message: 'Indisponível' }, 503) : json(path.endsWith('/courts') ? [court] : path.endsWith('/reservations') ? [monthly] : path.endsWith('/rentalGroups') ? [group] : [])
  })
  start('/mensalistas/agenda?date=2026-10-09', false)
  expect(await screen.findByRole('alert')).toHaveTextContent('Agenda incompleta')
  expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /Nova reserva/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Grupo mensal/ })).not.toBeInTheDocument()
  expect(screen.getByTestId('route')).toHaveTextContent('/mensalistas/agenda?date=2026-10-09')
})

it('reutiliza as três vistas escolares com aulas e experimentais existentes sem duplicar nem incluir canceladas e bloqueios na seleção', async () => {
  seed()
  const snapshot = JSON.parse(localStorage.getItem('longbeach-os-demo-v1')!)
  snapshot.reservations.push({ ...recurring, id: 'trial', name: 'Aula experimental individual', groupId: undefined, activityKind: 'Trial', startTime: '16:00', endTime: '16:30' })
  snapshot.reservations.push({ ...recurring, id: 'trial-cancelled', name: 'Experimental cancelada', groupId: undefined, activityKind: 'Trial', status: 'Cancelada', startTime: '16:30', endTime: '17:00' })
  snapshot.reservations.push({ ...recurring, id: 'trial-blocked', name: 'Experimental bloqueada', groupId: undefined, activityKind: 'Trial', status: 'Bloqueio', startTime: '21:00', endTime: '21:30' })
  localStorage.setItem('longbeach-os-demo-v1', JSON.stringify(snapshot))
  start('/escola/agenda?date=2026-10-09&activity=mensalista&status=Confirmada&group=recorrente', true, true)
  expect(await screen.findByRole('button', { name: /Aula.*Aula de sexta/ })).not.toHaveClass('is-muted')
  expect(screen.getByRole('button', { name: /Aula.*Aula experimental individual/ })).not.toHaveClass('is-muted')
  expect(screen.getByRole('button', { name: /Mensalista.*Grupo mensal/ })).toHaveClass('is-muted')
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  expect(screen.getByRole('heading', { name: 'Agenda das aulas' })).toBeInTheDocument()
  expect(screen.queryByLabelText('Destacar atividade')).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /Nova reserva|Reservas semanais/ })).not.toBeInTheDocument()
  expect(screen.getByTestId('route')).toHaveTextContent('activity=mensalista')
  const user = userEvent.setup()
  await user.selectOptions(screen.getByLabelText('Visualização'), 'day')
  expect(await screen.findByRole('button', { name: /Aula de sexta/ })).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: /Aula experimental individual/ })).toHaveLength(1)
  expect(screen.queryByRole('button', { name: /Experimental cancelada|Experimental bloqueada|Encontro mensal|Recorrência avulsa/ })).not.toBeInTheDocument()
  expect(screen.getByLabelText('Situação da reserva')).toBeDisabled()
  expect(screen.queryByLabelText('Mostrar')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: '08/10/2026' })).toHaveAttribute('href', expect.stringMatching(/^\/escola\/agenda\?/))
  await user.selectOptions(screen.getByLabelText('Visualização'), 'list')
  expect(await screen.findByText('2 aulas')).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: /Aula experimental individual/ })).toHaveLength(1)
  expect(screen.getByTestId('route')).toHaveTextContent('/escola/agenda?')
  expect(screen.queryByRole('link', { name: 'Limpar filtros' })).not.toBeInTheDocument()
  expect(await screen.findByText('2 aulas')).toBeInTheDocument()
  expect(screen.getByTestId('route')).toHaveTextContent('/escola/agenda?')
  expect(screen.queryByRole('button', { name: /Experimental cancelada|Experimental bloqueada|Encontro mensal|Recorrência avulsa/ })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /Aula experimental individual/ }))
  const panel = screen.getByRole('dialog', { name: 'Aula experimental individual' })
  expect(within(panel).getByText('Aula experimental individual', { selector: 'dd' })).toBeInTheDocument()
  expect(within(panel).getByRole('link', { name: 'Ver reserva' })).toBeInTheDocument()
})

it('o filtro classes da agenda geral inclui turmas, experimentais e aulas avulsas sem incluir locações ou mensalistas', async () => {
  seed()
  const snapshot = JSON.parse(localStorage.getItem('longbeach-os-demo-v1')!)
  snapshot.reservations.push({ ...recurring, id: 'trial', name: 'Aula experimental individual', groupId: undefined, activityKind: 'Trial', startTime: '16:00', endTime: '16:30' })
  snapshot.reservations.push({ ...recurring, id: 'single', name: 'Aula avulsa individual', groupId: undefined, activityKind: 'SingleLesson', teacherId: 'teacher-single', customerId: 'customer-single', startTime: '16:30', endTime: '17:00' })
  localStorage.setItem('longbeach-os-demo-v1', JSON.stringify(snapshot))
  start('/agenda?view=day&date=2026-10-09&activity=classes')
  expect(await screen.findByText('3 atividades')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Aula de sexta/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Aula experimental individual/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Aula avulsa individual/ })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Encontro mensal|Recorrência avulsa|Bloqueio registrado/ })).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Atividades do dia' })).toBeInTheDocument()
  expect(screen.getByLabelText('Disponibilidade dos horários')).toBeInTheDocument()
  expect(screen.getByText('0 reservas/bloqueios · 3 aulas')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Limpar filtros' })).toBeInTheDocument()
})

it('preserva o retorno da ficha da turma para a agenda escolar filtrada', async () => {
  seed()
  const path = '/escola/agenda?date=2026-10-09&view=week&q=Aula'
  start(path)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: /Aula.*Aula de sexta/ }))
  await user.click(within(screen.getByRole('dialog', { name: 'Aula de sexta' })).getByRole('link', { name: 'Ver turma' }))
  await user.click(screen.getByRole('link', { name: '← Aulas' }))
  expect(screen.getByTestId('route')).toHaveTextContent(path)
  expect(await screen.findByRole('button', { name: /Aula.*Aula de sexta/ })).toBeInTheDocument()
})

it.each([
  ['monthly', '/mensalistas/agenda', 'Encontros do dia', '1 encontro'],
  ['school', '/escola/agenda', 'Aulas do dia', '1 aula'],
])('o dia %s mostra só o resumo pertinente e leva os detalhes gerais para Agenda completa', async (_context, path, heading, count) => {
  seed()
  start(`${path}?view=day&date=2026-10-09&activity=livre`)
  expect(await screen.findByText(count)).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Atividades' })).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Horários livres' })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Disponibilidade dos horários')).not.toBeInTheDocument()
  expect(screen.queryByText(/reserva\/bloqueio|reservas\/bloqueios| h livres no dia|Funcionamento: /)).not.toBeInTheDocument()
  expect(await screen.findByText('Funcionamento confirmado')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Limpar filtros' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByText('Mais opções'))
  const link = screen.getByRole('link', { name: 'Agenda completa' })
  const url = new URL(link.getAttribute('href')!, 'https://test.invalid')
  expect(url.pathname).toBe('/agenda')
  expect(url.searchParams.get('date')).toBe('2026-10-09')
  expect(url.searchParams.get('view')).toBe('day')
  expect(url.searchParams.has('activity')).toBe(false)
})

it('conta somente filtros reais e mantém o contexto ao limpar uma busca no dia', async () => {
  seed()
  start('/mensalistas/agenda?view=day&date=2026-10-09&activity=classes&q=Grupo')
  expect(await screen.findByText('1 encontro')).toBeInTheDocument()
  expect(screen.getByText('Filtros · 1 ativo')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('link', { name: 'Limpar filtros' }))
  expect(await screen.findByText('1 encontro')).toBeInTheDocument()
  expect(screen.getByText('Filtros')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Limpar filtros' })).not.toBeInTheDocument()
  expect(screen.getByTestId('route')).toHaveTextContent('/mensalistas/agenda?')
  expect(screen.getByTestId('route')).toHaveTextContent('activity=classes')
  expect(screen.queryByRole('button', { name: /Recorrência avulsa|Aula de sexta/ })).not.toBeInTheDocument()
})

it.each([
  ['pending', 'A confirmar'], ['maintenance', 'Em manutenção'], ['conflict', 'Horários sobrepostos · confira a agenda'],
])('o status curto preserva a situação %s na consulta do dia', async (state, label) => {
  seed(state !== 'pending')
  const snapshot = JSON.parse(localStorage.getItem('longbeach-os-demo-v1')!)
  if (state === 'maintenance') snapshot.courts[0].status = 'Manutenção'
  if (state === 'conflict') snapshot.reservations.push({ ...recurring, id: 'overlap', name: 'Sobreposição', startTime: '20:30', endTime: '21:00' })
  localStorage.setItem('longbeach-os-demo-v1', JSON.stringify(snapshot))
  start('/mensalistas/agenda?view=day&date=2026-10-09')
  expect(await screen.findByText(label)).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Horários livres' })).not.toBeInTheDocument()
})
