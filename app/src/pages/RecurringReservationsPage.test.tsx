import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../features/auth/authContext'
import { DemoDataProvider } from '../features/operations/DemoDataProvider'
import type { Reservation, RecurringReservationInput, RecurringReservationResponse } from '../features/arena/types'
import { AgendaPage, ReservationDetailsPage } from './ArenaPages'
import { RecurringReservationsPage, recurringDates } from './RecurringReservationsPage'
import { today } from './arenaUi'

const court = { id: '22222222-2222-2222-2222-222222222222', name: 'Quadra 1', sport: 'Futevôlei', status: 'Disponível', openingTime: '07:00', closingTime: '23:00' }
const clients: QueryClient[] = []
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
function RouteState() { const location = useLocation(); return <output data-testid="route">{location.pathname}{location.search}</output> }
function start() {
  const auth: AuthContextValue = { user: { id: '11111111-1111-1111-1111-111111111111', name: 'Admin teste', email: 'teste@example.com', roles: ['Owner'], permissions: [] }, isBootstrapping: false, signIn: async () => {}, signInWithGoogle: async () => {}, signOut: async () => {}, changePassword: async () => {}, completeFirstAccessWithGoogle: async () => {} }
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(query)
  render(<QueryClientProvider client={query}><AuthContext.Provider value={auth}><DemoDataProvider enabled demoMode={false}><MemoryRouter initialEntries={[`/agenda/recorrentes/novo?date=${today()}&court=${court.id}`]}><RouteState /><Routes><Route path="/agenda/recorrentes/novo" element={<RecurringReservationsPage />} /><Route path="/agenda" element={<AgendaPage />} /><Route path="/agenda/:reservationId" element={<ReservationDetailsPage />} /></Routes></MemoryRouter></DemoDataProvider></AuthContext.Provider></QueryClientProvider>)
}
function result(input: RecurringReservationInput): RecurringReservationResponse {
  return { groupId: input.operationId, groupTitle: input.groupTitle, reservations: recurringDates(input.startDate, input.weeks).map((date, index) => ({ id: `33333333-3333-3333-3333-${String(index + 1).padStart(12, '0')}`, name: input.groupTitle, groupId: input.operationId, groupTitle: input.groupTitle, occurrenceIndex: index + 1, courtId: input.courtId, date, startTime: input.startTime, endTime: input.endTime, customerName: input.customerName, phone: input.phone, amount: input.amount, notes: input.notes, status: 'Confirmada' })) }
}
function server(rows: Reservation[], post: (input: RecurringReservationInput) => Promise<Response>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = String(input)
    if (init?.method === 'POST') { expect(path).toBe('/api/v1/operations/reservations/recurring'); return post(JSON.parse(String(init.body))) }
    if (path.includes('/courts/schedule')) return json({ date: today(), updatedAtUtc: new Date().toISOString(), courts: [] })
    return json(path.endsWith('/courts') ? [court] : path.endsWith('/reservations') ? rows : [])
  })
}
async function fill() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Criar reservas semanais' })).toBeEnabled())
  fireEvent.change(screen.getByLabelText('Nome do grupo de reservas'), { target: { value: 'Grupo semanal de teste' } })
  fireEvent.change(screen.getByLabelText('Número de semanas'), { target: { value: '3' } })
}
beforeEach(() => { vi.stubEnv('VITE_DEMO_MODE', 'false'); vi.stubEnv('VITE_OPERATIONAL_STORAGE', 'postgres'); localStorage.clear(); sessionStorage.clear() })
afterEach(() => { clients.splice(0).forEach(client => client.clear()); vi.unstubAllEnvs() })

it('conflito não mostra ocorrências parciais e permite corrigir com nova intenção', async () => {
  const rows: Reservation[] = []; let attempts = 0
  const fetchMock = server(rows, async input => { if (++attempts === 1) return json({ message: 'A segunda semana conflita com uma aula. Nenhuma reserva foi criada.' }, 400); const saved = result(input); rows.push(...saved.reservations); return json(saved, 201) })
  start(); await fill()
  const user = userEvent.setup(); await user.click(screen.getByRole('button', { name: 'Criar reservas semanais' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Nenhuma reserva foi criada')
  expect(rows).toHaveLength(0); expect(screen.getByLabelText('Começa às')).toBeEnabled()
  fireEvent.change(screen.getByLabelText('Começa às'), { target: { value: '20:00' } }); fireEvent.change(screen.getByLabelText('Termina às'), { target: { value: '21:00' } })
  await user.click(screen.getByRole('button', { name: 'Criar reservas semanais' }))
  expect(await screen.findByRole('heading', { name: 'Agenda e recepção' })).toBeInTheDocument()
  expect(rows).toHaveLength(3)
  const bodies = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST').map(([, init]) => JSON.parse(String(init?.body)))
  expect(bodies).toHaveLength(2); expect(bodies[0].operationId).not.toBe(bodies[1].operationId)
  expect(screen.getByTestId('route')).toHaveTextContent(`group=${bodies[1].operationId}`)
})

it('falha incerta e dois cliques repetem um único grupo com o mesmo corpo e preservam os links', async () => {
  const rows: Reservation[] = []; let attempts = 0
  const fetchMock = server(rows, async input => { attempts++; if (attempts === 1) { const saved = result(input); rows.push(...saved.reservations); return json({ message: 'Resposta interrompida.' }, 503) } return json({ groupId: input.operationId, groupTitle: input.groupTitle, reservations: rows }) })
  start(); await fill()
  const form = screen.getByRole('button', { name: 'Criar reservas semanais' }).closest('form')!
  act(() => { fireEvent.submit(form); fireEvent.submit(form) })
  expect(await screen.findByRole('alert')).toHaveTextContent('O resultado ainda não foi confirmado')
  expect(screen.getByLabelText('Nome do grupo de reservas')).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Repetir confirmação do grupo' }))
  expect(await screen.findByRole('heading', { name: 'Agenda e recepção' })).toBeInTheDocument()
  const bodies = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST').map(([, init]) => JSON.parse(String(init?.body)))
  expect(bodies).toHaveLength(2); expect(bodies[0]).toEqual(bodies[1]); expect(rows).toHaveLength(3)
  const user = userEvent.setup(); await user.click(screen.getAllByRole('link', { name: /Grupo semanal de teste.*ocorrência 1/ })[0])
  expect(await screen.findByRole('heading', { name: 'Grupo semanal · Grupo semanal de teste' })).toBeInTheDocument()
  expect(screen.getAllByRole('link', { name: /ocorrência [123].*Confirmada/ })).toHaveLength(3)
  expect(screen.getByRole('link', { name: 'Ver todas as ocorrências na agenda →' })).toHaveAttribute('href', expect.stringContaining(`group=${bodies[0].operationId}`))
  expect(screen.getByRole('link', { name: '← Agenda' })).toHaveAttribute('href', expect.stringContaining('view=list'))
  expect(localStorage.getItem('longbeach-os-demo-v1')).toBeNull(); expect(sessionStorage.length).toBe(0)
})

it('expansão mantém datas semanais e recusa quantidades fora do limite', () => {
  expect(recurringDates('2026-12-28', 3)).toEqual(['2026-12-28', '2027-01-04', '2027-01-11'])
  expect(recurringDates('2026-02-30', 3)).toEqual([])
  expect(recurringDates('2026-10-04', 13)).toEqual([])
})
