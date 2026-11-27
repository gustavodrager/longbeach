import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../auth/authContext'
import type { AuthUser } from '../auth/types'
import { setAccessToken, setCsrfToken } from '../../lib/http'
import { TabDetailsPage, TabsPage } from './AttendancePages'
import { ReceivePage } from './PaymentPages'
import { tabNameRequestTimeout } from './TabNameEditor'
import type { Tab } from './api'

const actor: AuthUser = { id: 'name-operator', name: 'Equipe teste', email: 'name@example.invalid', roles: ['Operations'], permissions: ['bar:sales:read', 'bar:sales:operate', 'bar:cash:operate'] }
const tab = (values: Partial<Tab> = {}): Tab => ({ id: 'tab-name', version: 1, number: 105, name: '', mode: 'Tab', state: 'Open', locationId: 'bar-name', actorId: actor.id, total: 10, paid: 0, pending: 0, due: 10, payable: 10, createdAtUtc: '2026-11-27T12:00:00Z', customer: null, items: [], payments: [], history: [], allowedActions: [], ...values })
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
type State = { tab: Tab; put?: (body: Record<string, unknown>) => Response | Promise<Response>; customerPut?: (body: Record<string, unknown>) => Response | Promise<Response>; get?: () => Response | Promise<Response>; lookup?: () => Response | Promise<Response> }
function server(state: State) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = String(input)
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>
      if (path === '/api/v1/bar/tabs/tab-name/customer' && state.customerPut) return state.customerPut(body)
      expect(path).toBe('/api/v1/bar/tabs/tab-name/name')
      if (state.put) return state.put(body)
      state.tab = { ...state.tab, name: String(body.name), version: state.tab.version! + 1 }
      return json(state.tab)
    }
    if (path.endsWith('/tabs/tab-name')) return state.get ? state.get() : json(state.tab)
    if (path.includes('/tabs?')) return json({ items: [state.tab], page: 1, pageSize: 24, total: 1 })
    if (path.endsWith('/config')) return json({ pixEnabled: false })
    if (path.endsWith('/cash/sessions')) return json([])
    if (path.includes('/customers/lookup?')) return state.lookup ? state.lookup() : json([])
    throw new Error(`Consulta inesperada: ${path}`)
  })
}
const clients: QueryClient[] = []
function mount(path = '/atendimento/comandas/tab-name', user = actor) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(cache)
  const auth: AuthContextValue = { user, isBootstrapping: false, signIn: async () => {}, signInWithGoogle: async () => {}, signOut: async () => {}, changePassword: async () => {}, completeFirstAccessWithGoogle: async () => {} }
  const content = (currentUser = user) => <QueryClientProvider client={cache}><AuthContext.Provider value={{ ...auth, user: currentUser }}><MemoryRouter initialEntries={[path]}><Routes><Route path="/atendimento/comandas/:tabId" element={<TabDetailsPage />} /><Route path="/atendimento/comandas" element={<TabsPage />} /><Route path="/atendimento/receber/:tabId" element={<ReceivePage />} /></Routes></MemoryRouter></AuthContext.Provider></QueryClientProvider>
  const view = render(content())
  return { ...view, cache, changeUser: (currentUser: AuthUser) => view.rerender(content(currentUser)) }
}
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); setAccessToken(null); setCsrfToken(null); Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }) })
afterEach(() => { cleanup(); clients.splice(0).forEach(cache => cache.clear()); vi.restoreAllMocks(); vi.useRealTimers() })

it.each(['', 'Visitante'])('salva nome livre depois de abrir comanda anônima (%j), inclusive após recarregar e na lista', async name => {
  const state: State = { tab: tab({ name }) }; const fetch = server(state)
  const view = mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Adicionar nome' }))
  fireEvent.change(screen.getByLabelText('Nome do cliente ou grupo (opcional)'), { target: { value: '  Grupo de teste  ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar nome' }))
  await screen.findByRole('heading', { level: 1, name: 'Comanda 105 - Grupo de teste' })
  expect(await screen.findByText('Alteração do nome confirmada.')).toBeVisible()
  const writes = fetch.mock.calls.filter(([, init]) => init?.method === 'PUT')
  expect(writes).toHaveLength(1)
  expect(JSON.parse(String(writes[0][1]?.body))).toEqual({ operationId: expect.any(String), name: 'Grupo de teste', expectedVersion: 1 })
  expect(fetch.mock.calls.some(([input]) => String(input).includes('/customers/'))).toBe(false)
  expect(localStorage.getItem(`lb-confirmation:tab-name-v1:${actor.id}:tab-name`)).toBeNull()
  view.unmount(); view.cache.clear(); const refreshed = mount()
  expect(await screen.findByRole('heading', { level: 1, name: 'Comanda 105 - Grupo de teste' })).toBeVisible()
  refreshed.unmount(); refreshed.cache.clear(); mount('/atendimento/comandas')
  expect(await screen.findByRole('link', { name: 'Detalhes da Comanda 105 - Grupo de teste' })).toBeVisible()
})

