import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../auth/authContext'
import { OrdersPage } from './OrdersPage'
import type { Tab, TabItem } from './api'
import { ITEM_REMOVAL_REASON } from './ItemRemovalConfirmation'

const item = (id: string, state = 'Requested'): TabItem => ({ id, tabId: 'tab', productId: id, name: `Produto ${id}`, quantity: 1, unitPrice: 5, total: 5, state, source: 'Client', createdAtUtc: '2026-10-19T12:00:00Z', allowedActions: state === 'Requested' ? ['accept', 'reject'] : ['fulfill'] })
const tab = (items = [item('a'), item('b')]): Tab => ({ id: 'tab', number: 104, name: 'Mesa teste', state: 'Open', mode: 'Tab', locationId: 'bar', actorId: 'operator', total: 10, paid: 0, pending: 0, due: 10, payable: 10, createdAtUtc: '2026-10-19T12:00:00Z', items, payments: [], history: [], allowedActions: [] })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const clients: QueryClient[] = []
function mount(path = '/atendimento/pedidos', operate = true, supervise = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client)
  const view = (supervisor: boolean) => {
    const auth: AuthContextValue = { user: { id: 'operator', name: 'Teste', email: 'teste@example.com', roles: supervisor ? ['Manager'] : ['Operations'], permissions: [...(operate ? ['bar:sales:read', 'bar:sales:operate'] : ['bar:sales:read']), ...(supervisor ? ['bar:supervise'] : [])] }, isBootstrapping: false, signIn: async () => {}, signInWithGoogle: async () => {}, signOut: async () => {}, changePassword: async () => {}, completeFirstAccessWithGoogle: async () => {} }
    return <QueryClientProvider client={client}><AuthContext.Provider value={auth}><MemoryRouter initialEntries={[path]}><OrdersPage /></MemoryRouter></AuthContext.Provider></QueryClientProvider>
  }
  const result = render(view(supervise))
  return { client, changeSupervision: (next: boolean) => result.rerender(view(next)) }
}
afterEach(() => { clients.splice(0).forEach(client => client.clear()); sessionStorage.clear() })

it('agrupa produtos por comanda e aplica busca/filtro antes da paginação sem perder o contexto', async () => {
  const mock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ items: [tab()], page: 1, pageSize: 24, total: 25 }))
  mount(); await screen.findByRole('region', { name: 'Pedidos da comanda 104' })
  expect(screen.getAllByRole('link', { name: 'Comanda 104 - Mesa teste' })).toHaveLength(1)
  expect(screen.getAllByRole('article')).toHaveLength(2)
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Produto' } })
  fireEvent.click(screen.getByRole('button', { name: 'A aceitar' }))
  await waitFor(() => expect(mock.mock.calls.some(([url]) => String(url).includes('search=Produto&orderState=Requested'))).toBe(true))
  fireEvent.click(await screen.findByRole('button', { name: 'Próxima' }))
  await waitFor(() => expect(mock.mock.calls.some(([url]) => String(url).includes('page=2&pageSize=24&search=Produto&orderState=Requested'))).toBe(true))
  expect((await screen.findByRole('link', { name: 'Comanda 104 - Mesa teste' })).getAttribute('href')).toContain('busca%3DProduto')
})

