import React from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthContext } from '../auth/authContext'
import type { AuthUser } from '../auth/types'
import type { RecurringReservationInput, RecurringReservationResponse, Reservation } from '../arena/types'
import { DemoDataProvider, useOperations, type Student } from './DemoDataProvider'

const user: AuthUser = { id: 'first-user', name: 'Gestora', email: 'test@longbeach.test', roles: ['Owner'], permissions: [] }
const student: Student = { id: '00000000-0000-4000-8000-000000000001', name: 'Registro da API', phone: '', birthDate: '', address: '', shirtSize: '', shortsSize: '', weeklyClasses: '', days: '', class1: '', class2: '', monthlyAmount: 0, paymentStatus: '', paymentDate: '', statementName: '', status: 'Ativo', notes: '' }
const recurring: RecurringReservationInput = { operationId: '00000000-0000-4000-8000-000000000020', groupTitle: 'Grupo semanal', courtId: '00000000-0000-4000-8000-000000000021', startDate: '2026-10-04', startTime: '18:00', endTime: '19:00', weeks: 2, customerName: '', phone: '', amount: 80, notes: '' }
const recurringRows: Reservation[] = [0,1].map(index => ({ id: `00000000-0000-4000-8000-00000000003${index}`, version: 1, name: recurring.groupTitle, courtId: recurring.courtId, date: index ? '2026-10-11' : recurring.startDate, startTime: recurring.startTime, endTime: recurring.endTime, customerName: '', phone: '', amount: recurring.amount, status: 'Confirmada', notes: '', groupId: recurring.operationId, groupTitle: recurring.groupTitle, occurrenceIndex: index + 1 }))
const group: RecurringReservationResponse = { groupId: recurring.operationId, groupTitle: recurring.groupTitle, reservations: recurringRows }
function response(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }) }
function Consumer() {
  const operations = useOperations()
  const [error, setError] = React.useState('')
  return <><p>{operations.persistenceStatus}</p><p data-testid="names">{operations.students.map(row => row.name).join(',')}</p><p data-testid="reservation-count">{operations.reservations.length}</p><p data-testid="updated-at">{operations.dataUpdatedAt}</p><p data-testid="refresh-failed">{operations.refreshFailed ? 'yes' : 'no'}</p><p>{error}</p><button onClick={() => void operations.saveStudent({ ...student, name: 'Alteração confirmada' }, student.id).catch(e => setError(e.message))}>Salvar</button><button onClick={() => void operations.saveStudent({ ...student, name: 'Novo registro' }).catch(e => setError(e.message))}>Criar</button><button onClick={() => void operations.saveRecurringReservations(recurring).catch(e => setError(`${e.status ?? ''}: ${e.message}`))}>Reservar grupo</button><p>{operations.persistenceMessage}</p></>
}
function tree(identity: AuthUser | null = user, demoMode = false) {
  return <AuthContext.Provider value={{ user: identity, isBootstrapping: false, signIn: async () => {}, signInWithGoogle: async () => {}, signOut: async () => {}, changePassword: async () => {} }}><DemoDataProvider enabled demoMode={demoMode}><Consumer /></DemoDataProvider></AuthContext.Provider>
}
beforeEach(() => { localStorage.clear(); vi.stubEnv('VITE_OPERATIONAL_STORAGE', 'local') })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers() })
it('production reads only the authenticated API and never imports browser demo records', async () => {
  localStorage.setItem('longbeach-os-demo-v1', JSON.stringify({ students: [{ ...student, name: 'Cadastro local de outra pessoa' }] }))
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => response(String(input).endsWith('/students') ? [student] : []))
  render(tree())
  expect(await screen.findByText('connected')).toBeInTheDocument()
  expect(screen.getByTestId('names')).toHaveTextContent('Registro da API')
  expect(screen.getByTestId('names')).not.toHaveTextContent('Cadastro local')
  expect(fetch.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true)
  expect(localStorage.getItem('longbeach-os-demo-v1')).toContain('Cadastro local')
})
it('does not claim a failed write changed the saved record', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => init?.method === 'PUT' ? response({ message: 'Falha temporária' }, 503) : response(String(input).endsWith('/students') ? [student] : []))
  render(tree()); await screen.findByText('connected')
  await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
  await waitFor(() => expect(screen.getAllByText('Falha temporária').length).toBeGreaterThan(0))
  expect(screen.getByTestId('names')).toHaveTextContent('Registro da API')
  expect(screen.getByTestId('names')).not.toHaveTextContent('Alteração confirmada')
})
it('publishes an edit only after the server acknowledges it', async () => {
  let finish: ((value: Response) => void) | undefined
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => init?.method === 'PUT' ? new Promise<Response>(resolve => { finish = resolve }) : response(String(input).endsWith('/students') ? [student] : []))
  render(tree()); await screen.findByText('connected')
  await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
  expect(screen.getByTestId('names')).toHaveTextContent('Registro da API')
  finish?.(response({ ...student, name: 'Alteração confirmada', version: 1 }))
  await waitFor(() => expect(screen.getByTestId('names')).toHaveTextContent('Alteração confirmada'))
})
it('does not load unauthorized kinds or write without the matching permission', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response([]))
  render(tree({ ...user, roles: ['BarOperator'], permissions: ['bar:catalog:read'] }))
  await screen.findByText('connected')
  expect(fetch).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
  await screen.findByText('Você não tem permissão para alterar este cadastro.')
  expect(fetch).not.toHaveBeenCalled()
})
it('clears private data after sign out', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => response(String(input).endsWith('/students') ? [student] : []))
  const rendered = render(tree()); await screen.findByText('connected')
  expect(screen.getByTestId('names')).toHaveTextContent('Registro da API')
  rendered.rerender(tree(null))
  await waitFor(() => expect(screen.getByTestId('names')).toHaveTextContent(''))
  expect(screen.getByTestId('names')).not.toHaveTextContent('Registro da API')
})

