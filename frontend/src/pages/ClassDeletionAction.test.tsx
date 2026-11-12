import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../features/auth/authContext'
import type { AuthUser } from '../features/auth/types'
import type { ArenaClass, ClassDeletionResponse, Enrollment, Presence, FinanceEntry, Reservation } from '../features/arena/types'
import { DemoDataProvider, useOperations } from '../features/operations/DemoDataProvider'
import { ClassDetailsPage, SchoolPage, EnrollmentsPage, PresencesPage, ReservationDetailsPage } from './ArenaPages'
import { SchoolAgendaPage } from './SchoolAgendaPage'

const day = '2026-11-02'
const lesson: ArenaClass = { id: '00000000-0000-4000-8000-000000000091', version: 7, name: 'Turma de teste', sport: 'Futevôlei', courtId: 'court-test', teacherId: 'teacher-test', weekDay: 1, startTime: '18:00', endTime: '19:00', capacity: 8, studentIds: [], status: 'Ativa', notes: '' }
const manager: AuthUser = { id: 'manager-test', name: 'Gestor de teste', email: 'manager@example.invalid', roles: ['Manager'], permissions: [] }
const archivedLesson: ArenaClass = { ...lesson, status: 'Encerrada', version: 8, deletedAt: '2026-11-02T20:00:00Z', deletedBy: manager.id, deletedEffectiveDate: day, deletedPreviousStatus: 'Ativa' }
const enrollment: Enrollment = { id: 'enrollment-test', version: 2, name: 'Aluna teste · Turma de teste', classId: lesson.id, studentId: 'student-test', startDate: '2026-10-01', status: 'Ativa', monthlyAmount: 150 }
const archivedEnrollment: Enrollment = { ...enrollment, version: 3, status: 'Encerrada', endDate: day, closedByClassDeletion: true, cancelledBeforeStart: false }
const clients: QueryClient[] = []
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
function fixture() {
  const archiveResponse = (enrollments: Enrollment[] = [], reservations: Reservation[] = []) => json({ class: archivedLesson, enrollments, reservations } satisfies ClassDeletionResponse)
  const state = { rows: [{ ...lesson }], enrollments: [] as Enrollment[], presences: [] as Presence[], financeEntries: [] as FinanceEntry[], reservations: [] as Reservation[], failReads: false, deleteResponse: () => Promise.resolve(archiveResponse()) }
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'https://test.invalid')
    if (init?.method === 'DELETE') {
      const response = await state.deleteResponse()
      if (response.status === 200) { const result = await response.clone().json() as ClassDeletionResponse; state.rows = [result.class]; state.enrollments = state.enrollments.map(row => result.enrollments.find(changed => changed.id === row.id) ?? row); state.reservations = state.reservations.map(row => result.reservations.find(changed => changed.id === row.id) ?? row) }
      return response
    }
    if (state.failReads) return json({ message: 'Consulta indisponível' }, 503)
    if (url.pathname.endsWith('/classes')) return json(state.rows.filter(row => url.searchParams.get('includeDeleted') === 'true' || !row.deletedAt))
    if (url.pathname.endsWith('/enrollments')) return json(state.enrollments)
    if (url.pathname.endsWith('/reservations')) return json(state.reservations)
    if (url.pathname.endsWith('/presences')) return json(state.presences)
    if (url.pathname.endsWith('/financeEntries')) return json(state.financeEntries)
    if (url.pathname.endsWith('/students')) return json([{ id: 'student-test', name: 'Aluna teste' }])
    if (url.pathname.endsWith('/courts')) return json([{ id: lesson.courtId, name: 'Quadra de teste', sport: 'Futevôlei', status: 'Disponível', openingTime: '07:00', closingTime: '23:00', scheduleConfirmed: true }])
    if (url.pathname.endsWith('/team')) return json([{ id: lesson.teacherId, name: 'Professor de teste', status: 'Ativo' }])
    if (url.pathname.endsWith('/schedule-range')) {
      const from = url.searchParams.get('from')!, to = url.searchParams.get('to')!
      const dates = Array.from({ length: (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1 }, (_, i) => new Date(Date.parse(from) + i * 86_400_000).toISOString().slice(0, 10))
      return json({ from, to, updatedAtUtc: '2026-11-02T10:00:00Z', days: dates.map(date => ({ date, courts: [{ courtId: lesson.courtId, openingTime: '07:00', closingTime: '23:00', availableMinutes: 900, reservedMinutes: 0, classMinutes: state.rows.length * 60, closedForMaintenance: false, hasConflict: false, blocks: date === day ? state.rows.filter(row => !row.deletedAt).map(row => ({ source: 'Aula', sourceId: row.id, startTime: row.startTime, endTime: row.endTime })) : [] }] })) })
    }
    return json([])
  })
  return { state, fetch, archiveResponse, deletes: () => fetch.mock.calls.filter(([, init]) => init?.method === 'DELETE') }
}
function Probe() {
  const location = useLocation(), operations = useOperations()
  const [error, setError] = useState('')
  return <><span data-testid="route">{location.pathname}{location.search}</span><span data-testid="class-count">{operations.classes.length}</span><span data-testid="revision">{operations.scheduleRevision}</span><span data-testid="enrollment-status">{operations.enrollments[0]?.status}</span><span data-testid="presences-count">{operations.presences.length}</span><span data-testid="finance-count">{operations.financeEntries.length}</span><span data-testid="reservation-count">{operations.reservations.length}</span>{operations.reservations[0]&&<Link to={`/agenda/${operations.reservations[0].id}`}>Ver reserva de teste</Link>}<button onClick={() => void operations.reload()}>Atualizar teste</button><button onClick={() => void operations.deleteClass(lesson.id, 7).catch(cause => setError(cause.message))}>Testar chamada direta</button><span>{error}</span></>
}
function start(options: { user?: AuthUser | null; demoMode?: boolean; returnTo?: string; path?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); clients.push(client)
  const identity = options.user === undefined ? manager : options.user
  const initial = new URL(options.path ?? `/escola/turmas/${lesson.id}`, 'https://test.invalid')
  const auth: AuthContextValue = { user: identity, isBootstrapping: false, signIn: async () => {}, signInWithGoogle: async () => {}, signOut: async () => {}, changePassword: async () => {}, completeFirstAccessWithGoogle: async () => {} }
  const tree = (user: AuthUser | null) => <QueryClientProvider client={client}><AuthContext.Provider value={{ ...auth, user }}><DemoDataProvider enabled demoMode={options.demoMode}><MemoryRouter initialEntries={[{ pathname: initial.pathname, search: initial.search, state: options.returnTo ? { returnTo: options.returnTo, returnState: { retained: true } } : null }]}><Probe /><Routes>
    <Route path="/agenda/:reservationId" element={<ReservationDetailsPage />} />
    <Route path="/escola" element={<SchoolPage />} />
    <Route path="/escola/matriculas" element={<EnrollmentsPage />} />
    <Route path="/escola/presencas" element={<PresencesPage />} />
    <Route path="/escola/agenda" element={<SchoolAgendaPage />} />
    <Route path="/escola/turmas/:classId" element={<ClassDetailsPage />} />
  </Routes></MemoryRouter></DemoDataProvider></AuthContext.Provider></QueryClientProvider>
  const rendered = render(tree(identity))
  return { ...rendered, changeUser: (user: AuthUser | null) => rendered.rerender(tree(user)) }
}
async function openConfirmation() {
  await userEvent.click(await screen.findByRole('button', { name: 'Excluir turma' }))
  return within(screen.getByRole('dialog', { name: 'Excluir turma?' }))
}
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear()
  vi.stubEnv('VITE_OPERATIONAL_STORAGE', 'local'); vi.stubEnv('VITE_API_URL', '')
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
})
afterEach(() => { clients.splice(0).forEach(client => client.clear()); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('pede confirmação, foca Cancelar e permite desistir sem excluir', async () => {
  const api = fixture(); start()
  const dialog = await openConfirmation()
  expect(dialog.getByText('Turma de teste')).toBeVisible()
  expect(dialog.getByText(/histórico da turma, as presenças e os registros financeiros serão preservados/)).toBeVisible()
  expect(dialog.getByRole('button', { name: 'Cancelar' })).toHaveFocus()
  expect(api.deletes()).toHaveLength(0)
  await userEvent.click(dialog.getByRole('button', { name: 'Cancelar' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Excluir turma' })).toHaveFocus())
  await openConfirmation()
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: false, cancelable: true }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByTestId('class-count')).toHaveTextContent('1')
  expect(api.deletes()).toHaveLength(0)
})

it('mantém o histórico, bloqueia toques repetidos e retira a turma da lista em uso após confirmação', async () => {
  const api = fixture(); let finish: (response: Response) => void = () => {}
  api.state.deleteResponse = () => new Promise(resolve => { finish = resolve })
  start(); const dialog = await openConfirmation()
  await userEvent.dblClick(dialog.getByRole('button', { name: 'Excluir turma' }))
  expect(api.deletes()).toHaveLength(1)
  expect(api.deletes()[0][0]).toBe(`/api/v1/operations/classes/${lesson.id}?version=7`)
  expect(screen.getByTestId('class-count')).toHaveTextContent('1')
  expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
  expect(dialog.getByRole('button', { name: 'Excluindo…' })).toBeDisabled()
  await userEvent.click(dialog.getByRole('button', { name: 'Fechar Excluir turma?' }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  await act(async () => { finish(api.archiveResponse()); await Promise.resolve() })
  await waitFor(() => expect(screen.getByTestId('route')).toHaveTextContent(/^\/escola$/))
  expect(screen.getByTestId('class-count')).toHaveTextContent('1')
  expect(screen.getByTestId('revision')).toHaveTextContent('1')
  expect(screen.getByRole('status')).toHaveTextContent('Turma excluída.')
  expect(screen.queryByRole('link', { name: /Turma de teste/ })).not.toBeInTheDocument()
})

it('retorna à seleção da agenda e consulta a agenda novamente sem a turma removida', async () => {
  const api = fixture(); start({ path: `/escola/agenda?date=${day}` })
  // Open the class through the real agenda so its cached schedule exists before deleting.
  await userEvent.click(await screen.findByRole('button', { name: /Aula · 18:00–19:00 · Turma de teste/ }))
  await userEvent.click(screen.getByRole('link', { name: 'Ver turma' }))
  const dialog = await openConfirmation()
  await userEvent.click(dialog.getByRole('button', { name: 'Excluir turma' }))
  await waitFor(() => expect(screen.getByTestId('route')).toHaveTextContent('/escola/agenda'))
  expect(await screen.findByRole('status')).toHaveTextContent('Turma excluída.')
  await waitFor(() => expect(api.fetch.mock.calls.filter(([input]) => String(input).includes('/schedule-range')).length).toBeGreaterThan(1))
  expect(screen.queryByRole('button', { name: /Aula · 18:00–19:00 · Turma de teste/ })).not.toBeInTheDocument()
})

it.each([409, 404, 503])('exibe a recusa%d e preserva a turma e a agenda locais', async status => {
  const api = fixture(); const message = status === 409 ? 'Existe uma cobrança recorrente ativa. Cancele a assinatura antes de excluir a turma.' : 'Não foi possível excluir a turma.'
  api.state.deleteResponse = async () => json({ message }, status)
  start(); const dialog = await openConfirmation()
  await userEvent.click(dialog.getByRole('button', { name: 'Excluir turma' }))
  expect(await dialog.findByRole('alert')).toHaveTextContent(message)
  expect(screen.getByTestId('class-count')).toHaveTextContent('1')
  expect(screen.getByTestId('revision')).toHaveTextContent('0')
  expect(screen.getByTestId('route')).toHaveTextContent(`/escola/turmas/${lesson.id}`)
})

it('envia a versão vista na confirmação mesmo após uma atualização em segundo plano', async () => {
  const api = fixture(); start(); const dialog = await openConfirmation()
  api.state.rows = [{ ...lesson, version: 8 }]
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar teste' }))
  await waitFor(() => expect(api.fetch.mock.calls.filter(([input]) => new URL(String(input), 'https://test.invalid').pathname.endsWith('/classes'))).toHaveLength(2))
  await userEvent.click(dialog.getByRole('button', { name: 'Excluir turma' }))
  expect(api.deletes()[0][0]).toBe(`/api/v1/operations/classes/${lesson.id}?version=7`)
})

it('bloqueia exclusão sem conexão e após falha ao atualizar os registros', async () => {
  const api = fixture(); start(); const button = await screen.findByRole('button', { name: 'Excluir turma' })
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  fireEvent(window, new Event('offline'))
  expect(button).toBeDisabled()
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  fireEvent(window, new Event('online'))
  await waitFor(() => expect(button).toBeEnabled())
  api.state.failReads = true
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar teste' }))
  await waitFor(() => expect(button).toBeDisabled())
  expect(api.deletes()).toHaveLength(0)
})

it.each([
  { ...manager, roles: ['Operations'], permissions: ['students:read', 'students:write'] },
  { ...manager, roles: ['Teacher'] },
  { ...manager, roles: ['Student'] },
  { ...manager, roles: ['Manager', 'Operations'] },
  { ...manager, requiresFirstAccess: true },
  null,
] as (AuthUser | null)[])('não oferece exclusão a outra sessão: %j', async user => {
  const api = fixture(); start({ user })
  await waitFor(() => expect(screen.queryByText('Carregando registros da arena…')).not.toBeInTheDocument())
  expect(screen.queryByRole('button', { name: 'Excluir turma' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Testar chamada direta' }))
  expect(await screen.findByText('Somente gestores podem excluir turmas.')).toBeVisible()
  expect(api.deletes()).toHaveLength(0)
})

it('não disponibiliza exclusão na demonstração local, mesmo com Gestor', async () => {
  localStorage.setItem('longbeach-os-demo-v1', JSON.stringify({ classes: [lesson] }))
  const api = fixture(); start({ demoMode: true })
  expect(await screen.findByRole('heading', { name: lesson.name })).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Excluir turma' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Testar chamada direta' }))
  expect(await screen.findByText('Somente gestores podem excluir turmas.')).toBeVisible()
  expect(api.fetch).not.toHaveBeenCalled()
})

it('ignora a confirmação de uma sessão anterior após troca de perfil', async () => {
  const api = fixture(); let finish: (response: Response) => void = () => {}
  api.state.deleteResponse = () => new Promise(resolve => { finish = resolve })
  const app = start(); const dialog = await openConfirmation()
  await userEvent.click(dialog.getByRole('button', { name: 'Excluir turma' }))
  app.changeUser({ ...manager, roles: ['Operations'], permissions: ['students:read', 'students:write'] })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await act(async () => { finish(api.archiveResponse()); await Promise.resolve() })
  expect(screen.getByTestId('route')).toHaveTextContent(`/escola/turmas/${lesson.id}`)
  expect(screen.queryByText('Turma excluída. Histórico preservado.')).not.toBeInTheDocument()
})

it.each(['https://external.invalid', '/escola/turmas/outra', '/financeiro'])('descarta retorno inadequado %s e retorna às turmas', async returnTo => {
  fixture(); start({ returnTo }); const dialog = await openConfirmation()
  await userEvent.click(dialog.getByRole('button', { name: 'Excluir turma' }))
  await waitFor(() => expect(screen.getByTestId('route')).toHaveTextContent(/^\/escola$/))
  expect(screen.getByRole('status')).toHaveTextContent('Turma excluída.')
})


it('exclui com alunos e mantém matrículas, presenças e financeiro acessíveis no histórico após recarregar', async () => {
  const api = fixture()
  api.state.enrollments = [enrollment]
  api.state.presences = [{ id: 'presence-test', name: 'Aluna teste · presença', studentId: enrollment.studentId, classId: lesson.id, date: '2026-10-26', status: 'Presente' }]
  api.state.financeEntries = [{ id: 'finance-test', name: 'Mensalidade de outubro', direction: 'Receber', origin: 'Escola', amount: 150, dueDate: '2026-10-05', status: 'Pago', paidDate: '2026-10-05', notes: '', sourceId: enrollment.id, sourceKind: 'enrollments', month: '2026-10' }]
  api.state.deleteResponse = async () => api.archiveResponse([archivedEnrollment])
  start(); const dialog = await openConfirmation()
  await userEvent.click(dialog.getByRole('button', { name: 'Excluir turma' }))
  await waitFor(() => expect(screen.getByTestId('route')).toHaveTextContent(/^\/escola$/))
  expect(screen.getByTestId('enrollment-status')).toHaveTextContent('Encerrada')
  expect(screen.getByTestId('presences-count')).toHaveTextContent('1')
  expect(screen.getByTestId('finance-count')).toHaveTextContent('1')
  expect(screen.queryByRole('link', { name: /Turma de teste/ })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Atualizar teste' }))
  await userEvent.click(screen.getByRole('link', { name: 'Consultar turmas excluídas' }))
  await userEvent.click(await screen.findByRole('link', { name: /Turma de teste.*Consultar histórico/ }))
  expect(await screen.findByText(/Turma excluída em/)).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Histórico de matrículas' })).toBeVisible()
  expect(screen.getByText('Aluna teste')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Editar turma' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Excluir turma' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Registrar presença' })).not.toBeInTheDocument()
  expect(api.fetch.mock.calls.some(([input]) => String(input) === '/api/v1/operations/classes?includeDeleted=true')).toBe(true)
  await userEvent.click(screen.getByRole('link', { name: 'Ver matrículas →' }))
  expect(await screen.findByText('Histórico da turma excluída')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Editar matrícula' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Matricular aluno' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Criar mensalidade →' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Ver cobranças →' })).toHaveAttribute('href', `/financeiro?origin=Escola&source=${enrollment.id}&sourceKind=enrollments&range=all`)
})

it('consulta presenças preservadas mesmo sem matrícula válida e não oferece nova chamada', async () => {
  const api = fixture(); api.state.rows = [archivedLesson]
  api.state.presences = [{ id: 'legacy-presence', name: 'Presença importada', classId: lesson.id, studentId: 'missing-student', date: '2026-10-19', status: 'Ausente' }]
  start({ path: `/escola/turmas/${lesson.id}?acao=editar` })
  await userEvent.click(await screen.findByRole('link', { name: 'Ver histórico de presenças →' }))
  expect(await screen.findByRole('heading', { name: 'Histórico de presenças' })).toBeVisible()
  expect(screen.getByText('Presença importada')).toBeVisible()
  expect(screen.getByText('19/10/2026')).toBeVisible()
  expect(screen.getByText('Ausente')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Presente' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Ausente' })).not.toBeInTheDocument()
})

it('omite a turma excluída dos filtros em uso e das opções de matrícula', async () => {
  const api = fixture(); api.state.rows = [archivedLesson, { ...lesson, id: 'active-class', name: 'Turma em operação' }]
  start({ path: '/escola/matriculas' })
  await userEvent.click(await screen.findByRole('button', { name: 'Matricular aluno' }))
  const dialog = within(screen.getByRole('dialog', { name: 'Matrícula' }))
  expect(dialog.queryByRole('option', { name: 'Turma de teste' })).not.toBeInTheDocument()
  expect(await dialog.findByRole('option', { name: 'Turma em operação' })).toBeInTheDocument()
})


it('atualiza a reserva vinculada no retorno e preserva outras reservas', async () => {
  const api = fixture()
  const linked: Reservation = { id: 'reservation-test', name: 'Reserva vinculada de teste', courtId: lesson.courtId, date: '2026-11-09', startTime: lesson.startTime, endTime: lesson.endTime, customerName: 'Cliente teste', phone: '', amount: 0, status: 'Confirmada', notes: '', classId: lesson.id }
  api.state.reservations = [linked, { ...linked, id: 'independent-reservation', classId: undefined, name: 'Reserva independente' }]
  api.state.deleteResponse = async () => api.archiveResponse([], [{ ...linked, status: 'Cancelada', version: 2, cancelledByClassDeletion: true }])
  start(); const dialog = await openConfirmation()
  await userEvent.click(dialog.getByRole('button', { name: 'Excluir turma' }))
  await waitFor(() => expect(screen.getByTestId('route')).toHaveTextContent(/^\/escola$/))
  expect(screen.getByTestId('reservation-count')).toHaveTextContent('2')
  await userEvent.click(screen.getByRole('link', { name: 'Ver reserva de teste' }))
  expect(await screen.findByText(/Reserva preservada no histórico/)).toBeVisible()
  expect(screen.getByText('Cancelada')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Editar reserva' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Confirmar chegada' })).not.toBeInTheDocument()
})

it('consulta alunos do cadastro legado sem criar matrículas para eles', async () => {
  const api = fixture(); api.state.rows = [{ ...archivedLesson, studentIds: ['student-test'] }]
  start()
  await userEvent.click(await screen.findByText('Alunos vinculados no cadastro anterior'))
  expect(screen.getByRole('link', { name: 'Aluna teste' })).toHaveAttribute('href', '/alunos/student-test')
  expect(screen.getByText('Nenhuma matrícula registrada nesta turma.')).toBeVisible()
  expect(api.fetch.mock.calls.filter(([, init]) => init?.method && init.method !== 'GET')).toHaveLength(0)
})
