import type { ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { testWebLocks } from '../../test/webLocks'
import { setAccessToken, setCsrfToken } from '../../lib/http'
import { AuthContext, type AuthContextValue } from '../auth/authContext'
import { ReceivePage } from './PaymentPages'
import { TabDetailsPage } from './AttendancePages'
import { OrdersPage } from './OrdersPage'
import type { Tab, TabPayment } from './api'
import { directSalesAdmissionLock, directSalesEventName, directSalesKey, directSalesSendLock, useDirectSales } from './useDirectSales'
import { directSalesPendingMessage, readDirectSalesPending, withDirectPaymentRecovery, withDirectSalesSettled } from './directSalesPending'

const now = '2026-11-25T20:00:00Z'
const operator = 'operator-a'
const otherOperator = 'operator-b'
const tabId = 'tab-review'
const operationId = '11111111-1111-4111-8111-111111111111'
const product = { id: 'water', name: 'Água', shortName: 'Água', salePrice: 5, categoryId: 'drinks', categoryName: 'Bebidas', favorite: false, displayOrder: 1, available: 20, prepared: false }
const tab = (changes: Partial<Tab> = {}): Tab => ({ id: tabId, version: 1, number: 42, name: 'Visitante', state: 'Open', mode: 'Tab', locationId: 'bar', actorId: operator, total: 5, paid: 0, pending: 0, due: 5, payable: 5, createdAtUtc: now, items: [], payments: [], history: [], allowedActions: ['close', 'cancel'], ...changes })
const payment = (operation = operationId): TabPayment => ({ id: 'payment-review', tabId, operationId: operation, method: 'TerminalManual', terminalType: 'Debit', amount: 5, tendered: 5, change: 0, state: 'Approved', refunded: 0, refundPending: 0, fee: 0, createdAtUtc: now })
const auth: AuthContextValue = { user: { id: operator, name: 'Operador', email: 'operator@example.invalid', roles: ['Manager'], permissions: [] }, isBootstrapping: false, signIn: async () => {}, signInWithGoogle: async () => {}, signOut: async () => {}, changePassword: async () => {}, completeFirstAccessWithGoogle: async () => {} }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const clients: QueryClient[] = []

function pending(kind: 'add' | 'remove' = 'add', owner = otherOperator, destination = tabId) {
  const key = directSalesKey(owner, destination, kind)
  const entry = { operationId, productId: 'water', name: 'Água', price: 5, attempted: true, ...(kind === 'remove' ? { itemId: 'item-water', returnStock: true, reason: 'Correção de exemplo', action: 'remove-unit' } : {}) }
  localStorage.setItem(key, JSON.stringify({ version: 1, paused: true, entries: [entry] }))
  return key
}

function server(current = tab(), post?: (path: string, init: RequestInit) => Response | Promise<Response>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = String(input)
    if (init?.method === 'POST') return post ? post(path, init) : json(payment(JSON.parse(String(init.body)).operationId))
    if (path.endsWith('/cash/sessions')) return json([])
    if (path.includes('/tabs?')) return json({ items: [current], total: 1, page: 1, pageSize: 24 })
    if (path.includes('/catalog')) return json([product])
    return json(current)
  })
}

function mount(path = `/atendimento/receber/${tabId}`, extra?: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  clients.push(client)
  return render(<QueryClientProvider client={client}><AuthContext.Provider value={auth}><MemoryRouter initialEntries={[path]}>{extra}<Routes>
    <Route path="/atendimento/receber/:tabId" element={<ReceivePage />} />
    <Route path="/atendimento/comandas/:tabId" element={<TabDetailsPage />} />
    <Route path="/atendimento/pedidos" element={<OrdersPage />} />
    <Route path="*" element={<p>Outra comanda</p>} />
  </Routes></MemoryRouter></AuthContext.Provider></QueryClientProvider>)
}

const writes = (api: ReturnType<typeof server>) => api.mock.calls.filter(([, init]) => init?.method === 'POST')
beforeEach(() => {
  Object.defineProperty(navigator, 'locks', { configurable: true, value: testWebLocks() })
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  localStorage.clear(); sessionStorage.clear(); setAccessToken(null); setCsrfToken(null)
})
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.useRealTimers() })