it('ignores a previous session response even when the same user signs in again', async () => {
  let finish: ((value: Response) => void) | undefined
  let studentLoads = 0
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    if (!String(input).endsWith('/students')) return response([])
    studentLoads += 1
    return studentLoads === 1 ? new Promise<Response>(resolve => { finish = resolve }) : response([{ ...student, name: 'Sessão atual' }])
  })
  const rendered = render(tree()); await waitFor(() => expect(studentLoads).toBe(1))
  rendered.rerender(tree(null)); await waitFor(() => expect(screen.getByTestId('names')).toHaveTextContent(''))
  rendered.rerender(tree()); await screen.findByText('connected')
  await act(async () => { finish?.(response([{ ...student, name: 'Resposta antiga' }])); await Promise.resolve() })
  expect(screen.getByTestId('names')).toHaveTextContent('Sessão atual')
  expect(screen.getByTestId('names')).not.toHaveTextContent('Resposta antiga')
})
it('retries an unconfirmed new registration with the same identifier', async () => {
  const ids: string[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (init?.method !== 'PUT') return response([])
    ids.push(String(input).split('/').pop() ?? '')
    return ids.length === 1 ? response({ message: 'Conexão interrompida' }, 503) : response(JSON.parse(String(init.body)))
  })
  render(tree()); await screen.findByText('connected')
  await userEvent.click(screen.getByRole('button', { name: 'Criar' }))
  await waitFor(() => expect(screen.getAllByText('Conexão interrompida').length).toBeGreaterThan(0))
  await userEvent.click(screen.getByRole('button', { name: 'Criar' }))
  await waitFor(() => expect(screen.getByTestId('names')).toHaveTextContent('Novo registro'))
  expect(ids).toHaveLength(2); expect(ids[0]).toBe(ids[1])
})
it('prevents double taps while an existing record is being saved', async () => {
  let finish: ((value: Response) => void) | undefined
  let writes = 0
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (init?.method !== 'PUT') return response(String(input).endsWith('/students') ? [student] : [])
    writes += 1; return new Promise<Response>(resolve => { finish = resolve })
  })
  render(tree()); await screen.findByText('connected')
  await userEvent.dblClick(screen.getByRole('button', { name: 'Salvar' }))
  expect(writes).toBe(1)
  await act(async () => { finish?.(response({ ...student, name: 'Alteração confirmada' })); await Promise.resolve() })
  await waitFor(() => expect(screen.getByTestId('names')).toHaveTextContent('Alteração confirmada'))
})
it('does not restore private records from a pending write after permissions change', async () => {
  let finish: ((value: Response) => void) | undefined
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => init?.method === 'PUT' ? new Promise<Response>(resolve => { finish = resolve }) : response(String(input).endsWith('/students') ? [student] : []))
  const rendered = render(tree()); await screen.findByText('connected')
  await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
  rendered.rerender(tree({ ...user, roles: ['BarOperator'], permissions: ['bar:catalog:read'] }))
  await waitFor(() => expect(screen.getByTestId('names')).not.toHaveTextContent('Registro da API'))
  await act(async () => { finish?.(response({ ...student, name: 'Alteração confirmada' })); await Promise.resolve() })
  expect(screen.getByTestId('names')).not.toHaveTextContent('Alteração confirmada')
})
it('does not publish a partial recurring schedule when the API rejects a later week', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_, init) => init?.method === 'POST' ? response({ message: 'Nenhuma reserva foi criada. Semana 2 ocupada.' },400) : response([]))
  render(tree()); await screen.findByText('connected')
  await userEvent.click(screen.getByRole('button', { name: 'Reservar grupo' }))
  await screen.findByText('400: Nenhuma reserva foi criada. Semana 2 ocupada.')
  expect(screen.getByTestId('reservation-count')).toHaveTextContent('0')
})
it('repeats an unconfirmed recurring request unchanged and merges acknowledged occurrences once', async () => {
  const bodies: string[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_, init) => {
    if (init?.method !== 'POST') return response([])
    bodies.push(String(init.body)); return bodies.length === 1 ? response({ message: 'Confirmação interrompida' },502) : response(group)
  })
  render(tree()); await screen.findByText('connected')
  await userEvent.click(screen.getByRole('button', { name: 'Reservar grupo' }))
  await screen.findByText('502: Confirmação interrompida')
  expect(screen.getByTestId('reservation-count')).toHaveTextContent('0')
  await userEvent.click(screen.getByRole('button', { name: 'Reservar grupo' }))
  await waitFor(() => expect(screen.getByTestId('reservation-count')).toHaveTextContent('2'))
  await userEvent.click(screen.getByRole('button', { name: 'Reservar grupo' }))
  await waitFor(() => expect(bodies).toHaveLength(3))
  expect(bodies[0]).toBe(bodies[1]); expect(bodies[1]).toBe(bodies[2]); expect(screen.getByTestId('reservation-count')).toHaveTextContent('2')
})

