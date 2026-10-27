import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { ExpensePaidMetric } from './ExpensePaidMetric'

const actor = vi.hoisted(() => ({ id: 'finance-test', roles: ['Owner'], permissions: ['finance:read'] }))
vi.mock('../auth/authContext', () => ({ useAuth: () => ({ user: actor }) }))
const clients: QueryClient[] = []
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
function mount(from = '2026-10-01', to = '2026-10-21') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client)
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>
  return { ...render(<ExpensePaidMetric from={from} to={to} />, { wrapper }), client }
}
afterEach(() => { clients.splice(0).forEach(client => client.clear()); actor.id = 'finance-test'; actor.roles = ['Owner']; actor.permissions = ['finance:read']; vi.restoreAllMocks() })

it('consulta pagamentos efetivos do período e não infere o valor original da despesa', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ amount: 200, records: 1 }))
  mount()
  expect(await screen.findByText('R$ 200,00')).toBeInTheDocument()
  expect(screen.getByText('1 pagamento efetivo no período')).toBeInTheDocument()
  expect(String(fetch.mock.calls[0][0])).toBe('/api/v1/expenses/paid-summary?from=2026-10-01&to=2026-10-21')
  expect(screen.getByRole('link', { name: /Conferir despesas/ })).toHaveAttribute('href', '/financeiro/despesas')
})

it('separa períodos na consulta e na cache, mostrando zero quando não há pagamento registrado', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => response(String(input).includes('from=2026-09') ? { amount: 0, records: 0 } : { amount: 350.5, records: 2 }))
  const view = mount(); await screen.findByText('R$ 350,50')
  view.rerender(<ExpensePaidMetric from="2026-09-01" to="2026-09-30" />)
  expect(await screen.findByText('R$ 0,00')).toBeInTheDocument(); expect(screen.getByText('Nenhum pagamento registrado no período.')).toBeInTheDocument()
  expect(screen.queryByText('R$ 350,50')).not.toBeInTheDocument()
  expect(fetch).toHaveBeenCalledTimes(2)
})

it('oculta valor anterior em falha de atualização e permite repetir a consulta', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ amount: 175, records: 2 }))
  const view = mount(); await screen.findByText('R$ 175,00')
  fetch.mockResolvedValue(response({ message: 'Falha de teste' }, 503))
  await act(async () => { await view.client.invalidateQueries({ queryKey: ['expenses'] }) })
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível consultar as despesas pagas neste período.')
  expect(screen.getByText('Falha na atualização')).toBeInTheDocument(); expect(screen.queryByText('R$ 175,00')).not.toBeInTheDocument()
  fetch.mockResolvedValue(response({ amount: 225, records: 3 }))
  await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  expect(await screen.findByText('R$ 225,00')).toBeInTheDocument(); expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('não consulta sem permissão ou com período inválido e reconsulta ao trocar de usuário', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ amount: 10, records: 1 }))
  actor.roles = ['Operations']; actor.permissions = []; const view = mount()
  expect(fetch).not.toHaveBeenCalled(); expect(screen.queryByText('Despesas pagas')).not.toBeInTheDocument()
  actor.permissions = ['finance:read']; view.rerender(<ExpensePaidMetric from="2026-10-21" to="2026-10-01" />)
  expect(fetch).not.toHaveBeenCalled()
  view.rerender(<ExpensePaidMetric from="2026-10-01" to="2026-10-21" />)
  await screen.findByText('R$ 10,00'); actor.id = 'second-finance-test'; fetch.mockResolvedValue(response({ amount: 20, records: 1 }))
  view.rerender(<ExpensePaidMetric from="2026-10-01" to="2026-10-21" />)
  await screen.findByText('R$ 20,00'); expect(fetch).toHaveBeenCalledTimes(2)
})

it('trata resposta incompleta como falha, sem exibir dinheiro presumido', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ amount: 20 }))
  mount(); expect(await screen.findByRole('alert')).toBeInTheDocument()
  await waitFor(() => expect(screen.queryByText('R$ 20,00')).not.toBeInTheDocument())
})
