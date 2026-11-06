import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../auth/authContext'
import type { AuthUser } from '../auth/types'
import { setAccessToken, setCsrfToken } from '../../lib/http'
import { TabDetailsPage } from './AttendancePages'
import { ITEM_REMOVAL_REASON, type PendingItemRemoval } from './ItemRemovalConfirmation'
import type { Tab, TabItem } from './api'

const owner: AuthUser = { id: 'owner-test', name: 'Gestor teste', email: 'gestor@example.invalid', roles: ['Manager'], permissions: [] }
const attendant: AuthUser = { id: 'attendant-test', name: 'Atendente teste', email: 'atendente@example.invalid', roles: ['Operations'], permissions: ['bar:sales:read', 'bar:sales:operate'] }
const createdAtUtc = '2026-11-05T12:00:00Z'
const item = (state = 'Requested', id = 'item-test'): TabItem => ({ id, tabId: 'tab-test', productId: 'product-test', name: id === 'item-test' ? 'Água teste' : 'Suco teste', quantity: 1, unitPrice: 5, total: 5, state, source: 'Client', createdAtUtc, allowedActions: state === 'Requested' ? ['accept', 'reject'] : state === 'Accepted' ? ['fulfill', 'reverse'] : state === 'Fulfilled' ? ['reverse'] : [] })
const tab = (items = [item()]): Tab => ({ id: 'tab-test', version: 2, number: 1, name: 'Mesa teste', mode: 'Tab', state: 'Open', locationId: 'bar-test', actorId: owner.id, total: 5, due: 5, payable: 5, paid: 0, pending: 0, createdAtUtc, items, payments: [], history: [], allowedActions: ['cancel'] })
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
type Server = { tab: Tab; post?: (path: string, body: Record<string, unknown>) => Response | Promise<Response> }
function server(state: Server) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = new URL(String(input), 'https://example.invalid').pathname
    if (init?.method === 'POST') {
      if (!state.post) throw new Error('Nenhuma operação era esperada.')
      return state.post(path, JSON.parse(String(init.body)))
    }
    if (path.endsWith('/tabs/tab-test')) return json(state.tab)
    throw new Error(`Consulta inesperada: ${path}`)
  })
}
const clients: QueryClient[] = []
function mount(initialUser = owner) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client)
  const view = (user: AuthUser) => {
    const auth: AuthContextValue = { user, isBootstrapping: false, signIn: async () => {}, signInWithGoogle: async () => {}, signOut: async () => {}, changePassword: async () => {}, completeFirstAccessWithGoogle: async () => {} }
    return <QueryClientProvider client={client}><AuthContext.Provider value={auth}><MemoryRouter initialEntries={['/atendimento/comandas/tab-test']}><Routes><Route path="/atendimento/comandas/:tabId" element={<TabDetailsPage />} /></Routes></MemoryRouter></AuthContext.Provider></QueryClientProvider>
  }
  const result = render(view(initialUser))
  return { client, changeUser: (user: AuthUser) => result.rerender(view(user)) }
}
function remove(current: Tab, body: Record<string, unknown>, action: 'reject' | 'reverse'): Tab {
  return { ...current, version: (current.version ?? 0) + 1, total: 0, due: 0, payable: 0,
    items: current.items.map(row => ({ ...row, state: action === 'reject' ? 'Rejected' : 'Reversed', reason: String(body.reason), allowedActions: [] })),
    history: [...current.history, { id: 'event-test', kind: action === 'reject' ? 'Rejected' : 'Reversed', itemId: current.items[0].id, amount: action === 'reverse' ? -5 : 0, actorId: owner.id, reason: String(body.reason), createdAtUtc }] }
}
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); setAccessToken(null); setCsrfToken(null) })
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); setAccessToken(null); setCsrfToken(null) })

