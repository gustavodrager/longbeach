import { act, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { FinancialBalanceOverview } from './FinancialBalanceOverview'
import userEvent from '@testing-library/user-event'
vi.mock('./CurrentFinancialMetrics', () => ({ CurrentFinancialMetrics: () => <div>Posição operacional atual</div> }))
const auth = vi.hoisted(() => ({ roles: ['Manager'] }))
vi.mock('../auth/authContext', () => ({ useAuth: () => ({ user: { id: 'owner-test', roles: auth.roles } }) }))
const response = { pagBank: { amountCents: 12345, date: '2026-08-30', sourceName: 'test.xlsx', sourceCell: 'Test!A2', metric: 'Saldo Pagbank', issue: null }, general: { month: '2026-08', amountCents: -10000, incomeCents: 50000, expenseCents: 60000, records: 3, sources: ['test.xlsx'], issue: null } }
const emptyPosition = { readAtUtc: '2026-08-31T12:00:00Z', currentBank: { amountCents: null, status: 'AwaitingImport' }, receivable: {}, payable: {}, entries: [] }
function mockBalances(value: unknown) { return vi.spyOn(globalThis, 'fetch').mockImplementation(async input => new Response(JSON.stringify(String(input).endsWith('/current-position') ? emptyPosition : value))) }
function wrap() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return {client, ...render(<QueryClientProvider client={client}><MemoryRouter><FinancialBalanceOverview /></MemoryRouter></QueryClientProvider>)} }
const openHistory = () => userEvent.click(screen.getByText('Histórico: última referência disponível'))
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); auth.roles = ['Manager'] })
it('mostra saldo datado e déficit mensal sem remover seu sinal', async () => {
  mockBalances(response)
  wrap()
  expect(await screen.findByText('R$ 123,45')).toBeVisible()
  await openHistory()
  expect(await screen.findByText('R$ 123,45')).toBeInTheDocument()
  expect(screen.getByText('Saldo informado em 30/08/2026')).toBeInTheDocument()
  expect(screen.getByText('-R$ 100,00')).toBeInTheDocument()
  expect(screen.getByText(/Déficit · receitas menos despesas/)).toBeInTheDocument()
  expect(screen.getByRole('link', {name: /Saldo da conta PagBank/})).toBeVisible()
  expect(screen.getByRole('link', {name: /Resultado do controle mensal/})).toHaveAttribute('href', '/financeiro/historico?series=consolidado&month=2026-08')
  expect(screen.getByRole('link', {name: 'Importar extratos'})).toHaveAttribute('href', '/importacoes')
})
it('ausência de fonte permanece indisponível e equipe não consulta saldos', async () => {
  const fetch = mockBalances({ pagBank: { amountCents: null }, general: { amountCents: null } })
  const view = wrap()
  await openHistory()
  expect(await screen.findAllByText('Ainda não disponível')).toHaveLength(3)
  expect(screen.queryByText('R$ 0,00')).not.toBeInTheDocument()
  view.unmount(); fetch.mockClear(); auth.roles = ['Operations']; wrap()
  expect(fetch).not.toHaveBeenCalled()
})
it('identifica a origem PDF e explica receitas conforme o consolidado', async () => {
  mockBalances({ ...response, pagBank: { ...response.pagBank, sourceName: 'extrato.pdf-saldos-v1.json' }, general: { ...response.general, month: '2026-09', records: 2 } })
  wrap()
  await openHistory()
  expect(await screen.findByText(/Origem: extrato.pdf-saldos-v1.json/)).toBeInTheDocument()
  expect(screen.getByText('Resultado de setembro de 2026')).toBeInTheDocument()
  expect(screen.getByText(/Receitas informadas no consolidado:/)).toHaveTextContent('R$ 500,00')
  expect(screen.queryByText(/Receitas da arena e vendas brutas/)).not.toBeInTheDocument()
})
it('mostra data e horário da consulta manual ao portal sem apresentar um extrato', async () => {
  mockBalances({ ...response, pagBank: {
    ...response.pagBank, date: '2026-08-30', sourceName: 'PagBank-portal-autenticado-saldo-20260830231542.json', sourceCell: `pagbank-portal-manual-v1:${'a'.repeat(64)}:saldo`,
  } })
  wrap()
  expect(await screen.findByText('Consultado no portal em 30/08/2026 às 23:15 · horário de São Paulo')).toBeVisible()
  expect(screen.getByText('Saldo da conta PagBank · consultado no portal')).toBeVisible()
  expect(screen.getByText('Consulta manual. O saldo não é atualizado automaticamente.')).toBeVisible()
  expect(screen.queryByText(/Último extrato importado/)).not.toBeInTheDocument()
  expect(screen.getByRole('link', {name: /Saldo da conta PagBank/})).toHaveAttribute('href', '/financeiro/historico?series=saldos&month=2026-08&metric=Saldo+Pagbank')
})
it('abre cada grupo do mês revisado sem misturar parcelas ou acertos nas despesas fixas', async () => {
  mockBalances({ ...response, general: { ...response.general, basis: 'revisado', expensesByType: { fixedCents: 30000, variableCents: 20000, installmentCents: 10000, adjustmentCents: 0, otherCents: 0 } } })
  wrap()
  await openHistory()
  expect(await screen.findByRole('link', { name: /Despesas fixas/ })).toHaveAttribute('href', '/financeiro/controle-mensal?month=2026-08&grupo=fixas')
  expect(screen.getByRole('link', { name: /Despesas variáveis/ })).toHaveAttribute('href', '/financeiro/controle-mensal?month=2026-08&grupo=variaveis')
  expect(screen.getByRole('link', { name: /Parcelas/ })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Acertos e devoluções/ })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Despesas do mês/ })).toHaveTextContent('R$ 600,00')
  expect(screen.queryByText('Outras despesas')).not.toBeInTheDocument()
})
it('não inventa classificação para um consolidado histórico sem detalhe', async () => {
  mockBalances(response)
  wrap(); await openHistory(); await screen.findByText('R$ 123,45')
  expect(screen.queryByRole('navigation', { name: 'Despesas por tipo' })).not.toBeInTheDocument()
})

