import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { C6StatementPanel } from './C6StatementPanel'

const request = vi.hoisted(() => vi.fn())
const auth = vi.hoisted(() => ({ roles: ['Manager'] }))
vi.mock('../../lib/http', () => ({ apiFetch: request }))
vi.mock('../auth/authContext', () => ({ useAuth: () => ({ user: { id: 'c6-manager', roles: auth.roles } }) }))
const entry = { id: '1', entryId: 'bank-reference', bookedDate: '2026-01-02', amountCents: -4205, title: 'Transferência', description: 'Movimento fictício', operationType: 'OUTGOING', transactionType: 'PIX', endToEndId: null, sourceSha256: 'hash', linkedPaymentId: null }
const report = { environment: 'Sandbox', account: 'C6 teste', from: '2026-01-01', through: '2026-01-30', items: [entry], total: 1, page: 1 }
function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return { client, ...render(<QueryClientProvider client={client}><C6StatementPanel /></QueryClientProvider>) }
}
beforeEach(() => { request.mockReset(); auth.roles = ['Manager'] })

it('identifica sandbox, conserva saída negativa e separa vínculo de recebimento', async () => {
  request.mockResolvedValue({ ...report, items: [entry, { ...entry, id: '2', amountCents: 5000, title: 'Pix recebido', linkedPaymentId: 'payment' }] })
  show()
  expect(await screen.findByRole('table', { name: 'Movimentos da conta C6' })).toHaveTextContent('-R$ 42,05')
  expect(screen.getByText(/não representam dinheiro real/)).toBeInTheDocument()
  expect(screen.getByText('A conferir')).toBeInTheDocument()
  expect(screen.getByText('Vinculado a pagamento da LongBeach')).toBeInTheDocument()
  expect(screen.queryByText(/Total de receitas/)).not.toBeInTheDocument()
})

it('valida período antes da consulta e solicita páginas distintas', async () => {
  request.mockResolvedValue({ ...report, total: 51 }); show()
  await screen.findByRole('table')
  fireEvent.change(screen.getByLabelText('Início do extrato C6'), { target: { value: '2026-01-01' } })
  fireEvent.change(screen.getByLabelText('Fim do extrato C6'), { target: { value: '2026-02-01' } })
  fireEvent.click(screen.getByRole('button', { name: 'Filtrar extrato' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('até 30 dias')
  expect(request).toHaveBeenCalledTimes(1)
  fireEvent.change(screen.getByLabelText('Fim do extrato C6'), { target: { value: '2026-01-30' } })
  fireEvent.click(screen.getByRole('button', { name: 'Filtrar extrato' }))
  await waitFor(() => expect(request).toHaveBeenCalledWith('/api/v1/financial-history/c6?from=2026-01-01&through=2026-01-30&page=1'))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Próxima' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Próxima' }))
  await waitFor(() => expect(request).toHaveBeenCalledWith('/api/v1/financial-history/c6?from=2026-01-01&through=2026-01-30&page=2'))
})

it('preserva consulta local sem reprocessar no banco nem repetir por intervalo', async () => {
  vi.useFakeTimers()
  request.mockResolvedValue(report); const view = show()
  await act(async () => { await vi.advanceTimersByTimeAsync(50) })
  expect(screen.getByRole('table')).toBeInTheDocument()
  expect(request).toHaveBeenCalledTimes(1)
  expect(screen.queryByText('Consultar novamente este período no C6')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Motivo da consulta C6')).not.toBeInTheDocument()
  await act(async () => { await vi.advanceTimersByTimeAsync(120_000) })
  expect(request).toHaveBeenCalledTimes(1)
  expect(request.mock.calls.every(([,options])=>!options?.method)).toBe(true)
  view.unmount(); view.client.clear(); vi.useRealTimers()
})

it('oculta dados antigos em falha e permite repetir sem afirmar extrato vazio', async () => {
  request.mockResolvedValueOnce(report); const { client } = show()
  await screen.findByRole('table')
  request.mockRejectedValue(new Error('offline'))
  await client.invalidateQueries({ queryKey: ['c6-statement'] })
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível consultar')
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(screen.queryByText(/Nenhum movimento/)).not.toBeInTheDocument()
})

it('não solicita extrato para atendentes', () => {
  auth.roles = ['Operations']; show()
  expect(request).not.toHaveBeenCalled()
  expect(screen.queryByRole('heading')).not.toBeInTheDocument()
})
