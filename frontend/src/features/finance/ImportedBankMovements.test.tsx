import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { ImportedBankMovements } from './ImportedBankMovements'

const actor = vi.hoisted(() => ({ id: 'bank-owner', roles: ['Manager'] }))
vi.mock('../auth/authContext', () => ({ useAuth: () => ({ user: { ...actor, permissions: [] } }) }))
const clients: QueryClient[] = []
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
const request = (input: RequestInfo | URL) => new URL(String(input), 'https://longbeach.example.invalid')

function report({ series = 'pagbank-conta', month = '2026-10', incoming = 1_628_708, outgoing = -1_052_470, total = 307, items = 5 } = {}) {
  return {
    month, months: ['2026-11', '2026-10', '2026-09'], total, page: 1,
    updatedAtUtc: '2026-10-27T15:00:00Z',
    totals: total ? [
      { series, metric: 'entradas-extrato', state: 'Informado no extrato', period: month, grain: 'day', records: total - 1, amountCents: incoming },
      { series, metric: 'saidas-extrato', state: 'Informado no extrato', period: month, grain: 'day', records: 1, amountCents: outgoing },
    ] : [],
    items: Array.from({ length: items }, (_, index) => ({
      id: `movement-${index}`, sourceName: 'Extrato outubro.csv', sourceSha256: 'a'.repeat(64),
      data: {
        sourceCell: `movement-${index}`, series, metric: 'entradas-extrato', label: `Movimento ${index + 1}`,
        state: 'Informado no extrato', grain: 'day', periodStart: `${month}-${String(Math.min(index + 1, 28)).padStart(2, '0')}`, periodEnd: `${month}-${String(Math.min(index + 1, 28)).padStart(2, '0')}`,
        amountCents: 100 + index, notes: '',
      },
    })),
  }
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  clients.push(client)
  render(<QueryClientProvider client={client}><MemoryRouter><ImportedBankMovements /></MemoryRouter></QueryClientProvider>)
  return client
}

afterEach(() => {
  cleanup(); clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks()
  actor.id = 'bank-owner'; actor.roles = ['Manager']
})

it('destaca totais de todos os movimentos sem recalcular pela pequena prévia da fonte', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(report({ items: 50 })))
  mount()
  expect(await screen.findByText('R$ 16.287,08')).toBeVisible()
  expect(screen.getByText('R$ 10.524,70')).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Movimentos bancários' })).toBeVisible()
  expect(screen.getByLabelText('Banco dos movimentos')).toHaveValue('pagbank-conta')
  expect(screen.getAllByText(/307/).length).toBeGreaterThan(0)
  expect(screen.getAllByText(/Extrato outubro.csv/).some(element => !element.closest('details'))).toBe(true)
  expect(screen.queryByRole('table', { name: 'Prévia dos movimentos importados do PagBank' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('Ver prévia de 5 movimentos e suas origens', { selector: 'summary' }))
  const table = await screen.findByRole('table', { name: 'Prévia dos movimentos importados do PagBank' })
  expect(table).toBeVisible()
  expect(within(table).getAllByRole('row')).toHaveLength(6)
  expect(screen.queryByText('Movimento 6')).not.toBeInTheDocument()
  expect(screen.getByText('Movimento 1')).toBeVisible()
  expect(screen.getByText('01/10/2026')).toBeVisible()
  expect(screen.getByText(/Primeiros 5 de 307/)).toBeVisible()
  expect(screen.getAllByRole('link').some(link => {
    const href = new URL(link.getAttribute('href')!, 'https://longbeach.example.invalid')
    return href.pathname === '/financeiro/historico' && href.searchParams.get('month') === '2026-10' && href.searchParams.get('series') === 'pagbank-conta'
  })).toBe(true)
  expect(fetch.mock.calls.every(([path, options]) => String(path).startsWith('/api/v1/financial-history?') && !options?.method)).toBe(true)
})

