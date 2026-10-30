import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../auth/authContext'
import { OrdersPage } from './OrdersPage'
import type { Tab, TabItem } from './api'

const item = (id: string, state = 'Requested'): TabItem => ({ id, tabId: 'tab', productId: id, name: `Produto ${id}`, quantity: 1, unitPrice: 5, total: 5, state, source: 'Client', createdAtUtc: '2026-10-19T12:00:00Z', allowedActions: state === 'Requested' ? ['accept', 'reject'] : ['fulfill'] })
const tab = (items = [item('a'), item('b')]): Tab => ({ id: 'tab', number: 104, name: 'Mesa teste', state: 'Open', mode: 'Tab', locationId: 'bar', actorId: 'operator', total: 10, paid: 0, pending: 0, due: 10, payable: 10, createdAtUtc: '2026-10-19T12:00:00Z', items, payments: [], history: [], allowedActions: [] })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const clients: QueryClient[] = []
function mount(path = '/atendimento/pedidos', operate = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client)
  const auth: AuthContextValue = { user: { id: 'operator', name: 'Teste', email: 'teste@example.com', roles: ['Operations'], permissions: operate ? ['bar:sales:read', 'bar:sales:operate'] : ['bar:sales:read'] }, isBootstrapping: false, signIn: async () => {}, signInWithGoogle: async () => {}, signOut: async () => {}, changePassword: async () => {}, completeFirstAccessWithGoogle: async () => {} }
  render(<QueryClientProvider client={client}><AuthContext.Provider value={auth}><MemoryRouter initialEntries={[path]}><OrdersPage /></MemoryRouter></AuthContext.Provider></QueryClientProvider>)
  return client
}
afterEach(() => { clients.splice(0).forEach(client => client.clear()); sessionStorage.clear() })

it('agrupa produtos por comanda e aplica busca/filtro antes da paginação sem perder o contexto', async () => {
  const mock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ items: [tab()], page: 1, pageSize: 24, total: 25 }))
  mount(); await screen.findByRole('region', { name: 'Pedidos da comanda 104' })
  expect(screen.getAllByRole('link', { name: 'Comanda 104 Mesa teste' })).toHaveLength(1)
  expect(screen.getAllByRole('article')).toHaveLength(2)
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Produto' } })
  fireEvent.click(screen.getByRole('button', { name: 'A aceitar' }))
  await waitFor(() => expect(mock.mock.calls.some(([url]) => String(url).includes('search=Produto&orderState=Requested'))).toBe(true))
  fireEvent.click(await screen.findByRole('button', { name: 'Próxima' }))
  await waitFor(() => expect(mock.mock.calls.some(([url]) => String(url).includes('page=2&pageSize=24&search=Produto&orderState=Requested'))).toBe(true))
  expect((await screen.findByRole('link', { name: 'Comanda 104 Mesa teste' })).getAttribute('href')).toContain('busca%3DProduto')
})

it('recusa no contexto, foca motivo e limpa o texto ao cancelar ou trocar de item', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ items: [tab()], total: 1 }))
  mount(); const a = within(await screen.findByRole('article', { name: '1 × Produto a' })); const b = within(screen.getByRole('article', { name: '1 × Produto b' }))
  fireEvent.click(a.getByRole('button', { name: 'Recusar' }))
  expect(a.getByLabelText('Motivo da recusa')).toHaveFocus()
  expect(a.getByText('Recusar 1 × Produto a · Comanda 104')).toBeInTheDocument()
  fireEvent.change(a.getByLabelText('Motivo da recusa'), { target: { value: 'Sem produto' } })
  fireEvent.click(b.getByRole('button', { name: 'Recusar' }))
  expect(b.getByLabelText('Motivo da recusa')).toHaveValue('')
  fireEvent.change(b.getByLabelText('Motivo da recusa'), { target: { value: '   ' } })
  expect(b.getByRole('button', { name: 'Confirmar recusa' })).toBeDisabled()
  fireEvent.click(b.getByRole('button', { name: 'Cancelar' }))
  expect(b.getByRole('button', { name: 'Recusar' })).toHaveFocus()
  fireEvent.click(b.getByRole('button', { name: 'Recusar' }))
  expect(b.getByLabelText('Motivo da recusa')).toHaveValue('')
})