it('separa carteira EDI do extrato da conta e abre a origem datada', async () => {
  mockBalances({ ...response, pagBankWallet: { amountCents: 0, date: '2026-10-12', collectedAtUtc: '2026-10-13T12:00:00Z', sourceHashes: ['hash'], issue: null } })
  wrap()
  await userEvent.click(screen.getByText('Carteira PagBank · histórico EDI'))
  expect(await screen.findByText('R$ 0,00')).toBeVisible()
  expect(await screen.findByText('R$ 123,45')).toBeVisible()
  expect(screen.getByText(/A data pertence ao documento preservado/)).toBeInTheDocument()
  await openHistory()
  expect(screen.getByText('R$ 123,45')).toBeInTheDocument()
  expect(screen.getByText(/Este valor não acompanha o saldo atual/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Carteira de vendas PagBank/ })).toHaveAttribute('href', '/financeiro/historico?ediDate=2026-10-12#pagbank-edi')
})


it('saldos importados não repetem por intervalo e uma falha oculta o valor e a origem anteriores', async () => {
  vi.useFakeTimers()
  const fetch=mockBalances(response)
  const view=wrap()
  await act(async()=>{await vi.advanceTimersByTimeAsync(50)})
  expect(screen.getByText('R$ 123,45')).toBeVisible()
  await act(async()=>{await vi.advanceTimersByTimeAsync(120_000)})
  expect(fetch).toHaveBeenCalledTimes(2)
  fetch.mockResolvedValue(new Response('{}', {status:503}))
  await act(async()=>{await view.client.invalidateQueries({queryKey:['dashboard-balances']});await vi.advanceTimersByTimeAsync(50)})
  expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar os saldos')
  expect(screen.queryByText('R$ 123,45')).not.toBeInTheDocument()
  expect(screen.queryByText('Saldo informado em 30/08/2026')).not.toBeInTheDocument()
  view.unmount();view.client.clear();vi.useRealTimers()
})
