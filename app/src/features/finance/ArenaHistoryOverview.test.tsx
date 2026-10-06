import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { ArenaHistoryOverview } from './ArenaHistoryOverview'

const auth = vi.hoisted(() => ({ roles: ['Owner'] }))
vi.mock('../auth/authContext', () => ({ useAuth: () => ({ user: { id: 'owner-test', roles: auth.roles } }) }))
const payments = { month: '2026-09', records: 3, paidRecords: 2, paidNames: 2, paidAmountCents: 26000, unpaidRecords: 1, otherRecords: 0 }
const result = { months: ['2026-09', '2026-03'], students: payments, rentals: { payments: { ...payments, paidAmountCents: 72000 }, scheduleRecords: 3, weeklyMinutes: 360, invalidSchedules: 0, schedule: [{ day: 'Terça-feira', hours: '20:00 até 22:00', records: 1, paidRecords: 0, unpaidRecords: 1 }] }, lessons: { month: '2026-03', records: 5, lessons: 4, cancelledRecords: 1, otherRecords: 0, minutes: 240, invalidHours: 0, attendances: 15, missingAttendance: 0, averageAttendance: 3.8, lastDate: '2026-03-28' } }
function wrap() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><ArenaHistoryOverview /></MemoryRouter></QueryClientProvider>) }
afterEach(() => { vi.restoreAllMocks(); auth.roles = ['Owner'] })

it('mostra referências diferentes, valores pagos, horas semanais e origem de cada controle', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } }))
  wrap()
  expect(await screen.findByText('R$ 260,00')).toBeInTheDocument()
  expect(screen.getByText('R$ 720,00')).toBeInTheDocument()
  const lessons = screen.getByText('Aulas registradas').closest('a')!
  expect(within(lessons).getByText('março de 2026')).toBeInTheDocument()
  expect(lessons).toHaveAttribute('href', '/financeiro/historico?month=2026-03&series=aulas')
  expect(screen.getByText('6 h/semana')).toBeInTheDocument()
  expect(screen.getByText('Média de 3,8 alunos por aula registrada')).toBeInTheDocument()
  await userEvent.click(screen.getByText(/Ver horários dos mensalistas/))
  expect(screen.getByRole('cell', { name: '20:00 até 22:00' })).toBeVisible()
})
it('filtra o mês sem reaproveitar aulas antigas nem transformar ausência em zero', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => new Response(JSON.stringify(String(input).includes('?month=') ? { ...result, lessons: null } : result), { headers: { 'Content-Type': 'application/json' } }))
  wrap(); await screen.findByText('R$ 260,00')
  await userEvent.selectOptions(screen.getByLabelText('Mês dos controles'), '2026-09')
  await waitFor(() => expect(screen.getAllByText('Sem registros no período')).toHaveLength(2))
  expect(fetch.mock.calls.some(([url]) => String(url).includes('/arena-summary?month=2026-09'))).toBe(true)
  expect(screen.queryByText('março de 2026', { selector: 'small' })).not.toBeInTheDocument()
})
it('resposta vazia não inventa receitas, contagens ou horários', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ months: [], students: null, rentals: null, lessons: null }), { headers: { 'Content-Type': 'application/json' } }))
  wrap(); expect(await screen.findAllByText('Sem dados completos')).toHaveLength(5)
  expect(screen.queryByText('R$ 0,00')).not.toBeInTheDocument()
})
it('erro de API é visível e permite tentar novamente', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 503 }))
  wrap(); expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível atualizar')
  expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument()
  expect(screen.queryByText('R$ 0,00')).not.toBeInTheDocument()
})
it('somente proprietário consulta os indicadores financeiros', () => {
  auth.roles = ['Operations']; const fetch = vi.spyOn(globalThis, 'fetch')
  wrap(); expect(fetch).not.toHaveBeenCalled(); expect(screen.queryByText('Escola e aluguel de quadras')).not.toBeInTheDocument()
})
