import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../auth/authContext'
import type { AuthUser } from '../auth/types'
import { TabSettlement } from './TabSettlement'
import { TabCustomerIdentification } from './TabCustomerIdentification'
import { OpenTabForm } from './OpenTabForm'
import { SaleDestination } from './SaleDestination'
import { SellPage, TabDetailsPage, TabsPage } from './AttendancePages'
import { ReceivePage, ReceiptPage } from './PaymentPages'
import { BarSalesPage } from '../bar/BarPages'
import type { Tab } from './api'

const actor = (menus: string[], actions: string[]): AuthUser => ({ id: 'scoped-operator-test', name: 'Equipe teste', email: 'staff@example.invalid', roles: ['Operations'], permissions: ['bar:sales:read', 'bar:sales:operate'], staffAccess: { typeId: 'bar', name: 'Bar', role: 'Operations', menus, actions, homePath: '/atendimento/comandas' } })
const tab = (values: Partial<Tab> = {}): Tab => ({ id: 'tab-test', version: 1, number: 10, name: 'Visitante teste', mode: 'Tab', state: 'Open', locationId: 'bar-test', actorId: 'scoped-operator-test', total: 0, paid: 0, pending: 0, due: 0, payable: 0, createdAtUtc: '2026-11-04T12:00:00Z', items: [], payments: [], history: [], allowedActions: ['close'], ...values })
const clients: QueryClient[] = []
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } })
function RouteState() { const location = useLocation(); return <output data-testid="route">{location.pathname}{location.search}</output> }
function mount(content: ReactNode, user: AuthUser, path = '/atendimento/comandas') {
  const query = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(query)
  const auth: AuthContextValue = { user, isBootstrapping: false, signIn: async () => {}, signInWithGoogle: async () => {}, signOut: async () => {}, changePassword: async () => {}, completeFirstAccessWithGoogle: async () => {} }
  render(<QueryClientProvider client={query}><AuthContext.Provider value={auth}><MemoryRouter initialEntries={[path]}><RouteState />{content}</MemoryRouter></AuthContext.Provider></QueryClientProvider>)
}
function server(current = tab()) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = String(input)
    if (path.endsWith('/tabs/locations')) return json([{ id: 'bar-test', name: 'Bar' }])
    if (path.includes('/tabs?')) return json({ items: [current], page: 1, pageSize: 24, total: 1 })
    if (path.endsWith('/tabs/tab-test')) return json(current)
    if (path.includes('/tabs/catalog?')) return json([{ id: 'water', name: 'Água teste', shortName: 'Água', categoryId: 'drinks', categoryName: 'Bebidas', salePrice: 5, favorite: true, displayOrder: 1, available: 2, prepared: false }])
    if (init?.method === 'POST' || init?.method === 'PUT') return json(current)
    throw new Error(`Consulta inesperada: ${path}`)
  })
}
afterEach(() => { cleanup(); clients.splice(0).forEach(query => query.clear()); localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks() })

it('Comandas em consulta e Pedidos em operação não exibem encerramento, recebimento, abertura ou identificação', () => {
  localStorage.setItem('lb-confirmation:tab-customer:scoped-operator-test:tab-test', JSON.stringify({ operationId: 'pending-fixture', customerId: null, expectedVersion: 1 }))
  const fetch = server()
  mount(<><TabSettlement tab={tab()} /><TabSettlement tab={tab({ payable: 10, due: 10 })} /><TabCustomerIdentification tab={tab()} /><OpenTabForm /><SaleDestination locked={false} hasDraft /></>, actor(['bar.tabs', 'bar.orders'], ['bar.orders']))
  expect(screen.queryByRole('button', { name: 'Encerrar comanda' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /Receber restante/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Abrir comanda' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Identificar cliente|Salvar identificação|Conferir identificação/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Escolher uma comanda' })).not.toBeInTheDocument()
  expect(screen.queryByRole('group', { name: /Cliente da comanda/ })).not.toBeInTheDocument()
  expect(fetch).not.toHaveBeenCalled()
})