it('reads every local operator for this comanda without modifying or replaying their queues', () => {
  pending('add', operator, 'another-tab')
  expect(readDirectSalesPending(tabId, operator).blocked).toBe(false)
  const addKey = pending('add', operator)
  const removeKey = pending('remove', otherOperator)
  const before = [localStorage.getItem(addKey), localStorage.getItem(removeKey)]
  expect(readDirectSalesPending(tabId, operator)).toEqual({ blocked: true, own: true, other: true, removal: true, unreadable: false, productIds: ['water'] })
  expect([localStorage.getItem(addKey), localStorage.getItem(removeKey)]).toEqual(before)
  localStorage.setItem(removeKey, 'invalid-queue')
  expect(readDirectSalesPending(tabId, operator)).toMatchObject({ blocked: true, unreadable: true, removal: true })
  expect(localStorage.getItem(removeKey)).toBe('invalid-queue')
})

it('exposes only products under review across accounts, preserving ordinary rapid taps and other comandas', () => {
  const active = { operationId, productId: 'coffee', name: 'Café', price: 5, attempted: true }
  localStorage.setItem(directSalesKey(operator, tabId), JSON.stringify({ version: 1, paused: false, entries: [active] }))
  pending('add', otherOperator)
  localStorage.setItem(directSalesKey('operator-c', tabId), JSON.stringify({ version: 1, paused: true, entries: [{ ...active, productId: 'juice', state: 'rejected', uncertain: false }] }))
  pending('add', 'operator-d', 'another-tab')
  expect(readDirectSalesPending(tabId, operator).productIds).toEqual(['juice', 'water'])
  expect(readDirectSalesPending(tabId, 'new-operator').productIds).toEqual(['coffee', 'juice', 'water'])
  expect(localStorage.getItem(directSalesKey(operator, tabId))).toContain('coffee')
})

it.each(['add', 'remove'] as const)('a direct receive URL cannot charge while another operator has a pending %s', async kind => {
  pending(kind)
  const api = server(); mount()
  expect(await screen.findByRole('button', { name: 'Débito na maquininha' })).toBeDisabled()
  expect(screen.getByRole('status', { name: 'Consumo em conferência' })).toHaveTextContent('outra conta')
  expect(screen.getByRole('link', { name: 'Voltar' })).toBeInTheDocument()
  expect(writes(api)).toHaveLength(0)
})

it('blocks malformed queues without deleting them or creating a payment checkpoint', async () => {
  const key = directSalesKey(otherOperator, tabId)
  localStorage.setItem(key, '{broken')
  const api = server(); mount()
  expect(await screen.findByRole('button', { name: /^Receber tudo/ })).toBeDisabled()
  expect(screen.getByRole('status', { name: 'Consumo em conferência' })).toHaveTextContent('Não foi possível ler')
  expect(localStorage.getItem(key)).toBe('{broken')
  expect(localStorage.getItem(`lb-payment-v1:${operator}:${tabId}`)).toBeNull()
  expect(writes(api)).toHaveLength(0)
})

it('updates the receiving guard after cross-tab and local queue events', async () => {
  const key = pending(); server(); mount()
  const button = await screen.findByRole('button', { name: 'Débito na maquininha' })
  expect(button).toBeDisabled()
  act(() => { localStorage.removeItem(key); window.dispatchEvent(new StorageEvent('storage', { key })) })
  await waitFor(() => expect(button).toBeEnabled())
  act(() => { const ownKey = pending('add', operator); window.dispatchEvent(new CustomEvent(directSalesEventName, { detail: ownKey })) })
  expect(button).toBeDisabled()
  expect(screen.getByRole('link', { name: 'Retomar registros da comanda' })).toHaveAttribute('href', `/atendimento/vender?comanda=${tabId}`)
})

it('rechecks storage when payment is submitted before another tab event reaches the UI', async () => {
  const api = server(); mount()
  const method = await screen.findByRole('button', { name: 'Débito na maquininha' })
  await waitFor(() => expect(method).toBeEnabled()); fireEvent.click(method)
  const submit = screen.getByRole('button', { name: /^Aprovado na maquininha/ })
  await waitFor(() => expect(submit).toBeEnabled())
  pending()
  fireEvent.click(submit)
  expect(await screen.findByRole('alert')).toHaveTextContent(directSalesPendingMessage)
  expect(writes(api)).toHaveLength(0)
  expect(localStorage.getItem(`lb-payment-v1:${operator}:${tabId}`)).toBeNull()
})

