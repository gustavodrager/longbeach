import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { StockValuation, type StockValue, type StockValueRow } from './StockValuation'

const auth = vi.hoisted(() => ({ permissions: ['bar:finance:read'] }))
vi.mock('../auth/authContext', () => ({ useAuth: () => ({ user: { id: 'owner-test', permissions: auth.permissions } }) }))
const row: StockValueRow = { productId: 'drink', name: 'Bebida teste', unit: 'un', quantity: 10, reserved: 2, available: 8, unitCost: 6, costStatus: 'registered', salePrice: 15, saleStatus: 'direct', stockCost: 60, salePotential: 120, grossProfit: 72 }
const response: StockValue = { locationId: 'bar', locationName: 'Bar', updatedAtUtc: '2026-10-06T18:00:00Z', stockCost: 60, salePotential: 140, comparableSalePotential: 120, comparableCost: 48, grossProfit: 72, grossMarginPercent: 60, missingCostProducts: 1, incompleteCostProducts: 0, saleProducts: 2, excludedSaleProducts: 0, rows: [row, { ...row, productId: 'missing', name: 'Sem custo', quantity: 4, reserved: 0, available: 4, unitCost: null, costStatus: 'missing', salePrice: 5, stockCost: null, salePotential: 20, grossProfit: null }] }
const clients: QueryClient[] = []
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
function mount(compact = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client)
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/bar/indicadores?estoque=detalhes&de=2026-09-01']}><StockValuation compact={compact} /></MemoryRouter></QueryClientProvider>)
  return client
}
afterEach(() => { clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks(); auth.permissions = ['bar:finance:read'] })

it('separa custo físico, venda disponível e lucro parcial com composição e filtro de lacunas', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(response)); mount()
  expect(await screen.findByText('R$ 140,00')).toBeInTheDocument()
  expect(screen.getByText('60%')).toBeInTheDocument()
  expect(screen.getByText(/1 produto sem custo informado/)).toBeInTheDocument()
  const table = screen.getByRole('table', { name: 'Valor do estoque por produto' })
  expect(within(table).getByText('Aguardando custo')).toBeInTheDocument()
  expect(within(table).getByText('2 un reservados')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Conferência de custos'), { target: { value: 'custos' } })
  expect(within(table).queryByText('Bebida teste')).not.toBeInTheDocument()
  expect(within(table).getByText('Sem custo')).toBeInTheDocument()
  expect(fetch.mock.calls.every(([url]) => String(url).endsWith('/stock/valuation'))).toBe(true)
  expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
})

it('não apresenta falta de custo como lucro zero nem consulta custos sem permissão financeira', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ...response, grossProfit: null, grossMarginPercent: null, comparableCost: 0, comparableSalePotential: 0 })); mount()
  expect(await screen.findByText('Aguardando custos')).toBeInTheDocument()
  expect(screen.getByText('Não calculável')).toBeInTheDocument()
})

it('equipe sem permissão não carrega os valores de estoque', () => {
  auth.permissions = ['bar:stock:read']; const fetch = vi.spyOn(globalThis, 'fetch'); mount()
  expect(fetch).not.toHaveBeenCalled(); expect(screen.queryByText('Valor do estoque')).not.toBeInTheDocument()
})

it('mostra estoque vazio sem simular projeção financeira', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ...response, rows: [] })); mount()
  expect(await screen.findByText(/O Bar ainda não tem saldo físico/)).toBeInTheDocument()
  expect(screen.queryByText('Potencial de venda')).not.toBeInTheDocument()
})

it('preserva valores anteriores com aviso de falha e remove valores ao perder permissão', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(response)); const client = mount(true)
  await screen.findByText('R$ 140,00')
  fetch.mockResolvedValue(json({ message: 'Falha temporária' }, 503))
  await act(async () => { await client.refetchQueries() })
  expect(await screen.findByRole('alert')).toHaveTextContent('última consulta')
  expect(screen.getByText('R$ 140,00')).toBeInTheDocument()
  fetch.mockResolvedValue(json({ message: 'Sem permissão' }, 403))
  await act(async () => { await client.refetchQueries() })
  await waitFor(() => expect(screen.queryByText('R$ 140,00')).not.toBeInTheDocument())
})

it('pagina a composição e mantém o sinal de prejuízo', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ...response, grossProfit: -20, grossMarginPercent: -10, rows: Array.from({ length: 13 }, (_, index) => ({ ...row, productId: String(index), name: `Produto ${index}` })) })); mount()
  expect(await screen.findByText('-R$ 20,00')).toBeInTheDocument()
  expect(screen.getByText('-10%')).toBeInTheDocument()
  const table = screen.getByRole('table', { name: 'Valor do estoque por produto' })
  expect(within(table).getAllByRole('row')).toHaveLength(13)
  fireEvent.click(screen.getByRole('button', { name: 'Próxima' }))
  expect(within(table).getAllByRole('row')).toHaveLength(2)
  expect(within(table).getByText('Produto 12')).toBeInTheDocument()
})
