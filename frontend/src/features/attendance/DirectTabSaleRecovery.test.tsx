import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../auth/authContext'
import { testWebLocks } from '../../test/webLocks'
import { DirectTabSale } from './DirectTabSale'
import { directSalesAdmissionLock, directSalesKey, directSalesRequestTimeout, directSalesRetryDelays, readDirectSales } from './useDirectSales'
import type { CatalogItem, Tab } from './api'

const tabId = 'tab-recovery'
const owner = 'operator-recovery'
const key = directSalesKey(owner, tabId)
const now = '2026-11-25T20:00:00Z'
const water: CatalogItem = { id: 'water', name: 'Água', shortName: 'Água', categoryId: 'drinks', categoryName: 'Bebidas', salePrice: 5, favorite: false, displayOrder: 1, available: 0, prepared: false }
const juice: CatalogItem = { ...water, id: 'juice', name: 'Suco', shortName: 'Suco', salePrice: 7, displayOrder: 2 }
const auth: AuthContextValue = { user: { id: owner, name: 'Operador teste', email: 'operator@example.invalid', roles: ['Operations'], permissions: ['bar:sales:operate', 'bar:sales:read'] }, isBootstrapping: false, signIn: async () => {}, signInWithGoogle: async () => {}, signOut: async () => {}, changePassword: async () => {}, completeFirstAccessWithGoogle: async () => {} }
const clients: QueryClient[] = []
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
type Body = { operationId: string; items: { productId: string; quantity: number }[]; expectedUnitPrice: number }
function server(post?: (body: Body, commit: () => Response, init: RequestInit) => Response | Promise<Response>) {
  let tab: Tab = { id: tabId, version: 1, number: 42, name: 'Pessoa teste', state: 'Open', mode: 'Tab', locationId: 'bar', actorId: owner, total: 0, due: 0, paid: 0, pending: 0, payable: 0, createdAtUtc: now, items: [], payments: [], history: [], allowedActions: [] }
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = String(input)
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as Body
      const commit = () => {
        const product = body.items[0].productId === water.id ? water : juice
        if (!tab.items.some(row => row.id === body.operationId)) tab = { ...tab, version: tab.version! + 1, total: tab.total + product.salePrice, due: tab.due + product.salePrice, payable: tab.payable + product.salePrice,
          items: [...tab.items, { id: body.operationId, tabId, productId: product.id, name: product.name, quantity: 1, unitPrice: product.salePrice, total: product.salePrice, state: 'Fulfilled', source: 'Attendant', createdAtUtc: now, allowedActions: [] }] }
        return json(tab)
      }
      return post ? post(body, commit, init) : commit()
    }
    if (path.includes('/catalog')) return json([water, juice])
    if (path.endsWith(`/tabs/${tabId}`)) return json(tab)
    if (path.includes('/tabs?')) return json({ items: [], total: 0 })
    throw new Error(`Unexpected ${path}`)
  })
  return { fetch, get tab() { return tab }, get posts() { return fetch.mock.calls.filter(([, init]) => init?.method === 'POST').map(([, init]) => JSON.parse(String(init!.body)) as Body) } }
}
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client)
  return render(<QueryClientProvider client={client}><AuthContext.Provider value={auth}><MemoryRouter><DirectTabSale tabId={tabId} /></MemoryRouter></AuthContext.Provider></QueryClientProvider>)
}
async function buttons() {
  const addWater = await screen.findByRole('button', { name: /Adicionar Água por/ })
  const addJuice = await screen.findByRole('button', { name: /Adicionar Suco por/ })
  await waitFor(() => expect(addJuice).toBeEnabled())
  return { addWater, addJuice }
}
const advance = (milliseconds: number) => act(async () => { await vi.advanceTimersByTimeAsync(milliseconds) })
beforeEach(() => { Object.defineProperty(navigator, 'locks', { configurable: true, value: testWebLocks() }); Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }); localStorage.clear(); sessionStorage.clear() })
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.useRealTimers(); vi.restoreAllMocks() })

