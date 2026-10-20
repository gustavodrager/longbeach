import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { CurrentFinancialMetrics } from './CurrentFinancialMetrics'

const auth = vi.hoisted(() => ({ roles: ['Owner'] }))
vi.mock('../auth/authContext', () => ({ useAuth: () => ({ user: { id: 'owner-current', roles: auth.roles } }) }))
const outstanding = { amountCents: 4000, records: 1, overdueCents: 4000, overdueRecords: 1, confirmedPaymentsCents: 6000 }
const position = { date: '2026-10-13', readAtUtc: '2026-10-13T15:00:00Z', lastRecordChangeAtUtc: '2026-10-12T11:00:00Z', registeredEntries: 3, receivable: outstanding, payable: { ...outstanding, amountCents: 2000, confirmedPaymentsCents: 0 }, currentBank: { amountCents: null, asOfUtc: null, status: 'NotConnected', issue: 'Saldo atual da conta não conectado.' }, entries: [{ id: 'entry-one', name: 'Conta fictícia', direction: 'Receber', dueDate: '2026-10-12', originalCents: 10000, confirmedPaymentsCents: 6000, outstandingCents: 4000 }] }
const report = { metric: 'cash', value: 12.34, unit: 'money', current: true, updatedAtUtc: '2026-10-13T15:00:00Z', rows: { total: 1, items: [] } }
function mockSources(current: unknown = position, bar: unknown = report) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async input => new Response(JSON.stringify(String(input).includes('/current-position') ? current : bar)))
}
function wrap(compact = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return { client, ...render(<QueryClientProvider client={client}><MemoryRouter><CurrentFinancialMetrics compact={compact} /></MemoryRouter></QueryClientProvider>) }
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); auth.roles = ['Owner'] })

it('mostra pendências internas, caixa separado e saldo bancário desconhecido com horas distintas de leitura e alteração', async () => {
  mockSources(); wrap()
  await screen.findByText('Não conectado')
  const receivable = screen.getByRole('button', { name: /A receber · financeiro/ })
  expect(receivable).toHaveTextContent('R$ 40,00')
  expect(receivable).toHaveTextContent('Descontados: R$ 60,00')
  expect(receivable).toHaveAttribute('aria-expanded', 'false')
  expect(screen.getByRole('button', { name: /A pagar/ })).toHaveTextContent('R$ 20,00')
  expect(screen.getByRole('link', { name: /Dinheiro nos caixas/ })).toHaveTextContent('R$ 12,34')
  expect(screen.getByText('Não conectado')).toBeInTheDocument()
  expect(screen.getByText(/Consulta das contas:/)).toHaveTextContent('13/10/2026')
  expect(screen.getByText(/Última alteração registrada:/)).toHaveTextContent('12/10/2026')
  expect(screen.getByText(/Produtos, vendas e estoque/)).toBeInTheDocument()
  expect(screen.queryByText('R$ 84,68')).not.toBeInTheDocument()
  await userEvent.click(receivable)
  const table = screen.getByRole('table', { name: 'Composição do saldo pendente' })
  expect(within(table).getByRole('link', { name: 'Conta fictícia' })).toHaveAttribute('href', '/financeiro/entry-one')
  expect(within(table).getByText('R$ 100,00')).toBeInTheDocument()
  expect(within(table).getByText('R$ 60,00')).toBeInTheDocument()
  expect(within(table).getAllByText('R$ 40,00')).toHaveLength(2)
})

it('identifica ausência de registros sem afirmar saldo zero na conta C6', async () => {
  const empty = { amountCents: 0, records: 0, overdueCents: 0, overdueRecords: 0, confirmedPaymentsCents: 0 }
  mockSources({ ...position, registeredEntries: 0, lastRecordChangeAtUtc: null, receivable: empty, payable: empty }, { ...report, value: 0, rows: { total: 0, items: [] } })
  wrap()
  const bank = (await screen.findByText('Não conectado')).closest('.arena-metric')!
  expect(within(bank as HTMLElement).queryByText('R$ 0,00')).not.toBeInTheDocument()
  expect(screen.getAllByText('Nenhuma conta com saldo pendente registrada.')).toHaveLength(2)
  expect(screen.getByText('Nenhuma comanda com saldo a receber registrada.')).toBeInTheDocument()
  expect(screen.getByText('Nenhum caixa aberto registrado.')).toBeInTheDocument()
})