it('troca o mês consultado e preserva mês e banco nos links de origem', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const url = request(input)
    return json(url.searchParams.get('month') === '2026-09' ? report({ month: '2026-09', incoming: 90_000 }) : report())
  })
  mount(); await screen.findByText('R$ 16.287,08')
  fireEvent.change(screen.getByLabelText('Mês dos movimentos'), { target: { value: '2026-09' } })
  expect(await screen.findByText('R$ 900,00')).toBeVisible()
  expect(screen.queryByText('R$ 16.287,08')).not.toBeInTheDocument()
  expect(fetch.mock.calls.some(([input]) => request(input).searchParams.get('month') === '2026-09')).toBe(true)
  expect(screen.getAllByRole('link').some(link => {
    const href = new URL(link.getAttribute('href')!, 'https://longbeach.example.invalid')
    return href.pathname === '/financeiro/historico' && href.searchParams.get('month') === '2026-09' && href.searchParams.get('series') === 'pagbank-conta'
  })).toBe(true)
})

it('ao trocar o banco consulta seu último mês e não mantém valores antigos durante a carga', async () => {
  let finishC6: ((value: Response) => void) | undefined
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const url = request(input)
    return url.searchParams.get('series') === 'c6-conta'
      ? new Promise<Response>(resolve => { finishC6 = resolve })
      : json(report({ month: url.searchParams.get('month') ?? '2026-10' }))
  })
  mount(); await screen.findByText('R$ 16.287,08')
  fireEvent.change(screen.getByLabelText('Mês dos movimentos'), { target: { value: '2026-09' } })
  await waitFor(() => expect(fetch.mock.calls.some(([input]) => request(input).searchParams.get('month') === '2026-09')).toBe(true))
  fireEvent.change(screen.getByLabelText('Banco dos movimentos'), { target: { value: 'c6-conta' } })
  await waitFor(() => expect(finishC6).toBeDefined())
  expect(screen.queryByText('R$ 16.287,08')).not.toBeInTheDocument()
  const last = request(fetch.mock.calls.at(-1)![0])
  expect(last.searchParams.get('series')).toBe('c6-conta')
  expect(last.searchParams.has('month')).toBe(false)
  await act(async () => { finishC6!(json(report({ series: 'c6-conta', month: '2026-09', incoming: 12_300 }))) })
  expect(await screen.findByText('R$ 123,00')).toBeVisible()
  expect(screen.getByLabelText('Mês dos movimentos')).toHaveValue('2026-09')
})

it('mantém mês vazio do banco separado dos meses globais que pertencem a outros controles', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(report({ total: 0, items: 0 })))
  mount()
  expect(await screen.findByText(/nenhum movimento|sem movimentos/i)).toBeVisible()
  expect(screen.queryByText('R$ 0,00')).not.toBeInTheDocument()
  expect(screen.queryByText('R$ 16.287,08')).not.toBeInTheDocument()
})

it('falha da consulta não aparece como saldo ou movimentação zerada', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 503 }))
  mount()
  expect(await screen.findByRole('alert')).toBeVisible()
  expect(screen.queryByText('R$ 0,00')).not.toBeInTheDocument()
  expect(screen.queryByText('R$ 16.287,08')).not.toBeInTheDocument()
})

it('atualiza os totais ao invalidar o histórico depois de uma importação aplicada', async () => {
  let current = report()
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json(current))
  const client = mount()
  expect(await screen.findByText('R$ 16.287,08')).toBeVisible()
  current = report({ total: 308, incoming: 1_638_708 })
  await act(async () => { await client.invalidateQueries({ queryKey: ['financial-history'] }) })
  expect(await screen.findByText('R$ 16.387,08')).toBeVisible()
  expect(screen.queryByText('R$ 16.287,08')).not.toBeInTheDocument()
  expect(screen.getByText(/308 movimento\(s\) importado\(s\)/)).toBeVisible()
  expect(fetch).toHaveBeenCalledTimes(2)
})

it.each(['Student', 'Operations', 'Teacher'])('não expõe movimentos nem consulta o histórico para %s', role => {
  actor.roles = [role]
  const fetch = vi.spyOn(globalThis, 'fetch')
  mount()
  expect(screen.queryByRole('heading', { name: 'Movimentos bancários' })).not.toBeInTheDocument()
  expect(fetch).not.toHaveBeenCalled()
})