it.each(['close', 'cancel'] as const)('rechecks a late queue before %s without creating a false cancellation checkpoint', async action => {
  const api = server(tab({ total: 0, due: 0, payable: 0 })); mount(`/atendimento/comandas/${tabId}`)
  const start = await screen.findByRole('button', { name: action === 'close' ? 'Encerrar comanda' : 'Cancelar comanda' })
  await waitFor(() => expect(start).toBeEnabled()); fireEvent.click(start)
  if (action === 'cancel') fireEvent.change(screen.getByLabelText('Motivo do cancelamento'), { target: { value: 'Pedido de exemplo duplicado' } })
  pending('remove')
  fireEvent.click(screen.getByRole('button', { name: action === 'close' ? 'Confirmar encerramento' : 'Confirmar cancelamento' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(directSalesPendingMessage)
  expect(writes(api)).toHaveLength(0)
  expect(localStorage.getItem(`lb-confirmation:tab-cancel:${operator}:${tabId}`)).toBeNull()
})

it('keeps manual payment recovery available with the original operation despite pending consumption', async () => {
  const input = { operationId, method: 'TerminalManual', terminalType: 'Debit', amount: 5, tendered: 5, terminalApproved: true, authorization: null }
  localStorage.setItem(`lb-payment-v1:${operator}:${tabId}`, JSON.stringify({ operationId, input }))
  pending()
  const api = server(); mount()
  const recover = await screen.findByRole('button', { name: 'Consultar ou repetir confirmação' })
  await waitFor(() => expect(recover).toBeEnabled()); fireEvent.click(recover)
  await waitFor(() => expect(writes(api)).toHaveLength(1))
  expect(JSON.parse(String(writes(api)[0][1]?.body))).toEqual(input)
  expect(localStorage.getItem(directSalesKey(otherOperator, tabId))).not.toBeNull()
})

it('rechecks after waiting for admission instead of closing over a stale empty snapshot', async () => {
  let release: () => void = () => {}
  const holder = navigator.locks.request(directSalesAdmissionLock(tabId), { mode: 'shared' }, () => new Promise<void>(resolve => { release = resolve }))
  await Promise.resolve()
  const work = vi.fn(async () => true)
  const financial = withDirectSalesSettled(tabId, work).catch(error => error)
  pending()
  release(); await holder
  expect(await financial).toHaveProperty('message', directSalesPendingMessage)
  expect(work).not.toHaveBeenCalled()
})

it.each([false, true])('a tap during a financial request is refused without becoming a late sale (recovery=%s)', async recovering => {
  let complete: () => void = () => {}
  const tapOwner = 'operator-c'
  if (recovering) {
    const input = { operationId, method: 'TerminalManual', terminalType: 'Debit', amount: 5, tendered: 5, terminalApproved: true, authorization: null }
    localStorage.setItem(`lb-payment-v1:${operator}:${tabId}`, JSON.stringify({ operationId, input }))
    pending()
  }
  const pendingBefore = localStorage.getItem(directSalesKey(otherOperator, tabId))
  const api = server(tab(), (_path, init) => new Promise(resolve => { complete = () => resolve(json(payment(JSON.parse(String(init.body)).operationId))) }))
  function Tap() {
    const sales = useDirectSales(tapOwner, tabId, { authorized: true, known: true, open: true, online: true, accepting: true })
    return <><button onClick={() => void sales.add({ ...product, id: 'juice', name: 'Suco', shortName: 'Suco' })}>Outro atendente toca</button><output aria-label="Mensagem do toque">{sales.notice || sales.message}</output></>
  }
  mount(undefined, <Tap />)
  if (recovering) {
    const recover = await screen.findByRole('button', { name: 'Consultar ou repetir confirmação' })
    await waitFor(() => expect(recover).toBeEnabled()); fireEvent.click(recover)
  } else {
    const method = await screen.findByRole('button', { name: 'Débito na maquininha' })
    await waitFor(() => expect(method).toBeEnabled()); fireEvent.click(method)
    fireEvent.click(screen.getByRole('button', { name: /^Aprovado na maquininha/ }))
  }
  await waitFor(() => expect(writes(api)).toHaveLength(1))
  fireEvent.click(screen.getByRole('button', { name: 'Outro atendente toca' }))
  await waitFor(() => expect(screen.getByRole('status', { name: 'Mensagem do toque' })).toHaveTextContent(/comanda|registro|aguarde/i))
  expect(localStorage.getItem(directSalesKey(tapOwner, tabId))).toBeNull()
  await act(async () => complete())
  expect(writes(api)).toHaveLength(1)
  expect(localStorage.getItem(directSalesKey(tapOwner, tabId))).toBeNull()
  expect(localStorage.getItem(directSalesKey(otherOperator, tabId))).toBe(pendingBefore)
})

it.each([false, true])('a slow payment aborts after 30 seconds, preserves its UUID and releases both locks (recovery=%s)', async recovering => {
  let signal: AbortSignal | undefined
  const api = server(tab(), (_path, init) => {
    signal = init.signal ?? undefined
    return new Promise((_resolve, reject) => signal!.addEventListener('abort', () => reject(new DOMException('Timeout', 'AbortError')), { once: true }))
  })
  if (recovering) {
    const input = { operationId, method: 'TerminalManual', terminalType: 'Debit', amount: 5, tendered: 5, terminalApproved: true, authorization: null }
    localStorage.setItem(`lb-payment-v1:${operator}:${tabId}`, JSON.stringify({ operationId, input }))
    pending()
  }
  mount()
  if (recovering) {
    const recover = await screen.findByRole('button', { name: 'Consultar ou repetir confirmação' })
    await waitFor(() => expect(recover).toBeEnabled())
    vi.useFakeTimers(); fireEvent.click(recover)
  } else {
    const method = await screen.findByRole('button', { name: 'Débito na maquininha' })
    await waitFor(() => expect(method).toBeEnabled()); fireEvent.click(method)
    vi.useFakeTimers(); fireEvent.click(screen.getByRole('button', { name: /^Aprovado na maquininha/ }))
  }
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  expect(writes(api)).toHaveLength(1)
  const before = localStorage.getItem(`lb-payment-v1:${operator}:${tabId}`)
  expect(before).not.toBeNull()
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
  expect(signal?.aborted).toBe(true)
  expect(localStorage.getItem(`lb-payment-v1:${operator}:${tabId}`)).toBe(before)
  expect(writes(api)).toHaveLength(1)
  expect(screen.getByRole('button', { name: 'Consultar ou repetir confirmação' })).toBeEnabled()
  await expect(withDirectPaymentRecovery(tabId, async () => 'released')).resolves.toBe('released')
})

it.each([['send', directSalesSendLock], ['admission', directSalesAdmissionLock]] as const)('expires while waiting for the %s lock without sending or storing a new payment', async (_name, lockKey) => {
  let release: () => void = () => {}
  const holder = navigator.locks.request(lockKey(tabId), () => new Promise<void>(resolve => { release = resolve }))
  await Promise.resolve()
  const api = server(); mount()
  const method = await screen.findByRole('button', { name: 'Débito na maquininha' })
  await waitFor(() => expect(method).toBeEnabled()); fireEvent.click(method)
  vi.useFakeTimers()
  fireEvent.click(screen.getByRole('button', { name: /^Aprovado na maquininha/ }))
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  expect(writes(api)).toHaveLength(0)
  expect(localStorage.getItem(`lb-payment-v1:${operator}:${tabId}`)).toBeNull()
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
  expect(screen.getByRole('alert')).toBeInTheDocument()
  expect(writes(api)).toHaveLength(0)
  expect(localStorage.getItem(`lb-payment-v1:${operator}:${tabId}`)).toBeNull()
  await act(async () => { release(); await holder; await vi.advanceTimersByTimeAsync(0) })
  expect(writes(api)).toHaveLength(0)
  await expect(withDirectPaymentRecovery(tabId, async () => 'released')).resolves.toBe('released')
})

it.each([['/atendimento/comandas/tab-review', 5], ['/atendimento/pedidos', 5], ['/atendimento/comandas/tab-review', 0], ['/atendimento/pedidos', 0]] as const)('blocks potentially closing delivery at %s despite a stale paid=%s snapshot', async (path, paid) => {
  const current = tab({ paid, due: 5 - paid, payable: 5 - paid, payments: paid ? [payment()] : [], items: [{ id: 'item-water', tabId, productId: 'water', name: 'Água', quantity: 1, unitPrice: 5, total: 5, state: 'Accepted', source: 'Attendant', createdAtUtc: now, allowedActions: ['fulfill'] }] })
  pending()
  const api = server(current); mount(path)
  const deliver = await screen.findByRole('button', { name: 'Entregar' })
  await waitFor(() => expect(deliver).toBeEnabled()); fireEvent.click(deliver)
  expect(await screen.findByRole('alert')).toHaveTextContent(directSalesPendingMessage)
  expect(writes(api)).toHaveLength(0)
})

it('still accepts an unpaid order while a separate direct entry needs confirmation', async () => {
  const current = tab({ items: [{ id: 'item-water', tabId, productId: 'water', name: 'Água', quantity: 1, unitPrice: 5, total: 5, state: 'Requested', source: 'Client', createdAtUtc: now, allowedActions: ['accept'] }] })
  pending()
  const api = server(current, () => json({ ...current, items: current.items.map(item => ({ ...item, state: 'Accepted' })) })); mount('/atendimento/pedidos')
  fireEvent.click(await screen.findByRole('button', { name: 'Aceitar' }))
  await waitFor(() => expect(writes(api)).toHaveLength(1))
  expect(String(writes(api)[0][0])).toContain('/accept')
})