it('atualiza as três fontes e oculta valores anteriores quando a nova leitura falha', async () => {
  const fetch = mockSources(); wrap()
  await screen.findByText('Não conectado')
  await userEvent.click(screen.getByRole('button', { name: /A receber · financeiro/ }))
  await userEvent.click(screen.getByRole('button', { name: /Fechar Contas a receber/ }))
  fetch.mockRejectedValue(new Error('offline'))
  await userEvent.click(screen.getByRole('button', { name: 'Atualizar agora' }))
  await screen.findByRole('alert')
  await waitFor(() => expect(screen.getAllByText('Falha na atualização')).toHaveLength(4))
  expect(screen.queryByText('R$ 40,00')).not.toBeInTheDocument()
  expect(screen.queryByText('R$ 12,34')).not.toBeInTheDocument()
  expect(screen.queryByText(/Consulta das contas:/)).not.toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(fetch).toHaveBeenCalledTimes(6)
})

it('reconsulta automaticamente a cada 30 segundos e não permite consulta pela equipe sem gestão', async () => {
  vi.useFakeTimers()
  const fetch = mockSources(); const view = wrap()
  await act(async () => { await vi.advanceTimersByTimeAsync(50) })
  expect(fetch).toHaveBeenCalledTimes(3)
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
  expect(fetch).toHaveBeenCalledTimes(6)
  view.unmount(); fetch.mockClear(); auth.roles = ['Operations']; wrap()
  expect(fetch).not.toHaveBeenCalled()
})

it('resumo compacto mantém os saldos líquidos e concentra a atualização no cabeçalho global', async () => {
  mockSources(); wrap(true)
  const receivable = await screen.findByRole('button', { name: /A receber · financeiro.*40,00/ })
  expect(screen.queryByRole('button', { name: 'Atualizar agora' })).not.toBeInTheDocument()
  expect(screen.queryByText('Saldo atual da conta C6')).not.toBeInTheDocument()
  expect(screen.getByText(/Conta C6:/).closest('p')).toHaveTextContent('Não conectado')
  await userEvent.click(receivable)
  expect(screen.getByRole('table', { name: 'Composição do saldo pendente' })).toHaveTextContent('R$ 40,00')
  expect(receivable).toHaveAttribute('aria-expanded', 'true')
  await userEvent.click(screen.getByRole('button', { name: /Fechar Contas a receber/ }))
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})

it('mostra saldo C6 negativo com fonte, data, atraso e ambiente de testes sem somar ao caixa', async () => {
  mockSources({ ...position, currentBank: { amountCents: -4205, asOfUtc: '2026-10-13T14:00:00Z', status: 'Stale', issue: 'Leitura anterior preservada.', source: 'C6 · teste', environment: 'Sandbox', sourceDate: '2026-10-13' } })
  wrap()
  expect(await screen.findByText('-R$ 42,05')).toBeInTheDocument()
  expect(screen.getByText('Leitura atrasada')).toBeInTheDocument()
  expect(screen.getByText(/não representa dinheiro real/)).toBeInTheDocument()
  expect(screen.getByText('Fonte: C6 · teste')).toBeInTheDocument()
  expect(screen.getByText(/Consulta ao banco:/)).toHaveTextContent('Data bancária: 13/10/2026')
  expect(screen.getByRole('link', { name: /Conferir extrato C6/ })).toHaveAttribute('href', '/financeiro/historico?c6=1#c6-extrato')
  expect(screen.getByRole('link', { name: /Dinheiro nos caixas/ })).toHaveTextContent('R$ 12,34')
})