it('permite nome livre no recebimento sem exigir cadastro nem telefone', async () => {
  const state: State = { tab: tab() }; server(state); mount('/atendimento/receber/tab-name')
  fireEvent.click(await screen.findByRole('button', { name: 'Adicionar nome' }))
  fireEvent.change(screen.getByLabelText('Nome do cliente ou grupo (opcional)'), { target: { value: 'Grupo de teste' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar nome' }))
  expect(await screen.findByRole('heading', { name: 'Receber · Comanda 105 - Grupo de teste' })).toBeVisible()
  expect(state.tab.customer).toBeNull()
  expect(screen.queryByLabelText('Telefone do novo cliente')).not.toBeInTheDocument()
})

it('renomeia com pagamento pendente sem trocar cadastro, responsável ou valores', async () => {
  const customer = { id: 'registered-person', name: 'Pessoa cadastrada', incomplete: false }
  const responsible = { id: 'payer-person', name: 'Responsável teste' }
  const state: State = { tab: tab({ name: 'Grupo anterior', customer, responsible, total: 30, paid: 10, pending: 5, due: 20, payable: 15 }) }
  const fetch = server(state); mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Editar nome' }))
  const input = screen.getByLabelText('Nome do cliente ou grupo (opcional)')
  expect(input).toHaveValue('Grupo anterior')
  expect(input).toHaveAttribute('maxLength', '80')
  expect(screen.getByRole('button', { name: 'Salvar nome' })).toBeDisabled()
  fireEvent.change(input, { target: { value: 'Grupo atualizado' } }); fireEvent.click(screen.getByRole('button', { name: 'Salvar nome' }))
  await screen.findByText('Alteração do nome confirmada.')
  expect(state.tab).toMatchObject({ name: 'Grupo atualizado', customer, responsible, total: 30, paid: 10, pending: 5, due: 20, payable: 15 })
  const body = JSON.parse(String(fetch.mock.calls.find(([, init]) => init?.method === 'PUT')![1]?.body))
  expect(body).not.toHaveProperty('customerId'); expect(body).not.toHaveProperty('responsibleUserId')
})

it('permite retirar apenas o nome livre da comanda', async () => {
  const state: State = { tab: tab({ name: 'Grupo anterior' }) }; server(state); mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Editar nome' }))
  fireEvent.change(screen.getByLabelText('Nome do cliente ou grupo (opcional)'), { target: { value: '   ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar nome' }))
  expect(await screen.findByRole('heading', { level: 1, name: 'Comanda 105' })).toBeVisible()
  expect(state.tab.name).toBe('')
})

it('recupera a mesma operação e nome após resposta perdida e recarregamento', async () => {
  const writes: Record<string, unknown>[] = []
  const state: State = { tab: tab(), put: body => {
    writes.push(body); state.tab = { ...state.tab, name: String(body.name), version: 2 }
    if (writes.length === 1) throw new TypeError('connection interrupted')
    return json(state.tab)
  } }
  server(state); const view = mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Adicionar nome' }))
  fireEvent.change(screen.getByLabelText('Nome do cliente ou grupo (opcional)'), { target: { value: 'Grupo preservado' } })
  const save = screen.getByRole('button', { name: 'Salvar nome' })
  act(() => { fireEvent.click(save); fireEvent.click(save) })
  await screen.findByText(/Não foi possível confirmar o nome/)
  expect(writes).toHaveLength(1)
  expect(screen.getByLabelText('Nome do cliente ou grupo (opcional)')).toBeDisabled()
  expect(screen.getByRole('link', { name: 'Adicionar produtos' })).toBeVisible()
  expect(screen.getByRole('link', { name: 'Pagamento' })).toBeVisible()
  view.unmount(); view.cache.clear(); mount()
  const retry = await screen.findByRole('button', { name: 'Conferir nome' }); await waitFor(() => expect(retry).toBeEnabled()); fireEvent.click(retry)
  await screen.findByText('Alteração do nome confirmada.')
  expect(writes).toHaveLength(2); expect(writes[1]).toEqual(writes[0])
  expect(writes[1]).toMatchObject({ name: 'Grupo preservado', expectedVersion: 1 })
})

it('conflito mantém o texto e exige confirmação com a versão atual e outra operação', async () => {
  const writes: Record<string, unknown>[] = []
  const state: State = { tab: tab(), put: body => {
    writes.push(body)
    if (writes.length === 1) { state.tab = { ...state.tab, name: 'Nome de outro atendimento', version: 5 }; return json({ detail: 'A comanda mudou. Atualize antes de alterar o nome.' }, 409) }
    state.tab = { ...state.tab, name: String(body.name), version: 6 }; return json(state.tab)
  } }
  server(state); mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Adicionar nome' }))
  fireEvent.change(screen.getByLabelText('Nome do cliente ou grupo (opcional)'), { target: { value: 'Nome revisado' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar nome' }))
  await screen.findByText('A comanda mudou. Atualize antes de alterar o nome.')
  await screen.findByRole('heading', { level: 1, name: 'Comanda 105 - Nome de outro atendimento' })
  expect(screen.getByLabelText('Nome do cliente ou grupo (opcional)')).toHaveValue('Nome revisado')
  const save = screen.getByRole('button', { name: 'Salvar nome' }); await waitFor(() => expect(save).toBeEnabled())
  expect(writes).toHaveLength(1); fireEvent.click(save); await screen.findByText('Alteração do nome confirmada.')
  expect(writes.map(value => value.expectedVersion)).toEqual([1, 5])
  expect(writes[1].operationId).not.toBe(writes[0].operationId)
})

it('consulta em segundo plano não muda a versão da edição já iniciada', async () => {
  const writes: Record<string, unknown>[] = []
  const state: State = { tab: tab(), put: body => { writes.push(body); return json({ detail: 'A comanda mudou. Atualize antes de alterar o nome.' }, 409) } }
  server(state); const view = mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Adicionar nome' }))
  fireEvent.change(screen.getByLabelText('Nome do cliente ou grupo (opcional)'), { target: { value: 'Nome em edição' } })
  state.tab = { ...state.tab, name: 'Nome salvo por outra pessoa', version: 2 }
  act(() => { view.cache.setQueryData(['bar-runtime', actor.id, '/tabs/tab-name'], state.tab) })
  await screen.findByRole('heading', { level: 1, name: 'Comanda 105 - Nome salvo por outra pessoa' })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar nome' }))
  await screen.findByText('A comanda mudou. Atualize antes de alterar o nome.')
  expect(writes).toHaveLength(1)
  expect(writes[0]).toMatchObject({ name: 'Nome em edição', expectedVersion: 1 })
  expect(screen.getByLabelText('Nome do cliente ou grupo (opcional)')).toHaveValue('Nome em edição')
})

it('depois de um conflito fixa a versão revisada e detecta outra alteração enquanto o nome é editado', async () => {
  const writes: Record<string, unknown>[] = []
  const state: State = { tab: tab(), put: body => {
    writes.push(body)
    if (writes.length === 1) state.tab = { ...state.tab, name: 'Nome revisado na consulta', version: 5 }
    return json({ detail: 'A comanda mudou. Atualize antes de alterar o nome.' }, 409)
  } }
  server(state); const view = mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Adicionar nome' }))
  fireEvent.change(screen.getByLabelText('Nome do cliente ou grupo (opcional)'), { target: { value: 'Nome em edição' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar nome' }))
  await screen.findByRole('heading', { level: 1, name: 'Comanda 105 - Nome revisado na consulta' })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Salvar nome' })).toBeEnabled())
  state.tab = { ...state.tab, name: 'Nome de outra alteração', version: 6 }
  act(() => { view.cache.setQueryData(['bar-runtime', actor.id, '/tabs/tab-name'], state.tab) })
  await screen.findByRole('heading', { level: 1, name: 'Comanda 105 - Nome de outra alteração' })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar nome' }))
  await waitFor(() => expect(writes).toHaveLength(2))
  expect(writes.map(value => value.expectedVersion)).toEqual([1, 5])
  expect(screen.getByLabelText('Nome do cliente ou grupo (opcional)')).toHaveValue('Nome em edição')
})

it('consulta de conflito termina no prazo e exige atualizar os dados sem prender o atendimento', async () => {
  const state: State = { tab: tab(), put: () => {
    state.get = () => new Promise<Response>(() => {})
    return json({ detail: 'A comanda mudou. Atualize antes de alterar o nome.' }, 409)
  } }
  const fetch = server(state); mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Adicionar nome' }))
  fireEvent.change(screen.getByLabelText('Nome do cliente ou grupo (opcional)'), { target: { value: 'Nome preservado' } })
  vi.useFakeTimers(); fireEvent.click(screen.getByRole('button', { name: 'Salvar nome' }))
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  expect(screen.getByText('Atualizando a comanda para conferir o nome…')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Adicionar valor' })).toBeEnabled()
  expect(screen.getByRole('link', { name: 'Pagamento' })).toBeVisible()
  await act(async () => { await vi.advanceTimersByTimeAsync(tabNameRequestTimeout) })
  expect(screen.getByRole('button', { name: 'Atualizar comanda' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Salvar nome' })).toBeDisabled()
  expect(screen.getByLabelText('Nome do cliente ou grupo (opcional)')).toHaveValue('Nome preservado')
  expect(fetch.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1)
  const read = fetch.mock.calls.find(([input, init]) => String(input).endsWith('/tabs/tab-name') && init?.signal)
  expect(read?.[1]?.signal?.aborted).toBe(true)
  state.tab = { ...state.tab, version: 5 }; state.get = () => json(state.tab)
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar comanda' }))
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  expect(screen.getByRole('button', { name: 'Salvar nome' })).toBeEnabled()
})

it('encerra a espera da requisição em quinze segundos e mantém a operação para conferência', async () => {
  const state: State = { tab: tab(), put: () => new Promise<Response>(() => {}) }; const fetch = server(state); mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Adicionar nome' }))
  fireEvent.change(screen.getByLabelText('Nome do cliente ou grupo (opcional)'), { target: { value: 'Nome em conferência' } })
  vi.useFakeTimers()
  fireEvent.click(screen.getByRole('button', { name: 'Salvar nome' }))
  await act(async () => { await vi.advanceTimersByTimeAsync(tabNameRequestTimeout) })
  expect(screen.getByText('A confirmação do nome demorou. O nome foi preservado para conferência.')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Conferir nome' })).toBeEnabled()
  expect(screen.getByRole('link', { name: 'Adicionar produtos' })).toBeVisible()
  expect(screen.getByRole('link', { name: 'Pagamento' })).toBeVisible()
  const write = fetch.mock.calls.find(([, init]) => init?.method === 'PUT')!
  expect(write[1]?.signal?.aborted).toBe(true)
  expect(JSON.parse(localStorage.getItem(`lb-confirmation:tab-name-v1:${actor.id}:tab-name`)!)).toEqual(JSON.parse(String(write[1]?.body)))
})

it('não regride nome, saldo ou versão quando a confirmação recuperada é mais antiga', async () => {
  const original = { operationId: '11111111-1111-4111-8111-111111111111', name: 'Primeiro nome', expectedVersion: 1 }
  localStorage.setItem(`lb-confirmation:tab-name-v1:${actor.id}:tab-name`, JSON.stringify(original))
  const state: State = { tab: tab({ name: 'Nome mais recente', version: 6, total: 30, due: 30, payable: 30 }), put: () => json(tab({ name: 'Primeiro nome', version: 2 })) }
  const fetch = server(state); const view = mount()
  const retry = await screen.findByRole('button', { name: 'Conferir nome' }); await waitFor(() => expect(retry).toBeEnabled()); fireEvent.click(retry)
  await screen.findByText('Alteração do nome confirmada.')
  expect(screen.getByRole('heading', { level: 1, name: 'Comanda 105 - Nome mais recente' })).toBeVisible()
  expect(view.cache.getQueryData(['bar-runtime', actor.id, '/tabs/tab-name'])).toMatchObject({ version: 6, total: 30, name: 'Nome mais recente' })
  expect(fetch.mock.calls.filter(([input, init]) => String(input).endsWith('/tabs/tab-name') && !init?.method)).toHaveLength(2)
})

it('preserva ações de supervisão ao aplicar o recibo de nome sem esses privilégios', async () => {
  const manager: AuthUser = { ...actor, roles: ['Manager'], permissions: [] }
  const state: State = { tab: tab({ allowedActions: ['close', 'cancel'] }), put: body => {
    state.tab = { ...state.tab, name: String(body.name), version: 2, history: [{ id: 'name-history', kind: 'NameChanged', amount: 0, createdAtUtc: state.tab.createdAtUtc }] }
    return json({ ...state.tab, allowedActions: ['add', 'pay', 'close', 'issueAccess'] })
  } }
  server(state); const view = mount('/atendimento/comandas/tab-name', manager)
  expect(await screen.findByRole('button', { name: 'Cancelar comanda' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar nome' }))
  fireEvent.change(screen.getByLabelText('Nome do cliente ou grupo (opcional)'), { target: { value: 'Grupo nomeado' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar nome' }))
  await screen.findByText('Alteração do nome confirmada.')
  expect(screen.getByRole('button', { name: 'Cancelar comanda' })).toBeEnabled()
  expect(view.cache.getQueryData(['bar-runtime', actor.id, '/tabs/tab-name'])).toMatchObject({ name: 'Grupo nomeado', version: 2, allowedActions: ['close', 'cancel'] })
  fireEvent.click(screen.getByText('Histórico da comanda', { selector: 'summary' }))
  expect(screen.getByText('Nome da comanda atualizado')).toBeVisible()
})

it('consulta após recibo antigo tem prazo e não segura confirmação nem outras operações', async () => {
  localStorage.setItem(`lb-confirmation:tab-name-v1:${actor.id}:tab-name`, JSON.stringify({ operationId: '11111111-1111-4111-8111-111111111111', name: 'Primeiro nome', expectedVersion: 1 }))
  const state: State = { tab: tab({ name: 'Nome atual', version: 6 }), put: () => {
    state.get = () => new Promise<Response>(() => {})
    return json(tab({ name: 'Primeiro nome', version: 2 }))
  } }
  const fetch = server(state); mount()
  const retry = await screen.findByRole('button', { name: 'Conferir nome' }); await waitFor(() => expect(retry).toBeEnabled())
  vi.useFakeTimers(); fireEvent.click(retry)
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  expect(screen.getByText('Alteração do nome confirmada.')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Editar nome' })).toBeEnabled()
  expect(screen.getByRole('link', { name: 'Adicionar produtos' })).toBeVisible()
  expect(screen.getByRole('link', { name: 'Pagamento' })).toBeVisible()
  expect(localStorage.getItem(`lb-confirmation:tab-name-v1:${actor.id}:tab-name`)).toBeNull()
  await act(async () => { await vi.advanceTimersByTimeAsync(tabNameRequestTimeout) })
  const read = fetch.mock.calls.filter(([input, init]) => String(input).endsWith('/tabs/tab-name') && !init?.method)
  const boundedRead = read.filter(([, init]) => init?.signal)
  expect(boundedRead).toHaveLength(1); expect(boundedRead[0][1]?.signal?.aborted).toBe(true)
  expect(screen.getByRole('heading', { level: 1, name: 'Comanda 105 - Nome atual' })).toBeVisible()
})

it('não envia alteração sem conseguir guardar a confirmação', async () => {
  const fetch = server({ tab: tab() }); mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Adicionar nome' }))
  fireEvent.change(screen.getByLabelText('Nome do cliente ou grupo (opcional)'), { target: { value: 'Nome digitado' } })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded') })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar nome' }))
  expect(screen.getByText(/Não foi possível guardar a alteração do nome/)).toBeVisible()
  expect(screen.getByLabelText('Nome do cliente ou grupo (opcional)')).toBeEnabled()
  expect(fetch.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
})

it('isola a confirmação por operador e cancela envio pendente ao trocar de conta', async () => {
  const state: State = { tab: tab(), put: () => new Promise<Response>(() => {}) }; const fetch = server(state); const view = mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Adicionar nome' }))
  fireEvent.change(screen.getByLabelText('Nome do cliente ou grupo (opcional)'), { target: { value: 'Nome do primeiro operador' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar nome' }))
  view.changeUser({ ...actor, id: 'another-name-operator' })
  expect(await screen.findByRole('button', { name: 'Adicionar nome' })).toBeEnabled()
  expect(screen.queryByRole('button', { name: 'Conferir nome' })).not.toBeInTheDocument()
  expect(localStorage.getItem(`lb-confirmation:tab-name-v1:${actor.id}:tab-name`)).toContain('Nome do primeiro operador')
  expect(fetch.mock.calls.find(([, init]) => init?.method === 'PUT')![1]?.signal?.aborted).toBe(true)
})

it.each(['Closed', 'Cancelled'])('não oferece renomeação nova para comanda %s', async state => {
  const fetch = server({ tab: tab({ state }) }); mount(); await screen.findByRole('heading', { level: 1, name: 'Comanda 105' })
  expect(screen.queryByRole('button', { name: 'Adicionar nome' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Editar nome' })).not.toBeInTheDocument()
  expect(fetch.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
})

it('consulta sem permissão de operar não oferece edição nem retoma nome pendente', async () => {
  const pending = JSON.stringify({ operationId: '11111111-1111-4111-8111-111111111111', name: 'Nome preservado', expectedVersion: 1 })
  localStorage.setItem(`lb-confirmation:tab-name-v1:${actor.id}:tab-name`, pending)
  const fetch = server({ tab: tab() }); mount('/atendimento/comandas/tab-name', { ...actor, permissions: ['bar:sales:read'] })
  await screen.findByRole('heading', { level: 1, name: 'Comanda 105' })
  expect(screen.queryByRole('button', { name: /Adicionar nome|Editar nome|Conferir nome/ })).not.toBeInTheDocument()
  expect(fetch.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
  expect(localStorage.getItem(`lb-confirmation:tab-name-v1:${actor.id}:tab-name`)).toBe(pending)
})

it.each([['A', 'A'], ['  A  ', 'A'], ['a'.repeat(80), 'a'.repeat(80)]])('salva identificação livre %j sem selecionar ou cadastrar cliente', async (typed, expected) => {
  const state: State = { tab: tab() }; const fetch = server(state); mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Identificar comanda' }))
  const input = screen.getByRole('searchbox', { name: 'Buscar cliente da comanda' })
  expect(input).toHaveAttribute('maxLength', '80')
  fireEvent.change(input, { target: { value: typed } })
  const save = screen.getByRole('button', { name: 'Salvar identificação' })
  expect(save).toBeEnabled(); fireEvent.click(save)
  expect(await screen.findByRole('heading', { level: 1, name: `Comanda 105 - ${expected}` })).toBeVisible()
  const writes = fetch.mock.calls.filter(([, init]) => init?.method === 'PUT')
  expect(writes).toHaveLength(1)
  expect(writes[0][0]).toBe('/api/v1/bar/tabs/tab-name/name')
  expect(JSON.parse(String(writes[0][1]?.body))).toEqual({ operationId: expect.any(String), name: expected, expectedVersion: 1 })
  expect(state.tab.customer).toBeNull()
  expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  if (expected.length === 1) expect(fetch.mock.calls.some(([path]) => String(path).includes('/customers/lookup?'))).toBe(false)
  expect(localStorage.getItem(`lb-confirmation:tab-customer:${actor.id}:tab-name`)).toBeNull()
})

it.each([['somente espaços', '   '], ['mais de 80 caracteres', 'a'.repeat(81)]])('não salva identificação com %s, inclusive por Enter', async (_, typed) => {
  const state: State = { tab: tab({ name: 'Nome preservado' }) }; const fetch = server(state); mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Alterar identificação' }))
  const input = screen.getByRole('searchbox', { name: 'Buscar cliente da comanda' })
  fireEvent.change(input, { target: { value: typed } })
  expect(screen.getByRole('button', { name: 'Salvar identificação' })).toBeDisabled()
  fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar identificação' }))
  expect(state.tab.name).toBe('Nome preservado')
  expect(fetch.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
  expect(localStorage.getItem(`lb-confirmation:tab-name-v1:${actor.id}:tab-name`)).toBeNull()
})

it.each(['sem resultado', 'erro'])('a consulta cadastral com %s não bloqueia salvar o nome livre', async result => {
  const state: State = { tab: tab(), lookup: () => result === 'erro' ? json({ detail: 'Consulta indisponível.' }, 503) : json([]) }
  const fetch = server(state); mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Identificar comanda' }))
  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar cliente da comanda' }), { target: { value: 'Nome sem cadastro' } })
  if (result === 'erro') await screen.findByText(/Não foi possível buscar clientes/)
  else await screen.findByText('Nenhum cliente encontrado. Você pode salvar o nome digitado sem cadastrar.')
  const save = screen.getByRole('button', { name: 'Salvar identificação' })
  expect(save).toBeEnabled(); fireEvent.click(save)
  expect(await screen.findByRole('heading', { level: 1, name: 'Comanda 105 - Nome sem cadastro' })).toBeVisible()
  const writes = fetch.mock.calls.filter(([, init]) => init?.method === 'PUT')
  expect(writes).toHaveLength(1); expect(writes[0][0]).toBe('/api/v1/bar/tabs/tab-name/name')
  expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  expect(state.tab.customer).toBeNull()
})

it('alterar identificação para nome livre preserva cadastro, responsável e valores com Pix pendente', async () => {
  const customer = { id: 'registered-person', name: 'Pessoa cadastrada', incomplete: false }
  const responsible = { id: 'payer-person', name: 'Responsável teste' }
  const state: State = { tab: tab({ name: 'Grupo anterior', customer, responsible, total: 30, paid: 10, pending: 5, due: 20, payable: 15 }) }
  const fetch = server(state); mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Alterar identificação' }))
  fireEvent.click(screen.getByRole('button', { name: 'Trocar cliente' }))
  expect(fetch.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar cliente da comanda' }), { target: { value: 'Novo nome livre' } })
  const save = screen.getByRole('button', { name: 'Salvar identificação' })
  expect(save).toBeEnabled(); fireEvent.click(save)
  await screen.findByRole('heading', { level: 1, name: 'Comanda 105 - Novo nome livre' })
  expect(state.tab).toMatchObject({ name: 'Novo nome livre', customer, responsible, total: 30, paid: 10, pending: 5, due: 20, payable: 15 })
  const writes = fetch.mock.calls.filter(([, init]) => init?.method === 'PUT')
  expect(writes).toHaveLength(1); expect(writes[0][0]).toBe('/api/v1/bar/tabs/tab-name/name')
  const body = JSON.parse(String(writes[0][1]?.body))
  expect(body).not.toHaveProperty('customerId'); expect(body).not.toHaveProperty('responsibleUserId')
})

it('salvar identificação preserva a mesma intenção de nome após resposta perdida e recarregamento', async () => {
  const writes: Record<string, unknown>[] = []
  const state: State = { tab: tab(), put: body => {
    writes.push(body); state.tab = { ...state.tab, name: String(body.name), version: 2 }
    if (writes.length === 1) throw new TypeError('connection interrupted')
    return json(state.tab)
  } }
  server(state); const view = mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Identificar comanda' }))
  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar cliente da comanda' }), { target: { value: 'Nome preservado' } })
  const save = screen.getByRole('button', { name: 'Salvar identificação' })
  act(() => { fireEvent.click(save); fireEvent.click(save) })
  await screen.findByText(/Não foi possível confirmar o nome/)
  expect(writes).toHaveLength(1)
  expect(screen.getByRole('searchbox', { name: 'Buscar cliente da comanda' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Conferir identificação' })).toBeEnabled()
  expect(screen.getByRole('link', { name: 'Adicionar produtos' })).toBeVisible()
  expect(screen.getByRole('link', { name: 'Pagamento' })).toBeVisible()
  expect(JSON.parse(localStorage.getItem(`lb-confirmation:tab-name-v1:${actor.id}:tab-name`)!)).toEqual(writes[0])
  expect(localStorage.getItem(`lb-confirmation:tab-customer:${actor.id}:tab-name`)).toBeNull()
  view.unmount(); view.cache.clear(); mount()
  const retry = await screen.findByRole('button', { name: 'Conferir nome' })
  await waitFor(() => expect(retry).toBeEnabled()); fireEvent.click(retry)
  await screen.findByText('Alteração do nome confirmada.')
  expect(writes).toHaveLength(2); expect(writes[1]).toEqual(writes[0])
  expect(writes[1]).toMatchObject({ name: 'Nome preservado', expectedVersion: 1 })
  expect(localStorage.getItem(`lb-confirmation:tab-name-v1:${actor.id}:tab-name`)).toBeNull()
})

it('conflito ao salvar identificação mantém nome e exige nova intenção com a versão consultada', async () => {
  const writes: Record<string, unknown>[] = []
  const state: State = { tab: tab(), put: body => {
    writes.push(body)
    if (writes.length === 1) { state.tab = { ...state.tab, name: 'Nome de outro atendimento', version: 5 }; return json({ detail: 'A comanda mudou. Atualize antes de alterar o nome.' }, 409) }
    state.tab = { ...state.tab, name: String(body.name), version: 6 }; return json(state.tab)
  } }
  server(state); mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Identificar comanda' }))
  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar cliente da comanda' }), { target: { value: 'Nome revisado' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar identificação' }))
  await screen.findByRole('heading', { level: 1, name: 'Comanda 105 - Nome de outro atendimento' })
  expect(screen.getByRole('searchbox', { name: 'Buscar cliente da comanda' })).toHaveValue('Nome revisado')
  const save = screen.getByRole('button', { name: 'Salvar identificação' })
  await waitFor(() => expect(save).toBeEnabled()); expect(writes).toHaveLength(1)
  fireEvent.click(save); await screen.findByText('Alteração do nome confirmada.')
  expect(writes.map(value => value.expectedVersion)).toEqual([1, 5])
  expect(writes[1].operationId).not.toBe(writes[0].operationId)
})

it('consulta automática não substitui a versão capturada ao começar a identificar a comanda', async () => {
  const writes: Record<string, unknown>[] = []
  const state: State = { tab: tab(), put: body => { writes.push(body); return json({ detail: 'A comanda mudou. Atualize antes de alterar o nome.' }, 409) } }
  server(state); const view = mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Identificar comanda' }))
  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar cliente da comanda' }), { target: { value: 'Nome em edição' } })
  state.tab = { ...state.tab, name: 'Nome salvo por outra pessoa', version: 2 }
  act(() => { view.cache.setQueryData(['bar-runtime', actor.id, '/tabs/tab-name'], state.tab) })
  await screen.findByRole('heading', { level: 1, name: 'Comanda 105 - Nome salvo por outra pessoa' })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar identificação' }))
  await screen.findByText('A comanda mudou. Atualize antes de alterar o nome.')
  expect(writes).toHaveLength(1); expect(writes[0]).toMatchObject({ name: 'Nome em edição', expectedVersion: 1 })
  expect(screen.getByRole('searchbox', { name: 'Buscar cliente da comanda' })).toHaveValue('Nome em edição')
})

it('recupera nome e vínculo cadastral pendentes sem bloquear as duas confirmações nem mudar seus contratos', async () => {
  const nameIntent = { operationId: '11111111-1111-4111-8111-111111111111', name: 'Nome preservado', expectedVersion: 1 }
  const customerIntent = { operationId: '22222222-2222-4222-8222-222222222222', customerId: 'registered-person', expectedVersion: 2 }
  localStorage.setItem(`lb-confirmation:tab-name-v1:${actor.id}:tab-name`, JSON.stringify(nameIntent))
  localStorage.setItem(`lb-confirmation:tab-customer:${actor.id}:tab-name`, JSON.stringify(customerIntent))
  const customer = { id: 'registered-person', name: 'Pessoa cadastrada', incomplete: false }
  const state: State = { tab: tab({ name: 'Nome preservado', version: 3, customer }),
    put: () => json(tab({ name: 'Nome preservado', version: 2 })), customerPut: () => json(state.tab) }
  const fetch = server(state); mount()
  const nameRetry = await screen.findByRole('button', { name: 'Conferir nome' })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Conferir identificação' })).toBeEnabled())
  await waitFor(() => expect(nameRetry).toBeEnabled()); fireEvent.click(nameRetry)
  const customerRetry = await screen.findByRole('button', { name: 'Conferir identificação' })
  await waitFor(() => expect(customerRetry).toBeEnabled())
  expect(localStorage.getItem(`lb-confirmation:tab-customer:${actor.id}:tab-name`)).toBe(JSON.stringify(customerIntent))
  fireEvent.click(customerRetry); await screen.findByText(/Identificação atualizada/)
  const writes = fetch.mock.calls.filter(([, init]) => init?.method === 'PUT')
  expect(writes.map(([path]) => path)).toEqual(['/api/v1/bar/tabs/tab-name/name', '/api/v1/bar/tabs/tab-name/customer'])
  expect(writes.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([nameIntent, customerIntent])
  expect(localStorage.getItem(`lb-confirmation:tab-name-v1:${actor.id}:tab-name`)).toBeNull()
  expect(localStorage.getItem(`lb-confirmation:tab-customer:${actor.id}:tab-name`)).toBeNull()
})

it('mantém a conferência do nome acessível depois de rejeitar um vínculo cadastral pendente', async () => {
  const nameIntent = { operationId: '11111111-1111-4111-8111-111111111111', name: 'Nome preservado', expectedVersion: 1 }
  const customerIntent = { operationId: '22222222-2222-4222-8222-222222222222', customerId: 'registered-person', expectedVersion: 1 }
  localStorage.setItem(`lb-confirmation:tab-name-v1:${actor.id}:tab-name`, JSON.stringify(nameIntent))
  localStorage.setItem(`lb-confirmation:tab-customer:${actor.id}:tab-name`, JSON.stringify(customerIntent))
  const state: State = { tab: tab({ name: 'Nome preservado', version: 2 }),
    put: () => json(state.tab), customerPut: () => json({ detail: 'Comanda mudou. Confira o vínculo.' }, 409) }
  const fetch = server(state); mount()
  const customerRetry = await screen.findByRole('button', { name: 'Conferir identificação' })
  await waitFor(() => expect(customerRetry).toBeEnabled()); fireEvent.click(customerRetry)
  await screen.findByText('Comanda mudou. Confira o vínculo.')
  const nameRetry = screen.getByRole('button', { name: 'Conferir nome' })
  await waitFor(() => expect(nameRetry).toBeEnabled()); fireEvent.click(nameRetry)
  await waitFor(() => expect(localStorage.getItem(`lb-confirmation:tab-name-v1:${actor.id}:tab-name`)).toBeNull())
  const writes = fetch.mock.calls.filter(([, init]) => init?.method === 'PUT')
  expect(writes.map(([path]) => path)).toEqual(['/api/v1/bar/tabs/tab-name/customer', '/api/v1/bar/tabs/tab-name/name'])
  expect(writes.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([customerIntent, nameIntent])
})

it('nome pendente inválido não bloqueia replay cadastral válido nem perde seu checkpoint', async () => {
  const nameKey = `lb-confirmation:tab-name-v1:${actor.id}:tab-name`
  const customerKey = `lb-confirmation:tab-customer:${actor.id}:tab-name`
  const customerIntent = { operationId: '22222222-2222-4222-8222-222222222222', customerId: 'registered-person', expectedVersion: 1 }
  localStorage.setItem(nameKey, 'not-json')
  localStorage.setItem(customerKey, JSON.stringify(customerIntent))
  const customer = { id: 'registered-person', name: 'Pessoa cadastrada', incomplete: false }
  const state: State = { tab: tab({ customer, version: 2 }), customerPut: () => json(state.tab) }
  const fetch = server(state); mount()
  await screen.findByText(/Não foi possível ler uma alteração de nome pendente/)
  const retry = await screen.findByRole('button', { name: 'Conferir identificação' })
  await waitFor(() => expect(retry).toBeEnabled()); fireEvent.click(retry)
  await screen.findByText(/Identificação atualizada/)
  const writes = fetch.mock.calls.filter(([, init]) => init?.method === 'PUT')
  expect(writes).toHaveLength(1); expect(writes[0][0]).toBe('/api/v1/bar/tabs/tab-name/customer')
  expect(JSON.parse(String(writes[0][1]?.body))).toEqual(customerIntent)
  expect(localStorage.getItem(customerKey)).toBeNull()
  expect(localStorage.getItem(nameKey)).toBe('not-json')
  expect(screen.getByText(/Não foi possível ler uma alteração de nome pendente/)).toBeVisible()
})