it.each(['Requested', 'Accepted', 'Fulfilled'])('exclui item %s com uma confirmação e motivo automático, sem apagar o histórico', async stateName => {
  const action = stateName === 'Requested' ? 'reject' : 'reverse'
  const state: Server = { tab: tab([item(stateName)]) }
  state.post = (path, body) => { expect(path).toBe(`/api/v1/bar/tabs/tab-test/items/item-test/${action}`); state.tab = remove(state.tab, body, action); return json(state.tab) }
  const api = server(state); mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Excluir item' }))
  const confirm = screen.getByRole('button', { name: 'Confirmar exclusão' })
  expect(confirm).toBeEnabled(); expect(screen.queryByRole('textbox', { name: /Motivo/ })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Manter item' })).toHaveFocus()
  if (action === 'reverse') expect(screen.getByText(/Produtos entregues não voltam ao estoque/)).toBeInTheDocument()
  act(() => { fireEvent.submit(confirm.closest('form')!); fireEvent.submit(confirm.closest('form')!) })
  expect(await screen.findByText('Item excluído. Histórico preservado.')).toBeInTheDocument()
  const writes = api.mock.calls.filter(([, init]) => init?.method === 'POST')
  expect(writes).toHaveLength(1)
  expect(JSON.parse(String(writes[0][1]?.body))).toEqual({ operationId: expect.any(String), reason: ITEM_REMOVAL_REASON, ...(action === 'reverse' ? { returnStock: false } : {}) })
  expect(state.tab.items[0].id).toBe('item-test'); expect(state.tab.history).toHaveLength(1)
  expect(localStorage.getItem(`lb-confirmation:tab-item-removal-v1:${owner.id}:tab-test`)).toBeNull()
})

it('manter o item não envia operação e devolve o foco', async () => {
  const api = server({ tab: tab() }); mount()
  const open = await screen.findByRole('button', { name: 'Excluir item' }); fireEvent.click(open)
  fireEvent.click(screen.getByRole('button', { name: 'Manter item' }))
  expect(open).toHaveFocus(); expect(screen.queryByRole('button', { name: 'Confirmar exclusão' })).not.toBeInTheDocument()
  expect(api.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
})

it.each(['Accepted', 'Fulfilled'])('Atendente não recebe exclusão de consumo %s mesmo se uma resposta trouxer essa ação', async stateName => {
  const api = server({ tab: tab([item(stateName)]) }); mount(attendant)
  await screen.findByText('1 × Água teste')
  expect(screen.queryByRole('button', { name: 'Excluir item' })).not.toBeInTheDocument()
  expect(api.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
})

it('Atendente exclui pedido ainda não aceito, respeitando a ação autorizada', async () => {
  const state: Server = { tab: tab() }; state.post = (path, body) => { expect(path).toMatch(/\/reject$/); state.tab = remove(state.tab, body, 'reject'); return json(state.tab) }
  const api = server(state); mount(attendant)
  fireEvent.click(await screen.findByRole('button', { name: 'Excluir item' })); fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
  await screen.findByText('Item excluído. Histórico preservado.')
  expect(api.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
})

it('troca de permissão após abrir a confirmação impede o envio', async () => {
  const api = server({ tab: tab([item('Fulfilled')]) }); const { changeUser } = mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Excluir item' }))
  changeUser({ ...owner, roles: ['Operations'], permissions: ['bar:sales:read'] })
  expect(screen.queryByRole('button', { name: 'Confirmar exclusão' })).not.toBeInTheDocument()
  expect(api.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
})

it('resposta perdida preserva a mesma remoção após recarga, sem liberar outra alteração', async () => {
  let attempts = 0; const state: Server = { tab: tab([item('Fulfilled')]) }
  state.post = (_path, body) => { if (++attempts === 1) { state.tab = remove(state.tab, body, 'reverse'); return json({ detail: 'Resposta interrompida.' }, 503) } return json(state.tab) }
  const api = server(state); const { client } = mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Excluir item' })); fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
  await screen.findByRole('alert'); expect(screen.getByRole('button', { name: 'Consultar ou repetir exclusão' })).toBeEnabled()
  expect(screen.queryByRole('button', { name: 'Manter item' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Adicionar produtos' })).not.toBeInTheDocument()
  cleanup(); client.clear(); mount()
  const retry = await screen.findByRole('button', { name: 'Consultar ou repetir exclusão' }); fireEvent.click(retry)
  await screen.findByText('Item excluído. Histórico preservado.')
  const bodies = api.mock.calls.filter(([, init]) => init?.method === 'POST').map(([, init]) => JSON.parse(String(init?.body)))
  expect(bodies).toHaveLength(2); expect(bodies[1]).toEqual(bodies[0])
})

it('mantém a restrição financeira devolvida pelo servidor sem criar estorno ou retorno de estoque', async () => {
  const state: Server = { tab: { ...tab([item('Fulfilled')]), paid: 5, due: 0, payable: 0 }, post: () => json({ detail: 'Estorne o valor recebido antes de retirar o consumo.' }, 400) }
  const api = server(state); mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Excluir item' })); fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Estorne o valor recebido')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar exclusão' })).toBeEnabled())
  expect(screen.getByRole('button', { name: 'Manter item' })).toBeEnabled()
  const writes = api.mock.calls.filter(([, init]) => init?.method === 'POST'); expect(writes).toHaveLength(1)
  expect(String(writes[0][0])).toMatch(/\/reverse$/); expect(JSON.parse(String(writes[0][1]?.body)).returnStock).toBe(false)
  expect(state.tab.paid).toBe(5); expect(state.tab.items[0].state).toBe('Fulfilled')
})

it('falha de armazenamento interrompe a exclusão antes do envio', async () => {
  const api = server({ tab: tab() }); mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Excluir item' }))
  const original = Storage.prototype.setItem
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key.startsWith('lb-confirmation:tab-item-removal-v1:')) throw new Error('Armazenamento indisponível')
    return original.call(this, key, value)
  })
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível guardar esta confirmação')
  expect(api.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
})

it('cancelar a comanda inteira continua exigindo seu motivo', async () => {
  const api = server({ tab: tab() }); mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Cancelar comanda' }))
  expect(screen.getByLabelText('Motivo do cancelamento')).toBeRequired()
  expect(screen.getByRole('button', { name: 'Confirmar cancelamento' })).toBeDisabled()
  expect(api.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
})

it('não reutiliza uma remoção pendente de outra conta', async () => {
  const pending: PendingItemRemoval = { operationId: 'old-user-operation', action: 'reverse', reason: ITEM_REMOVAL_REASON, item: item('Fulfilled') }
  localStorage.setItem('lb-confirmation:tab-item-removal-v1:other-user:tab-test', JSON.stringify(pending))
  const api = server({ tab: tab([item('Fulfilled')]) }); mount()
  await screen.findByRole('button', { name: 'Excluir item' })
  expect(screen.queryByRole('button', { name: 'Consultar ou repetir exclusão' })).not.toBeInTheDocument()
  expect(api.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
})

it.each([
  ['accept', 'Requested', 'Accepted', 'Aceitar'],
  ['fulfill', 'Accepted', 'Fulfilled', 'Entregar'],
])('preserva UUID e payload legado ao repetir %s após falha', async (action, initial, next, label) => {
  const legacyId = '11111111-1111-4111-8111-111111111111'
  localStorage.setItem(`lb-operation:${owner.id}:tab-test:item-test:${action}`, legacyId)
  let attempts = 0; const state: Server = { tab: tab([item(initial)]) }
  state.post = (path, body) => {
    expect(path).toBe(`/api/v1/bar/tabs/tab-test/items/item-test/${action}`)
    if (++attempts === 1) return json({ detail: 'Resposta interrompida.' }, 503)
    state.tab = { ...state.tab, items: [item(next)] }; return json(state.tab)
  }
  const api = server(state); mount()
  fireEvent.click(await screen.findByRole('button', { name: label }))
  await screen.findByRole('alert')
  const retry = screen.getByRole('button', { name: label }); await waitFor(() => expect(retry).toBeEnabled()); fireEvent.click(retry)
  await screen.findByText('Operação confirmada.')
  const bodies = api.mock.calls.filter(([, init]) => init?.method === 'POST').map(([, init]) => JSON.parse(String(init?.body)))
  expect(bodies).toEqual([{ operationId: legacyId, reason: '' }, { operationId: legacyId, reason: '' }])
})

it('explica o bloqueio da exclusão pendente quando a supervisão é revogada e preserva a tentativa', async () => {
  let attempts = 0; const state: Server = { tab: tab([item('Fulfilled')]) }
  state.post = (_path, body) => { if (++attempts === 1) return json({ detail: 'Resposta interrompida.' }, 503); state.tab = remove(state.tab, body, 'reverse'); return json(state.tab) }
  const api = server(state); const { changeUser } = mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Excluir item' })); fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
  await screen.findByRole('alert'); changeUser({ ...owner, roles: ['Operations'], permissions: ['bar:sales:read', 'bar:sales:operate'] })
  expect(screen.getByText('Seu acesso não permite confirmar a exclusão pendente. Peça ajuda à gestão.')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Consultar ou repetir exclusão' })).not.toBeInTheDocument()
  expect(localStorage.getItem(`lb-confirmation:tab-item-removal-v1:${owner.id}:tab-test`)).not.toBeNull()
  expect(api.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
  changeUser(owner); fireEvent.click(screen.getByRole('button', { name: 'Consultar ou repetir exclusão' }))
  await screen.findByText('Item excluído. Histórico preservado.')
  const bodies = api.mock.calls.filter(([, init]) => init?.method === 'POST').map(([, init]) => JSON.parse(String(init?.body)))
  expect(bodies).toHaveLength(2); expect(bodies[1]).toEqual(bodies[0])
})
