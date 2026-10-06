import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { FinancialHistoryOverview, FinancialHistoryPage } from './FinancialHistory'
const auth = vi.hoisted(() => ({ roles: ['Owner'] }))
vi.mock('../auth/authContext', () => ({ useAuth: () => ({ user: { id: 'owner-test', roles: auth.roles } }) }))
const report = { month: '2026-08', months: ['2026-09', '2026-08'], total: 1, page: 1, totals: [{ series: 'consolidado', metric: 'vendas-bar-bruto', state: 'Informado na planilha', period: '2026-08', grain: 'month', records: 1, amountCents: 155555 }], items: [{ id: 'row', sourceName: 'teste.xlsx', sourceSha256: 'a'.repeat(64), data: { series: 'consolidado', metric: 'vendas-bar-bruto', label: 'Vendas Bar Bruto', state: 'Informado na planilha', sourceCell: 'Teste!I27', periodStart: '2026-08-01', periodEnd: '2026-08-31', grain: 'month', amountCents: 155555, notes: '' } }] }
function wrap(child: React.ReactNode) { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{child}</MemoryRouter></QueryClientProvider>) }
afterEach(() => { vi.restoreAllMocks(); auth.roles = ['Owner'] })
it('dashboard abre o mês da fonte e identifica o valor informado', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => new Response(JSON.stringify(String(input).includes('pagvendas-vendas') ? { ...report, totals: [], items: [] } : report), { headers: { 'Content-Type': 'application/json' } }))
  wrap(<FinancialHistoryOverview />)
  expect(await screen.findByText('R$ 1.555,55')).toBeInTheDocument()
  expect(screen.getByText(/agosto de 2026 · Informado na planilha/)).toBeInTheDocument()
  expect(screen.getByText('Vendas brutas do bar').closest('a')).toHaveAttribute('href', '/financeiro/historico?month=2026-08&series=consolidado&metric=vendas-bar-bruto')
})
it('atendente não consulta o histórico financeiro nem as APIs', () => {
  auth.roles = ['Operations']; const fetch = vi.spyOn(globalThis, 'fetch')
  wrap(<FinancialHistoryPage />)
  expect(screen.getByRole('alert')).toHaveTextContent('apenas para os proprietários')
  expect(fetch).not.toHaveBeenCalled()
})
it('falha de leitura não apresenta valores fictícios de zero', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 503 }))
  wrap(<FinancialHistoryOverview />)
  expect((await screen.findAllByRole('alert'))[0]).toHaveTextContent('Não foi possível atualizar')
  expect(screen.queryByText('R$ 0,00')).not.toBeInTheDocument()
})
