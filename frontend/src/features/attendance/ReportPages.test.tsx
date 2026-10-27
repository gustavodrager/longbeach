import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { BarOverviewPage, BarReportPage, BarSourcePage } from './ReportPages'

vi.mock('../auth/authContext', () => ({ useAuth: () => ({ user: { id: 'report-test', permissions: ['bar:finance:read', 'bar:payments:reconcile'] } }) }))
vi.mock('../bar/StockValuation', () => ({ StockValuation: () => <section aria-label="Valor do estoque">Projeção do estoque</section> }))
const clients: QueryClient[] = []
function mount(path = '/bar/indicadores') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client)
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/bar/indicadores" element={<BarOverviewPage />} />
    <Route path="/bar/indicadores/:metric" element={<BarReportPage />} />
    <Route path="/bar/registros/:kind/:resourceId" element={<BarSourcePage />} />
  </Routes></MemoryRouter></QueryClientProvider>)
}
function server() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const url = new URL(String(input), 'http://test.invalid')
    const metric = url.pathname.split('/').at(-1)
    return new Response(JSON.stringify({ metric, title: metric === 'low-stock-bar' ? 'Estoque baixo no Bar' : metric, value: metric === 'low-stock-bar' ? 2 : 7, unit: 'count', current: true, updatedAtUtc: '2026-10-19T12:00:00Z', explanation: 'Estoque conferido', rows: { items: [], page: 1, pageSize: 20, total: 0 } }), { status: 200 })
  })
}
afterEach(() => { clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks() })

it.each([null, 2.50])('mantém o pagamento e sua taxa histórica consultáveis sem conciliação manual (%s)', async fee => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
    id: 'tab-1', number: 14, total: 100, paid: 80, pending: 0, due: 20, payable: 20,
    items: [], payments: [{ id: 'payment-1', method: 'CardManual', state: 'Approved', amount: 100,
      refunded: 20, refundPending: 5, fee, createdAtUtc: '2026-10-25T12:00:00Z', confirmedAtUtc: '2026-10-25T12:01:00Z' }],
  }), { status: 200 }))
  mount('/bar/registros/payment/payment-1')
  expect(await screen.findByRole('heading', { name: 'Comanda 14' })).toBeInTheDocument()
  expect(screen.getByText(fee == null ? 'Taxa registrada: Ainda não disponível' : /Taxa registrada: R\$\s*2,50/)).toBeInTheDocument()
  expect(screen.getByText(/Estornado:/)).toHaveTextContent(/20,00/)
  expect(screen.getByText(/Estorno aguardando confirmação:/)).toHaveTextContent(/5,00/)
  expect(screen.queryByText(/Conciliação|Registrar conciliação|Conferir a taxa/)).not.toBeInTheDocument()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(String(fetch.mock.calls[0][0])).toContain('/api/v1/bar/tabs/payments/payment-1')
  expect(fetch.mock.calls[0][1]?.method ?? 'GET').toBe('GET')
})

it('mantém a operação atual consultável com datas inválidas e recupera os resultados ao corrigir', async () => {
  const fetch = server(); mount('/bar/indicadores?de=2026-10-20&ate=2026-10-19')
  const attention = screen.getByRole('region', { name: 'Atenção agora' })
  await waitFor(() => expect(within(attention).getByRole('link', { name: /Comandas abertas/ })).toHaveTextContent('7'))
  expect(screen.getByRole('alert')).toHaveTextContent('data final')
  expect(fetch.mock.calls).toHaveLength(5)
  expect(fetch.mock.calls.every(([input]) => !new URL(String(input), 'http://test.invalid').searchParams.has('fromUtc'))).toBe(true)
  fireEvent.click(within(attention).getByRole('link', { name: /Estoque baixo no Bar/ }))
  expect(await screen.findByRole('heading', { name: 'Estoque baixo no Bar' })).toBeInTheDocument()
  expect(screen.queryByRole('form', { name: 'Período dos indicadores' })).not.toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('link', { name: /Voltar ao resumo/ }))
  fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-10-19' } })
  fireEvent.submit(screen.getByRole('form', { name: 'Período dos indicadores' }))
  await waitFor(() => expect(within(screen.getByRole('region', { name: 'Resultados no período' })).getByRole('link', { name: /Consumo confirmado/ })).toHaveTextContent('7'))
  expect(fetch.mock.calls.some(([input]) => String(input).includes('consumption?fromUtc='))).toBe(true)
})

it('usa o indicador específico do Bar e conserva a consulta de todos os locais', async () => {
  const fetch = server(); mount()
  expect(await screen.findByRole('link', { name: /Estoque baixo no Bar 2/ })).toHaveAttribute('href', '/bar/indicadores/low-stock-bar')
  expect(fetch.mock.calls.some(([input]) => String(input).includes('/reports/low-stock?'))).toBe(false)
  fireEvent.click(screen.getByRole('link', { name: /Conferir todos os locais/ }))
  await waitFor(() => expect(fetch.mock.calls.some(([input]) => String(input).includes('/reports/low-stock?'))).toBe(true))
  expect(screen.getByRole('link', { name: /Ver apenas o estoque do Bar/ })).toHaveAttribute('href', '/bar/indicadores/low-stock-bar')
})