it('Receber sem Comandas oferece recebimento e encerramento sem links ou alterações de outras áreas', async () => {
  const fetch = server()
  mount(<><section data-testid="paid"><TabSettlement tab={tab()} /></section><section data-testid="due"><TabSettlement tab={tab({ due: 10, payable: 10, pending: 5 })} /></section><TabCustomerIdentification tab={tab()} /><OpenTabForm /><SaleDestination locked={false} hasDraft={false} /></>, actor(['bar.receive'], ['bar.receive']))
  expect(within(screen.getByTestId('due')).getByRole('link', { name: /Receber restante/ })).toHaveAttribute('href', '/atendimento/receber/tab-test')
  expect(screen.queryByRole('link', { name: 'Conferir pendências' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Identificar cliente|Abrir comanda|Escolher uma comanda/ })).not.toBeInTheDocument()
  fireEvent.click(within(screen.getByTestId('paid')).getByRole('button', { name: 'Encerrar comanda' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar encerramento' }))
  await screen.findByText('Comanda encerrada.')
  expect(fetch.mock.calls.filter(([input, init]) => String(input).endsWith('/close') && init?.method === 'POST')).toHaveLength(1)
})

it('operar Comandas permite abrir e identificar sem oferecer inclusão de produtos ou recebimento', async () => {
  const fetch = server()
  mount(<><TabSettlement tab={tab({ due: 10, payable: 10 })} /><TabCustomerIdentification tab={tab()} /><OpenTabForm /></>, actor(['bar.tabs'], ['bar.tabs']))
  expect(screen.getByRole('button', { name: 'Identificar cliente (opcional)' })).toBeEnabled()
  expect(screen.queryByRole('link', { name: /Receber restante/ })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Abrir comanda' }))
  const submit = screen.getByRole('button', { name: 'Abrir sem vínculo financeiro' })
  await waitFor(() => expect(submit).toBeEnabled())
  expect(screen.queryByRole('button', { name: 'Abrir e adicionar produtos' })).not.toBeInTheDocument()
  fireEvent.click(submit)
  await waitFor(() => expect(screen.getByTestId('route')).toHaveTextContent('/atendimento/comandas/tab-test'))
  const writes = fetch.mock.calls.filter(([, init]) => init?.method === 'POST')
  expect(writes).toHaveLength(1)
  expect(JSON.parse(String(writes[0][1]?.body))).toMatchObject({ mode: 'Tab' })
})

it('Vender sem o menu Comandas continua no destino de venda permitido após abrir uma comanda', async () => {
  server(); mount(<OpenTabForm />, actor(['bar.sell'], ['bar.sell']))
  fireEvent.click(screen.getByRole('button', { name: 'Abrir comanda' }))
  const submit = screen.getByRole('button', { name: 'Abrir sem vínculo financeiro' })
  await waitFor(() => expect(submit).toBeEnabled())
  fireEvent.click(submit)
  await waitFor(() => expect(screen.getByTestId('route')).toHaveTextContent('/atendimento/vender?comanda=tab-test'))
})

it('Vender pode selecionar uma comanda sem ganhar acesso ao menu de consulta', async () => {
  server(); mount(<SaleDestination locked={false} hasDraft={false} />, actor(['bar.sell'], ['bar.sell']))
  fireEvent.click(screen.getByRole('button', { name: 'Escolher uma comanda' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Comanda 10 - Visitante teste' }))
  fireEvent.click(screen.getByRole('button', { name: 'Usar esta comanda' }))
  expect(screen.getByTestId('route')).toHaveTextContent('/atendimento/vender?comanda=tab-test')
})

it.each([
  { actions: ['bar.orders'], visible: false },
  { actions: ['bar.tabs'], visible: true },
])('QR da comanda depende de operar Comandas ou Vender, sem confundir com Pedidos ($actions)', async ({ actions, visible }) => {
  server(); mount(<Routes><Route path="/atendimento/comandas/:tabId" element={<TabDetailsPage />} /></Routes>, actor(['bar.tabs', 'bar.orders'], actions), '/atendimento/comandas/tab-test')
  await screen.findByRole('heading', { name: 'Comanda 10 - Visitante teste' })
  if (visible) { fireEvent.click(screen.getByText('Acesso do cliente', { selector: 'summary' })); expect(screen.getByRole('button', { name: 'Gerar QR Code' })).toBeVisible() }
  else expect(screen.queryByText('Acesso do cliente', { selector: 'summary' })).not.toBeInTheDocument()
})

it.each(['bar.sell', 'bar.receive'])('a lista de comandas mantém somente Detalhes (%s)', async action => {
  server(tab({ due: 10, payable: 10 })); mount(<TabsPage />, actor(['bar.tabs', action], [action]))
  expect(await screen.findByRole('link', { name: 'Detalhes da Comanda 10 - Visitante teste' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Adicionar produtos à comanda 10' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Receber comanda 10' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Abrir comanda' })).not.toBeInTheDocument()
})

it('somente Receber mantém o comprovante sem atalhos para Nova venda ou Comandas', async () => {
  server(tab({ payments: [{ id: 'payment-test', tabId: 'tab-test', method: 'TerminalManual', terminalType: 'Debit', amount: 10, tendered: 10, change: 0, state: 'Approved', operationId: 'payment-operation-fixture', createdAtUtc: '2026-11-04T12:00:00Z', refunded: 0, refundPending: 0, fee: null }] }))
  mount(<Routes><Route path="/atendimento/comprovante/:tabId/:paymentId" element={<ReceiptPage />} /></Routes>, actor(['bar.receive'], ['bar.receive']), '/atendimento/comprovante/tab-test/payment-test')
  await screen.findByText('Valor recebido')
  expect(screen.queryByRole('link', { name: 'Nova venda' })).not.toBeInTheDocument()
  expect(screen.getAllByRole('link').every(link => !link.getAttribute('href')?.startsWith('/atendimento/comandas'))).toBe(true)
  expect(screen.getByRole('link', { name: /Voltar/ })).toHaveAttribute('href', '/atendimento/receber')
})

it('somente Receber orienta pedir liberação de caixa e não oferece o menu Caixa', async () => {
  server(tab({ due: 10, payable: 10 })); mount(<Routes><Route path="/atendimento/receber/:tabId" element={<ReceivePage />} /></Routes>, actor(['bar.receive'], ['bar.receive']), '/atendimento/receber/tab-test')
  const cash = await screen.findByRole('button', { name: 'Dinheiro' }); await waitFor(() => expect(cash).toBeEnabled()); fireEvent.click(cash)
  expect(screen.getByText('Peça à gestão a liberação do seu caixa para receber em dinheiro.')).toBeVisible()
  expect(screen.queryByRole('link', { name: 'Abrir caixa' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Confirmar recebimento' })).toBeDisabled()
})

it('somente Receber volta para os recebimentos ao concluir o saldo sem abrir Comandas', async () => {
  server(); mount(<Routes><Route path="/atendimento/receber/:tabId" element={<ReceivePage />} /></Routes>, actor(['bar.receive'], ['bar.receive']), '/atendimento/receber/tab-test')
  expect(await screen.findByRole('link', { name: 'Ver comandas para receber' })).toHaveAttribute('href', '/atendimento/receber')
  expect(screen.queryByRole('link', { name: 'Voltar à comanda' })).not.toBeInTheDocument()
})

it('Vender sem Pedidos salva com deliver=false e não amplia acesso de entrega', async () => {
  const api = server(); mount(<SellPage />, actor(['bar.sell'], ['bar.sell']), '/atendimento/vender')
  fireEvent.click(await screen.findByRole('button', { name: /Adicionar Água por/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Conferir pedido' }))
  expect(screen.queryByRole('button', { name: /Entregar e receber|Adicionar e entregar/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Enviar para preparo' })).not.toBeInTheDocument()
  const send = screen.getByRole('button', { name: 'Salvar' }); await waitFor(() => expect(send).toBeEnabled()); fireEvent.click(send)
  await waitFor(() => expect(api.mock.calls.filter(([url, init]) => String(url).endsWith('/items') && init?.method === 'POST')).toHaveLength(1))
  const request = api.mock.calls.find(([url, init]) => String(url).endsWith('/items') && init?.method === 'POST')!
  expect(JSON.parse(String(request[1]?.body))).toMatchObject({ deliver: false })
})

it('Vendas históricas não oferece pagamento ou cancelamento para quem apenas consulta Comandas e opera Pedidos', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json([{ id: 'sale-test', state: 'Draft', total: 10, items: [] }]))
  mount(<BarSalesPage />, actor(['bar.tabs', 'bar.orders'], ['bar.orders']), '/bar/vendas')
  await screen.findByRole('button', { name: 'Imprimir comprovante' })
  expect(screen.queryByRole('button', { name: /Receber venda|Cancelar rascunho|Autorizar desconto|Autorizar cortesia|Registrar estorno/ })).not.toBeInTheDocument()
})