it('isola um conflito persistente e permite outros produtos e navegação, mantendo a conta em conferência', async () => {
  const api = server((body, commit) => body.items[0].productId === water.id
    ? json({ detail: 'Gravação em conferência.', code: 'direct_sale_write_failed', retryable: false, outcome: 'unconfirmed', traceId: 'trace-fixture' }, 409) : commit())
  mount(); const { addWater, addJuice } = await buttons()
  fireEvent.click(addWater)
  await screen.findByText('Gravação em conferência.')
  expect(addWater).toBeDisabled(); expect(addJuice).toBeEnabled()
  expect(screen.getByText('Saldo em conferência')).toBeInTheDocument()
  expect(screen.getByText('Referência para suporte: trace-fixture')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Trocar comanda' })).toBeEnabled()
  expect(screen.getByRole('link', { name: 'Voltar' })).toBeInTheDocument()
  fireEvent.click(addJuice)
  await screen.findByText('Suco adicionado à comanda.')
  expect(api.tab.total).toBe(7)
  expect(readDirectSales(key).entries.map(row => row.productId)).toEqual([water.id])
  expect(screen.queryByRole('link', { name: /Receber/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Remover Água não registrado/ })).not.toBeInTheDocument()
  vi.useFakeTimers(); await advance(60_000)
  expect(api.posts).toHaveLength(2)
})

it('recupera resposta perdida automaticamente com o mesmo payload e sem unidade extra', async () => {
  let calls = 0
  const api = server((_body, commit) => { const result = commit(); return ++calls === 1 ? json({ detail: 'Resposta perdida' }, 503) : result })
  mount(); const { addWater } = await buttons(); vi.useFakeTimers()
  fireEvent.click(addWater); await advance(0)
  expect(api.tab.total).toBe(5); expect(api.posts).toHaveLength(1)
  expect(readDirectSales(key).entries[0].state).toBe('retry')
  await advance(directSalesRetryDelays[0])
  expect(api.posts).toHaveLength(2); expect(api.posts[1]).toEqual(api.posts[0])
  expect(api.tab.items).toHaveLength(1); expect(api.tab.total).toBe(5)
  expect(readDirectSales(key).entries).toHaveLength(0)
  await advance(20_000); expect(api.posts).toHaveLength(2)
})

it('limita um 409 legado a três tentativas e não reinicia o ciclo ao recarregar', async () => {
  const api = server(() => json({ detail: 'Conflito legado' }, 409))
  let view = mount(); const { addWater } = await buttons(); vi.useFakeTimers()
  fireEvent.click(addWater); await advance(0)
  await advance(directSalesRetryDelays[0]); await advance(directSalesRetryDelays[1])
  expect(api.posts).toHaveLength(3)
  expect(new Set(api.posts.map(row => row.operationId)).size).toBe(1)
  expect(readDirectSales(key).entries[0]).toMatchObject({ state: 'attention', attempts: 3, uncertain: true })
  await advance(60_000); expect(api.posts).toHaveLength(3)
  view.unmount(); view = mount(); await advance(0); await advance(60_000)
  expect(api.posts).toHaveLength(3)
  fireEvent.click(screen.getByRole('button', { name: 'Retomar registros' })); await advance(0)
  expect(api.posts).toHaveLength(4); expect(api.posts[3]).toEqual(api.posts[0])
  view.unmount()
})

it('preserva o limite quando a tela é desmontada durante a terceira tentativa', async () => {
  let calls = 0
  let lastSignal: AbortSignal | null | undefined
  const api = server((_body, _commit, init) => {
    if (++calls < 3) return json({ detail: 'Conflito legado' }, 409)
    lastSignal = init.signal
    return new Promise<Response>(() => {})
  })
  let view = mount(); const { addWater } = await buttons(); vi.useFakeTimers()
  fireEvent.click(addWater); await advance(0)
  await advance(directSalesRetryDelays[0]); await advance(directSalesRetryDelays[1])
  expect(api.posts).toHaveLength(3)
  // The persisted in-flight row still carries the previous retry state.
  expect(JSON.parse(localStorage.getItem(key)!).entries[0]).toMatchObject({ attempts: 3, state: 'retry' })
  view.unmount(); expect(lastSignal?.aborted).toBe(true)
  view = mount(); await advance(0); await advance(60_000)
  expect(api.posts).toHaveLength(3)
  expect(readDirectSales(key).entries[0]).toMatchObject({ attempts: 3, state: 'attention', uncertain: true })
  expect(screen.getByRole('button', { name: /Adicionar Suco por/ })).toBeEnabled()
  view.unmount()
})

it('preserva uma fila pausada anterior à atualização e libera outro produto sem reenviar o item incerto', async () => {
  const operationId = crypto.randomUUID()
  localStorage.setItem(key, JSON.stringify({ version: 1, paused: true, error: 'Conflito legado', entries: [{ operationId, productId: water.id, name: water.name, price: 5, attempted: true }] }))
  const api = server(); mount(); const { addWater, addJuice } = await buttons()
  expect(addWater).toBeDisabled(); expect(api.posts).toHaveLength(0)
  fireEvent.click(addJuice); await screen.findByText('Suco adicionado à comanda.')
  expect(readDirectSales(key).entries[0]).toMatchObject({ operationId, state: 'attention', uncertain: true })
  expect(api.posts).toHaveLength(1)
})

it('protege o produto incerto de outra conta sem reenviar a fila alheia ou bloquear os demais produtos', async () => {
  const foreignKey = directSalesKey('previous-operator', tabId)
  const foreignQueue = JSON.stringify({ version: 1, paused: false, entries: [{ operationId: crypto.randomUUID(), productId: water.id, name: water.name, price: 5, attempted: true }] })
  localStorage.setItem(foreignKey, foreignQueue)
  const api = server(); mount(); const { addWater, addJuice } = await buttons()
  expect(addWater).toBeDisabled(); expect(addJuice).toBeEnabled(); expect(api.posts).toHaveLength(0)
  fireEvent.click(addJuice); await screen.findByText('Suco adicionado à comanda.')
  expect(api.posts).toHaveLength(1); expect(api.posts[0].items[0].productId).toBe(juice.id)
  expect(localStorage.getItem(foreignKey)).toBe(foreignQueue)
  expect(readDirectSales(key).entries).toHaveLength(0)
  expect(screen.queryByRole('link', { name: /Receber/ })).not.toBeInTheDocument()
  expect(screen.getByText('Saldo em conferência')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Trocar comanda' })).toBeEnabled()
})

it('revalida pendências de outra conta ao guardar o toque mesmo com a tela ainda desatualizada', async () => {
  const api = server(); mount(); const { addWater, addJuice } = await buttons()
  const foreignKey = directSalesKey('previous-operator', tabId)
  const foreignQueue = JSON.stringify({ version: 1, paused: true, error: 'Conflito anterior', entries: [{ operationId: crypto.randomUUID(), productId: water.id, name: water.name, price: 5, attempted: true }] })
  localStorage.setItem(foreignKey, foreignQueue)
  expect(addWater).toBeEnabled()
  fireEvent.click(addWater)
  await screen.findByText('Este produto já tem um lançamento em conferência nesta comanda. Retome o registro original.')
  expect(api.posts).toHaveLength(0); expect(readDirectSales(key).entries).toHaveLength(0)
  fireEvent.click(addJuice); await screen.findByText('Suco adicionado à comanda.')
  expect(api.posts).toHaveLength(1); expect(api.posts[0].items[0].productId).toBe(juice.id)
  expect(localStorage.getItem(foreignKey)).toBe(foreignQueue)
})

it('libera o envio dos outros produtos após timeout preservando a tentativa sem confirmação', async () => {
  let stalledSignal: AbortSignal | null | undefined
  const api = server((body, commit, init) => {
    if (body.items[0].productId !== water.id) return commit()
    stalledSignal = init.signal
    return new Promise<Response>(() => {})
  })
  mount(); const { addWater, addJuice } = await buttons(); vi.useFakeTimers()
  fireEvent.click(addWater); await advance(0)
  expect(api.posts).toHaveLength(1)
  await advance(directSalesRequestTimeout)
  expect(stalledSignal?.aborted).toBe(true)
  expect(readDirectSales(key).entries[0]).toMatchObject({ state: 'retry', uncertain: true })
  fireEvent.click(addJuice); await advance(0)
  expect(api.posts).toHaveLength(2); expect(api.tab.total).toBe(7)
  expect(readDirectSales(key).entries).toHaveLength(1)
})

it('não transforma uma tentativa incerta em removível ao receber uma recusa posterior', async () => {
  let count = 0
  const api = server(() => ++count === 1 ? json({ detail: 'Resposta indisponível' }, 503) : json({ detail: 'Confira o preço' }, 400))
  mount(); const { addWater } = await buttons(); vi.useFakeTimers()
  fireEvent.click(addWater); await advance(0); await advance(directSalesRetryDelays[0])
  expect(api.posts).toHaveLength(2)
  expect(readDirectSales(key).entries[0]).toMatchObject({ state: 'attention', uncertain: true })
  expect(screen.queryByRole('button', { name: /Remover Água não registrado/ })).not.toBeInTheDocument()
})

it('não guarda um toque para executar depois de uma cobrança concorrente', async () => {
  const api = server(); mount(); const { addWater } = await buttons()
  let release!: () => void
  let acquired!: () => void
  const held = new Promise<void>(resolve => { acquired = resolve })
  const financial = navigator.locks.request(directSalesAdmissionLock(tabId), async () => { acquired(); await new Promise<void>(resolve => { release = resolve }) })
  await held
  fireEvent.click(addWater)
  await screen.findByText('Recebimento em andamento nesta comanda. Aguarde a confirmação antes de lançar.')
  expect(api.posts).toHaveLength(0); expect(readDirectSales(key).entries).toHaveLength(0)
  await act(async () => { release(); await financial })
  expect(api.posts).toHaveLength(0)
  fireEvent.click(addWater); await screen.findByText('Água adicionado à comanda.')
  expect(api.posts).toHaveLength(1)
})

it('preserva bloqueio por falta de acesso sem reenviar automaticamente ao reconectar', async () => {
  const api = server(() => json({ detail: 'Acesso restrito' }, 403))
  mount(); const { addWater, addJuice } = await buttons()
  fireEvent.click(addWater); await screen.findByText('Acesso restrito')
  expect(addJuice).toBeDisabled()
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false }); act(() => window.dispatchEvent(new Event('offline')))
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }); act(() => window.dispatchEvent(new Event('online')))
  expect(api.posts).toHaveLength(1)
})

it('retoma uma tentativa agendada ao reconectar sem criar outro lançamento', async () => {
  let count = 0
  const api = server((_body, commit) => ++count === 1 ? json({ detail: 'Conexão indisponível' }, 503) : commit())
  mount(); const { addWater } = await buttons(); vi.useFakeTimers()
  fireEvent.click(addWater); await advance(0)
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false }); act(() => window.dispatchEvent(new Event('offline')))
  await advance(10_000); expect(api.posts).toHaveLength(1)
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }); act(() => window.dispatchEvent(new Event('online')))
  await advance(0)
  expect(api.posts).toHaveLength(2); expect(api.posts[1]).toEqual(api.posts[0]); expect(api.tab.total).toBe(5)
})