it('refreshes reservations from another operator when the window regains focus', async () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  let reservations: Reservation[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => response(String(input).endsWith('/reservations') ? reservations : []))
  render(tree()); await screen.findByText('connected')
  expect(screen.getByTestId('reservation-count')).toHaveTextContent('0')
  reservations = recurringRows
  await act(async () => { window.dispatchEvent(new Event('focus')) })
  await waitFor(() => expect(screen.getByTestId('reservation-count')).toHaveTextContent('2'))
})

it('keeps the complete-read timestamp when one registration or recurring group is saved', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-05T12:00:00Z'))
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (init?.method === 'PUT') return response(JSON.parse(String(init.body)))
    if (init?.method === 'POST') return response(group)
    return response(String(input).endsWith('/students') ? [student] : [])
  })
  render(tree()); await screen.findByText('connected')
  expect(screen.getByTestId('updated-at')).toHaveTextContent('2026-10-05T12:00:00.000Z')
  vi.setSystemTime(new Date('2026-10-05T12:01:00Z'))
  await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
  await waitFor(() => expect(screen.getByTestId('names')).toHaveTextContent('Alteração confirmada'))
  await userEvent.click(screen.getByRole('button', { name: 'Reservar grupo' }))
  await waitFor(() => expect(screen.getByTestId('reservation-count')).toHaveTextContent('2'))
  expect(screen.getByTestId('updated-at')).toHaveTextContent('2026-10-05T12:00:00.000Z')
})