it('confirma exclusão no contexto sem motivo e devolve o foco ao manter o item', async () => {
  const calls = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ items: [tab()], total: 1 }))
  mount(); const a = within(await screen.findByRole('article', { name: '1 × Produto a' })); const b = within(screen.getByRole('article', { name: '1 × Produto b' }))
  fireEvent.click(a.getByRole('button', { name: 'Excluir item' }))
  expect(a.queryByRole('textbox')).not.toBeInTheDocument()
  expect(a.getByRole('button', { name: 'Manter item' })).toHaveFocus()
  expect(a.getByText('Excluir 1 × Produto a · Comanda 104 - Mesa teste?')).toBeInTheDocument()
  fireEvent.click(b.getByRole('button', { name: 'Excluir item' }))
  expect(a.queryByRole('button', { name: 'Confirmar exclusão' })).not.toBeInTheDocument()
  expect(b.getByRole('button', { name: 'Confirmar exclusão' })).toBeEnabled()
  fireEvent.click(b.getByRole('button', { name: 'Manter item' }))
  expect(b.getByRole('button', { name: 'Excluir item' })).toHaveFocus()
  expect(calls.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
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

it('reutiliza a mesma exclusão auditada após falha e bloqueia outra ação nesse item', async () => {
  let attempts = 0; let current = tab([item('a')])
  const mock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    if (init?.method === 'POST') {
      if (++attempts === 1) return json({ detail: 'Rede indisponível' }, 502)
      current = tab([{ ...item('a'), state: 'Rejected', allowedActions: [] }]); return json(current)
    }
    return json({ items: [current], total: 1 })
  })
  mount(); fireEvent.click(await screen.findByRole('button', { name: 'Excluir item' }))
  expect(screen.queryByLabelText('Motivo da recusa')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Rede indisponível')
  expect(screen.getByRole('button', { name: 'Aceitar' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Excluir item' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  await screen.findByText(/item excluído\./)
  const writes = mock.mock.calls.filter(([, init]) => init?.method === 'POST').map(([, init]) => JSON.parse(String(init?.body)))
  expect(writes).toHaveLength(2); expect(writes[1]).toEqual(writes[0]); expect(writes[1].reason).toBe(ITEM_REMOVAL_REASON)
})

it.each([false, true])('item aceito só pode ser excluído em Pedidos com supervisão (%s)', async supervise => {
  let current = tab([{ ...item('a', 'Accepted'), allowedActions: ['fulfill', 'reverse'] }])
  const mock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    if (init?.method === 'POST') { current = tab([{ ...item('a'), state: 'Reversed', allowedActions: [] }]); return json(current) }
    return json({ items: [current], total: 1 })
  })
  mount('/atendimento/pedidos', true, supervise); await screen.findByRole('article', { name: '1 × Produto a' })
  if (!supervise) { expect(screen.queryByRole('button', { name: 'Excluir item' })).not.toBeInTheDocument(); return }
  fireEvent.click(screen.getByRole('button', { name: 'Excluir item' }))
  expect(screen.getByText(/Retira R\$\s*5,00 do consumo/)).toBeInTheDocument()
  expect(screen.queryByRole('textbox', { name: /Motivo/ })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
  await screen.findByText(/item excluído\./)
  const writes = mock.mock.calls.filter(([, init]) => init?.method === 'POST')
  expect(writes).toHaveLength(1); expect(writes[0][0]).toBe('/api/v1/bar/tabs/tab/items/a/reverse')
  expect(JSON.parse(String(writes[0][1]?.body))).toMatchObject({ reason: ITEM_REMOVAL_REASON, returnStock: false, operationId: expect.any(String) })
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
  expect(screen.queryByRole('button', { name: 'Excluir item' })).not.toBeInTheDocument()
})

it('identifica o cliente no cabeçalho do grupo sem usar o responsável de outra pessoa',async()=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValue(json({items:[{...tab(),number:1,customer:{id:'customer-a',name:' Cliente  Exemplo ',incomplete:false},responsible:{id:'payer',name:'Outra pessoa'}}],total:1}));
 mount();expect(await screen.findByRole('heading',{level:2,name:'Comanda 01 - Cliente Exemplo'})).toBeInTheDocument();
 expect(screen.queryByRole('heading',{name:/Outra pessoa/})).not.toBeInTheDocument();
});

it('mantém a exclusão incerta bloqueada ao perder supervisão e repete os mesmos dados após recuperar o acesso', async () => {
  let attempts = 0; let current = tab([{ ...item('a', 'Accepted'), allowedActions: ['fulfill', 'reverse'] }])
  const calls = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    if (init?.method === 'POST') {
      if (++attempts === 1) return json({ detail: 'Resposta interrompida.' }, 503)
      current = tab([{ ...item('a'), state: 'Reversed', allowedActions: [] }]); return json(current)
    }
    return json({ items: [current], total: 1 })
  })
  const { changeSupervision } = mount('/atendimento/pedidos', true, true)
  fireEvent.click(await screen.findByRole('button', { name: 'Excluir item' })); fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
  await screen.findByRole('alert'); changeSupervision(false)
  expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeDisabled()
  expect(screen.getByText('Seu acesso não permite confirmar esta exclusão. Peça ajuda à gestão.')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Entregar' })).toBeDisabled()
  expect(calls.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
  changeSupervision(true); fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  await screen.findByText(/item excluído\./)
  const bodies = calls.mock.calls.filter(([, init]) => init?.method === 'POST').map(([, init]) => JSON.parse(String(init?.body)))
  expect(bodies).toHaveLength(2); expect(bodies[1]).toEqual(bodies[0])
})
