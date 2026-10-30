import { act, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { BankBalancesOverview } from './BankBalancesOverview'
import { CurrentFinancialMetrics } from './CurrentFinancialMetrics'

const auth = vi.hoisted(() => ({ roles: ['Manager'] }))
vi.mock('../auth/authContext', () => ({ useAuth: () => ({ user: { id: 'bank-owner', roles: auth.roles } }) }))
const outstanding = { amountCents: 0, records: 0, overdueCents: 0, overdueRecords: 0, confirmedPaymentsCents: 0 }
const position = { date: '2026-08-31', readAtUtc: '2026-08-31T12:00:00Z', lastRecordChangeAtUtc: null, registeredEntries: 0, receivable: outstanding, payable: outstanding, entries: [], currentBank: { amountCents: 45678, status: 'Imported', issue: 'Saldo importado de arquivo.', source: 'C6 · extrato-ficticio.csv', sourceDate: '2026-08-29', asOfUtc: '2026-08-31T12:00:00Z' } }
const balances = { pagBank: { amountCents: 12345, date: '2026-08-30', sourceName: 'PagBank-portal-autenticado-saldo-20260830231542.json', sourceCell: `pagbank-portal-manual-v1:${'a'.repeat(64)}:saldo`, metric: 'Saldo Pagbank', issue: null }, general: { amountCents: null } }
const clients: QueryClient[] = []
function mount(withOperational = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client)
  render(<QueryClientProvider client={client}><MemoryRouter><BankBalancesOverview />{withOperational && <CurrentFinancialMetrics compact />}</MemoryRouter></QueryClientProvider>)
  return client
}
function mockSources(c6: unknown = position, pagBank: unknown = balances) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async input => new Response(JSON.stringify(String(input).endsWith('/current-position') ? c6 : pagBank)))
}
afterEach(() => { clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks(); vi.useRealTimers(); auth.roles = ['Manager'] })

it('mostra os dois saldos separados com data e origem, sem somar referências distintas', async () => {
  const fetch = mockSources(); mount()
  const group = screen.getByRole('region', { name: 'Saldos dos bancos' })
  const pagBank = within(group).getByRole('link', { name: /Saldo da conta PagBank/ })
  const c6 = within(group).getByRole('link', { name: /Saldo da conta C6/ })
  expect(await within(pagBank).findByText('R$ 123,45')).toBeVisible()
  expect(await within(c6).findByText('R$ 456,78')).toBeVisible()
  expect(pagBank).toHaveTextContent('Consultado no portal em 30/08/2026 às 23:15 · horário de São Paulo')
  expect(pagBank).toHaveTextContent('Origem: Portal PagBank · consulta manual')
  expect(c6).toHaveTextContent('Saldo informado em 29/08/2026')
  expect(c6).toHaveTextContent('Origem: C6 · extrato-ficticio.csv')
  expect(c6).toHaveTextContent('Importado em: 31/08/2026')
  expect(c6).toHaveAttribute('href', '/financeiro/historico?series=saldos&month=2026-08&metric=Saldo+C6')
  expect(pagBank).toHaveAttribute('href', '/financeiro/historico?series=saldos&month=2026-08&metric=Saldo+Pagbank')
  expect(group).toHaveTextContent('Estes valores não são somados aos pagamentos das contas.')
  expect(screen.queryByText('R$ 580,23')).not.toBeInTheDocument()
  expect(fetch.mock.calls.every(([, options]) => !options?.method)).toBe(true)
})

it('distingue saldo desconhecido de saldo zero explicitamente informado', async () => {
  mockSources({ ...position, currentBank: { ...position.currentBank, amountCents: 0 } }, { ...balances, pagBank: { ...balances.pagBank, amountCents: null, date: null, sourceName: null, sourceCell: null } }); mount()
  const pagBank = screen.getByRole('link', { name: /Saldo da conta PagBank/ })
  const c6 = screen.getByRole('link', { name: /Saldo da conta C6/ })
  expect(await within(pagBank).findByText('Ainda não disponível')).toBeVisible()
  expect(await within(c6).findByText('R$ 0,00')).toBeVisible()
  expect(within(pagBank).queryByText('R$ 0,00')).not.toBeInTheDocument()
})

