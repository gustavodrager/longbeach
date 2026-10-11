import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { FinancialBalanceOverview } from './FinancialBalanceOverview'
const auth = vi.hoisted(() => ({ roles: ['Owner'] }))
vi.mock('../auth/authContext', () => ({ useAuth: () => ({ user: { id: 'owner-test', roles: auth.roles } }) }))
const response = { pagBank: { amountCents: 12345, date: '2026-08-30', sourceName: 'test.xlsx', sourceCell: 'Test!A2', metric: 'Saldo Pagbank', issue: null }, general: { month: '2026-08', amountCents: -10000, incomeCents: 50000, expenseCents: 60000, records: 3, sources: ['test.xlsx'], issue: null } }
function wrap() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><FinancialBalanceOverview /></MemoryRouter></QueryClientProvider>) }
afterEach(() => { vi.restoreAllMocks(); auth.roles = ['Owner'] })
it('mostra saldo datado e déficit mensal sem remover seu sinal', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(response)))
  wrap()
  expect(await screen.findByText('R$ 123,45')).toBeInTheDocument()
  expect(screen.getByText('Saldo informado em 30/08/2026')).toBeInTheDocument()
  expect(screen.getByText('-R$ 100,00')).toBeInTheDocument()
  expect(screen.getByText(/Déficit · receitas menos despesas/)).toBeInTheDocument()
  expect(screen.getAllByRole('link')[0]).toHaveTextContent('Saldo da conta PagBank')
  expect(screen.getAllByRole('link')[1]).toHaveAttribute('href', '/financeiro/historico?series=consolidado&month=2026-08')
})
it('ausência de fonte permanece indisponível e equipe não consulta saldos', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ pagBank: { amountCents: null }, general: { amountCents: null } })))
  const view = wrap()
  expect(await screen.findAllByText('Ainda não disponível')).toHaveLength(2)
  expect(screen.queryByText('R$ 0,00')).not.toBeInTheDocument()
  view.unmount(); fetch.mockClear(); auth.roles = ['Operations']; wrap()
  expect(fetch).not.toHaveBeenCalled()
})
it('identifica a origem PDF e explica receitas conforme o consolidado', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ...response, pagBank: { ...response.pagBank, sourceName: 'extrato.pdf-saldos-v1.json' }, general: { ...response.general, month: '2026-09', records: 2 } })))
  wrap()
  expect(await screen.findByText(/Fonte: extrato PDF/)).toBeInTheDocument()
  expect(screen.getByText('Resultado de setembro de 2026')).toBeInTheDocument()
  expect(screen.getByText(/Receitas informadas no consolidado:/)).toHaveTextContent('R$ 500,00')
  expect(screen.queryByText(/Receitas da arena e vendas brutas/)).not.toBeInTheDocument()
})
it('abre cada grupo do mês revisado sem misturar parcelas ou acertos nas despesas fixas', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ...response, general: { ...response.general, basis: 'revisado', expensesByType: { fixedCents: 30000, variableCents: 20000, installmentCents: 10000, adjustmentCents: 0, otherCents: 0 } } })))
  wrap()
  expect(await screen.findByRole('link', { name: /Despesas fixas/ })).toHaveAttribute('href', '/financeiro/controle-mensal?month=2026-08&grupo=fixas')
  expect(screen.getByRole('link', { name: /Despesas variáveis/ })).toHaveAttribute('href', '/financeiro/controle-mensal?month=2026-08&grupo=variaveis')
  expect(screen.getByRole('link', { name: /Parcelas/ })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Acertos e devoluções/ })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Despesas do mês/ })).toHaveTextContent('R$ 600,00')
  expect(screen.queryByText('Outras despesas')).not.toBeInTheDocument()
})
it('não inventa classificação para um consolidado histórico sem detalhe', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(response)))
  wrap(); await screen.findByText('R$ 123,45')
  expect(screen.queryByRole('navigation', { name: 'Despesas por tipo' })).not.toBeInTheDocument()
})
