import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../features/auth/authContext'
import type { AuthUser } from '../features/auth/types'
import type { ArenaClass } from '../features/arena/types'
import { DemoDataProvider, useOperations } from '../features/operations/DemoDataProvider'
import { ClassDetailsPage, SchoolPage } from './ArenaPages'
import { SchoolAgendaPage } from './SchoolAgendaPage'

const day = '2026-11-02'
const lesson: ArenaClass = { id: '00000000-0000-4000-8000-000000000091', version: 7, name: 'Turma de teste', sport: 'Futevôlei', courtId: 'court-test', teacherId: 'teacher-test', weekDay: 1, startTime: '18:00', endTime: '19:00', capacity: 8, studentIds: [], status: 'Ativa', notes: '' }
const manager: AuthUser = { id: 'manager-test', name: 'Gestor de teste', email: 'manager@example.invalid', roles: ['Manager'], permissions: [] }
const clients: QueryClient[] = []
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
function fixture() {
  const state = { rows: [{ ...lesson }], failReads: false, deleteResponse: () => Promise.resolve(new Response(null, { status: 204 })) }
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'https://test.invalid')
    if (init?.method === 'DELETE') {
      const response = await state.deleteResponse()
      if (response.status === 204) state.rows = []
      return response
    }
    if (state.failReads) return json({ message: 'Consulta indisponível' }, 503)
    if (url.pathname.endsWith('/classes')) return json(state.rows)
    if (url.pathname.endsWith('/courts')) return json([{ id: lesson.courtId, name: 'Quadra de teste', sport: 'Futevôlei', status: 'Disponível', openingTime: '07:00', closingTime: '23:00', scheduleConfirmed: true }])
    if (url.pathname.endsWith('/team')) return json([{ id: lesson.teacherId, name: 'Professor de teste', status: 'Ativo' }])
    if (url.pathname.endsWith('/schedule-range')) {
      const from = url.searchParams.get('from')!, to = url.searchParams.get('to')!
      const dates = Array.from({ length: (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1 }, (_, i) => new Date(Date.parse(from) + i * 86_400_000).toISOString().slice(0, 10))
      return json({ from, to, updatedAtUtc: '2026-11-02T10:00:00Z', days: dates.map(date => ({ date, courts: [{ courtId: lesson.courtId, openingTime: '07:00', closingTime: '23:00', availableMinutes: 900, reservedMinutes: 0, classMinutes: state.rows.length * 60, closedForMaintenance: false, hasConflict: false, blocks: date === day ? state.rows.map(row => ({ source: 'Aula', sourceId: row.id, startTime: row.startTime, endTime: row.endTime })) : [] }] })) })
    }
    return json([])
  })
  return { state, fetch, deletes: () => fetch.mock.calls.filter(([, init]) => init?.method === 'DELETE') }
}
function Probe() {
  const location = useLocation(), operations = useOperations()
  const [error, setError] = useState('')
  return <><span data-testid="route">{location.pathname}{location.search}</span><span data-testid="class-count">{operations.classes.length}</span><span data-testid="revision">{operations.scheduleRevision}</span><button onClick={() => void operations.reload()}>Atualizar teste</button><button onClick={() => void operations.deleteClass(lesson.id, 7).catch(cause => setError(cause.message))}>Testar chamada direta</button><span>{error}</span></>
}
function start(options: { user?: AuthUser | null; demoMode?: boolean; returnTo?: string; path?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); clients.push(client)
  const identity = options.user === undefined ? manager : options.user
  const initial = new URL(options.path ?? `/escola/turmas/${lesson.id}`, 'https://test.invalid')
  const auth: AuthContextValue = { user: identity, isBootstrapping: false, signIn: async () => {}, signInWithGoogle: async () => {}, signOut: async () => {}, changePassword: async () => {}, completeFirstAccessWithGoogle: async () => {} }
  const tree = (user: AuthUser | null) => <QueryClientProvider client={client}><AuthContext.Provider value={{ ...auth, user }}><DemoDataProvider enabled demoMode={options.demoMode}><MemoryRouter initialEntries={[{ pathname: initial.pathname, search: initial.search, state: options.returnTo ? { returnTo: options.returnTo, returnState: { retained: true } } : null }]}><Probe /><Routes>
    <Route path="/escola" element={<SchoolPage />} />
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
  expect(dialog.getByText(/não pode ser desfeita/)).toBeVisible()
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

it('mantém a turma até confirmar, bloqueia toques repetidos e atualiza a lista após204', async () => {
  const api = fixture(); let finish: (response: Response) => void = () => {}
  api.state.deleteResponse = () => new Promise(resolve => { finish = resolve })
  start(); const dialog = await openConfirmation()
  await userEvent.dblClick(dialog.getByRole('button', { name: 'Excluir definitivamente' }))
  expect(api.deletes()).toHaveLength(1)
  expect(api.deletes()[0][0]).toBe(`/api/v1/operations/classes/${lesson.id}?version=7`)
  expect(screen.getByTestId('class-count')).toHaveTextContent('1')
  expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
  expect(dialog.getByRole('button', { name: 'Excluindo…' })).toBeDisabled()
  await userEvent.click(dialog.getByRole('button', { name: 'Fechar Excluir turma?' }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  await act(async () => { finish(new Response(null, { status: 204 })); await Promise.resolve() })
  await waitFor(() => expect(screen.getByTestId('route')).toHaveTextContent(/^\/escola$/))
  expect(screen.getByTestId('class-count')).toHaveTextContent('0')
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
  await userEvent.click(dialog.getByRole('button', { name: 'Excluir definitivamente' }))
  await waitFor(() => expect(screen.getByTestId('route')).toHaveTextContent('/escola/agenda'))
  expect(await screen.findByRole('status')).toHaveTextContent('Turma excluída.')
  await waitFor(() => expect(api.fetch.mock.calls.filter(([input]) => String(input).includes('/schedule-range')).length).toBeGreaterThan(1))
  expect(screen.queryByRole('button', { name: /Aula · 18:00–19:00 · Turma de teste/ })).not.toBeInTheDocument()
})

it.each([409, 404, 503])('exibe a recusa%d e preserva a turma e a agenda locais', async status => {
  const api = fixture(); const message = status === 409 ? 'Esta turma possui alunos ou histórico vinculado. Encerre a turma para preservar os registros.' : 'Não foi possível excluir a turma.'
  api.state.deleteResponse = async () => json({ message }, status)
  start(); const dialog = await openConfirmation()
  await userEvent.click(dialog.getByRole('button', { name: 'Excluir definitivamente' }))
  expect(await dialog.findByRole('alert')).toHaveTextContent(message)
  expect(screen.getByTestId('class-count')).toHaveTextContent('1')
  expect(screen.getByTestId('revision')).toHaveTextContent('0')
  expect(screen.getByTestId('route')).toHaveTextContent(`/escola/turmas/${lesson.id}`)
})

it('envia a versão vista na confirmação mesmo após uma atualização em segundo plano', async () => {
  const api = fixture(); start(); const dialog = await openConfirmation()
  api.state.rows = [{ ...lesson, version: 8 }]
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar teste' }))
  await waitFor(() => expect(api.fetch.mock.calls.filter(([input]) => String(input).endsWith('/classes'))).toHaveLength(2))
  await userEvent.click(dialog.getByRole('button', { name: 'Excluir definitivamente' }))
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
  await userEvent.click(dialog.getByRole('button', { name: 'Excluir definitivamente' }))
  app.changeUser({ ...manager, roles: ['Operations'], permissions: ['students:read', 'students:write'] })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await act(async () => { finish(new Response(null, { status: 204 })); await Promise.resolve() })
  expect(screen.getByTestId('route')).toHaveTextContent(`/escola/turmas/${lesson.id}`)
  expect(screen.queryByText('Turma excluída.')).not.toBeInTheDocument()
})

it.each(['https://external.invalid', '/escola/turmas/outra', '/financeiro'])('descarta retorno inadequado %s e retorna às turmas', async returnTo => {
  fixture(); start({ returnTo }); const dialog = await openConfirmation()
  await userEvent.click(dialog.getByRole('button', { name: 'Excluir definitivamente' }))
  await waitFor(() => expect(screen.getByTestId('route')).toHaveTextContent(/^\/escola$/))
  expect(screen.getByRole('status')).toHaveTextContent('Turma excluída.')
})