it('preserva sinal, aviso histórico e Sandbox sem chamar a referência de dinheiro real', async () => {
  mockSources({ ...position, currentBank: { ...position.currentBank, amountCents: -4205, status: 'Stale', environment: 'Sandbox', issue: 'Leitura anterior preservada.' } }); mount()
  const c6 = screen.getByRole('link', { name: /Saldo da conta C6/ })
  expect(await within(c6).findByText('-R$ 42,05')).toBeVisible()
  expect(c6).toHaveTextContent('Leitura anterior preservada.')
  expect(c6).toHaveTextContent('não representa dinheiro real')
  expect(c6).toHaveTextContent('Registrado em: 31/08/2026')
})

it('explica saldo C6 importado indisponível por fontes ambíguas sem inventar zero', async () => {
  mockSources({ ...position, currentBank: { ...position.currentBank, amountCents: null, issue: 'Há mais de um saldo C6 nesta data. Confira as fontes.' } }); mount()
  const c6 = screen.getByRole('link', { name: /Saldo da conta C6/ })
  expect(await within(c6).findByText('Ainda não disponível')).toBeVisible()
  expect(c6).toHaveTextContent('Há mais de um saldo C6 nesta data. Confira as fontes.')
  expect(within(c6).queryByText('R$ 0,00')).not.toBeInTheDocument()
})

it.each(['current-financial-position', 'dashboard-balances'])('falha em %s oculta sua referência anterior e preserva o outro banco', async key => {
  const fetch = mockSources(); const client = mount()
  await screen.findByText('R$ 123,45'); await screen.findByText('R$ 456,78')
  fetch.mockImplementation(async input => String(input).endsWith(key === 'current-financial-position' ? '/current-position' : '/dashboard-balances')
    ? new Response('{}', { status: 503 }) : new Response(JSON.stringify(key === 'current-financial-position' ? balances : position)))
  await act(async () => { await client.invalidateQueries({ queryKey: [key] }) })
  const failed = screen.getByRole('link', { name: key === 'current-financial-position' ? /Saldo da conta C6/ : /Saldo da conta PagBank/ })
  await waitFor(() => expect(failed).toHaveTextContent('Saldo indisponível'))
  expect(failed).not.toHaveTextContent(key === 'current-financial-position' ? 'extrato-ficticio.csv' : '23:15')
  expect(screen.getByText(key === 'current-financial-position' ? 'R$ 123,45' : 'R$ 456,78')).toBeVisible()
})

it.each(['Operations', 'Student'])('não consulta nem exibe dados bancários para %s', role => {
  auth.roles = [role]; const fetch = mockSources(); mount()
  expect(screen.queryByRole('region', { name: 'Saldos dos bancos' })).not.toBeInTheDocument()
  expect(fetch).not.toHaveBeenCalled()
})

it('compartilha a consulta C6 com as métricas operacionais, sem repetir por intervalo', async () => {
  vi.useFakeTimers()
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const path = String(input)
    return new Response(JSON.stringify(path.endsWith('/current-position') ? position : path.endsWith('/dashboard-balances') ? balances : { value: 0, updatedAtUtc: '2026-08-31T12:00:00Z', rows: { total: 0, items: [] } }))
  })
  mount(true)
  await act(async () => { await vi.advanceTimersByTimeAsync(50) })
  expect(fetch.mock.calls.filter(([input]) => String(input).endsWith('/current-position'))).toHaveLength(1)
  expect(fetch.mock.calls.filter(([input]) => String(input).endsWith('/dashboard-balances'))).toHaveLength(1)
  expect(screen.getAllByText('Saldo da conta C6 · referência importada')).toHaveLength(1)
  await act(async () => { await vi.advanceTimersByTimeAsync(120_000) })
  expect(fetch).toHaveBeenCalledTimes(4)
  expect(fetch.mock.calls.every(([input, options]) => String(input).startsWith('/api/v1/') && !options?.method)).toBe(true)
})