it('libera os demais itens durante rede lenta e mescla só o item confirmado em respostas fora de ordem', async () => {
  let current = tab(); const replies = new Map<string, (value: Response) => void>()
  const mock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (init?.method === 'POST') return new Promise<Response>(resolve => replies.set(String(url).includes('/items/a/') ? 'a' : 'b', resolve))
    return json({ items: [current], total: 1 })
  })
  mount(); const a = within(await screen.findByRole('article', { name: '1 × Produto a' })); const b = within(screen.getByRole('article', { name: '1 × Produto b' }))
  fireEvent.click(a.getByRole('button', { name: 'Aceitar' })); fireEvent.click(a.getByRole('button', { name: 'Aceitar' }))
  expect(b.getByRole('button', { name: 'Aceitar' })).toBeEnabled()
  fireEvent.click(b.getByRole('button', { name: 'Aceitar' }))
  await waitFor(() => expect(replies.size).toBe(2))
  const staleA = tab([item('a', 'Accepted'), item('b')]); const staleB = tab([item('a'), item('b', 'Accepted')])
  await act(async () => { replies.get('b')!(json(staleB)) })
  expect(b.getByRole('button', { name: 'Entregar' })).toBeEnabled()
  current = tab([item('a', 'Accepted'), item('b', 'Accepted')])
  await act(async () => { replies.get('a')!(json(staleA)) })
  expect(a.getByRole('button', { name: 'Entregar' })).toBeEnabled()
  expect(b.getByRole('button', { name: 'Entregar' })).toBeEnabled()
  expect(mock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(2)
})

it('preserva recusa na falha e reutiliza operação e motivo na tentativa seguinte', async () => {
  let attempts = 0; let current = tab([item('a')])
  const mock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    if (init?.method === 'POST') {
      if (++attempts === 1) return json({ detail: 'Rede indisponível' }, 502)
      current = tab([{ ...item('a'), state: 'Rejected', allowedActions: [] }]); return json(current)
    }
    return json({ items: [current], total: 1 })
  })
  mount(); fireEvent.click(await screen.findByRole('button', { name: 'Recusar' }))
  fireEvent.change(screen.getByLabelText('Motivo da recusa'), { target: { value: 'Produto indisponível' } })
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar recusa' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Rede indisponível')
  expect(screen.getByLabelText('Motivo da recusa')).toHaveValue('Produto indisponível')
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  await screen.findByText(/pedido recusado\./)
  const writes = mock.mock.calls.filter(([, init]) => init?.method === 'POST').map(([, init]) => JSON.parse(String(init?.body)))
  expect(writes).toHaveLength(2); expect(writes[1]).toEqual(writes[0]); expect(writes[1].reason).toBe('Produto indisponível')
})

it('entrega em um clique e respeita permissões e ações permitidas', async () => {
  let current = tab([item('a', 'Accepted')]); const mock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    if (init?.method === 'POST') { current = tab([{ ...item('a'), state: 'Fulfilled', allowedActions: [] }]); return json(current) }
    return json({ items: [current], total: 1 })
  })
  mount(); fireEvent.click(await screen.findByRole('button', { name: 'Entregar' }))
  await screen.findByText(/entrega confirmada\./)
  expect(mock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
})

it('consulta sem permissão de operação não oferece ações', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ items: [tab()], total: 1 }))
  mount('/atendimento/pedidos', false); await screen.findByRole('article', { name: '1 × Produto a' })
  expect(screen.queryByRole('button', { name: 'Aceitar' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Recusar' })).not.toBeInTheDocument()
})