it('allows saving during background refresh and discards the older read after a mutation', async () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  let finishRead: ((value: Response) => void) | undefined
  let studentLoads = 0
  let savedStudent = student
  let reservations: Reservation[] = []
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (init?.method === 'PUT') { savedStudent = { ...student, name: 'Alteração confirmada', version: 2 }; return response(savedStudent) }
    if (String(input).endsWith('/reservations')) return response(reservations)
    if (!String(input).endsWith('/students')) return response([])
    studentLoads += 1
    return studentLoads === 2 ? new Promise<Response>(resolve => { finishRead = resolve }) : response([savedStudent])
  })
  render(tree()); await screen.findByText('connected')
  const readTimestamp = screen.getByTestId('updated-at').textContent
  await act(async () => { window.dispatchEvent(new Event('focus')) })
  await waitFor(() => expect(studentLoads).toBe(2))
  expect(screen.getByText('connected')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
  await waitFor(() => expect(screen.getByTestId('names')).toHaveTextContent('Alteração confirmada'))
  expect(screen.getByTestId('updated-at').textContent).toBe(readTimestamp)
  reservations = recurringRows
  await act(async () => { window.dispatchEvent(new Event('focus')) })
  await waitFor(() => expect(screen.getByTestId('reservation-count')).toHaveTextContent('2'))
  const refreshedTimestamp = screen.getByTestId('updated-at').textContent
  await act(async () => { finishRead?.(response([{ ...student, name: 'Leitura anterior à alteração', version: 1 }])) })
  expect(fetch.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1)
  expect(screen.getByTestId('names')).toHaveTextContent('Alteração confirmada')
  expect(screen.getByTestId('reservation-count')).toHaveTextContent('2')
  expect(screen.getByTestId('updated-at').textContent).toBe(refreshedTimestamp)
})

it('does not start an automatic read while a write is awaiting confirmation', async () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  let finishWrite: ((value: Response) => void) | undefined
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => init?.method === 'PUT' ? new Promise<Response>(resolve => { finishWrite = resolve }) : response(String(input).endsWith('/students') ? [student] : []))
  render(tree()); await screen.findByText('connected')
  await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
  const callsBeforeRefresh = fetch.mock.calls.length
  await act(async () => {
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('online'))
    document.dispatchEvent(new Event('visibilitychange'))
  })
  expect(fetch).toHaveBeenCalledTimes(callsBeforeRefresh)
  await act(async () => { finishWrite?.(response({ ...student, name: 'Alteração confirmada' })) })
  await waitFor(() => expect(screen.getByTestId('names')).toHaveTextContent('Alteração confirmada'))
})

it('polls only while visible and immediately refreshes after becoming visible', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  let reservations: Reservation[] = []
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => response(String(input).endsWith('/reservations') ? reservations : []))
  render(tree()); await screen.findByText('connected')
  fetch.mockClear()
  visibility.mockReturnValue('hidden'); reservations = recurringRows
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
  expect(fetch).not.toHaveBeenCalled()
  visibility.mockReturnValue('visible')
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
  await waitFor(() => expect(screen.getByTestId('reservation-count')).toHaveTextContent('2'))
  fetch.mockClear(); reservations = []
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
  await waitFor(() => expect(screen.getByTestId('reservation-count')).toHaveTextContent('0'))
  expect(fetch).toHaveBeenCalled()
})

it('preserves every module and the timestamp if any part of a background read fails', async () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-05T12:00:00Z'))
  let failRefresh = false
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    if (String(input).endsWith('/reservations')) return failRefresh ? response({ message: 'Agenda indisponível' }, 503) : response(recurringRows)
    if (String(input).endsWith('/students')) return response([{ ...student, name: failRefresh ? 'Leitura parcial' : student.name }])
    return response([])
  })
  render(tree()); await screen.findByText('connected')
  const readTimestamp = screen.getByTestId('updated-at').textContent
  failRefresh = true
  await act(async () => { window.dispatchEvent(new Event('online')) })
  await screen.findByText('Não foi possível atualizar os registros. A última leitura foi preservada; confira a conexão e tente novamente.')
  expect(screen.getByTestId('names')).toHaveTextContent('Registro da API')
  expect(screen.getByTestId('names')).not.toHaveTextContent('Leitura parcial')
  expect(screen.getByTestId('reservation-count')).toHaveTextContent('2')
  expect(screen.getByTestId('updated-at').textContent).toBe(readTimestamp)
  expect(screen.getByText('connected')).toBeInTheDocument()
  expect(screen.getByTestId('refresh-failed')).toHaveTextContent('yes')
  failRefresh = false
  vi.setSystemTime(new Date('2026-10-05T12:02:00Z'))
  await act(async () => { window.dispatchEvent(new Event('online')) })
  await waitFor(() => expect(screen.getByTestId('refresh-failed')).toHaveTextContent('no'))
  expect(screen.getByTestId('updated-at')).toHaveTextContent('2026-10-05T12:02:00.000Z')
  expect(screen.getByText('connected')).toBeInTheDocument()
})
