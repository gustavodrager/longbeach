import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { OptionalUnsavedProvider } from '../../components/managementUi'
import { AuthContext, type AuthContextValue } from '../auth/authContext'
import type { AuthUser } from '../auth/types'
import { CustomersPage, CustomerDetailsPage } from './CustomerPages'
import type { Customer } from './api'

const actor: AuthUser = { id: 'management-fixture', name: 'Gestão teste', email: 'management@example.invalid', roles: ['Operations'], permissions: ['customers:read', 'customers:write'] }
const customer: Customer = { id: 'one', name: 'Pessoa Teste', phone: '11988887777', email: null, status: 'Ativo', version: 1, origin: 'Manual', incomplete: false, userId: null, profiles: ['Aluno', 'Bar'], mergedIntoId: null }
const clients: QueryClient[] = []; const routers: ReturnType<typeof createMemoryRouter>[] = []
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }) }
function mount(path = '/clientes', user = actor) {
  let changeActor: (value: AuthUser) => void = () => {}
  function Session() {
    const [current, setCurrent] = useState(user); changeActor = setCurrent
    const auth: AuthContextValue = { user: current, isBootstrapping: false, signIn: async () => {}, signInWithGoogle: async () => {}, signOut: async () => {}, changePassword: async () => {}, completeFirstAccessWithGoogle: async () => {} }
    return <AuthContext.Provider value={auth}><OptionalUnsavedProvider><Outlet /></OptionalUnsavedProvider></AuthContext.Provider>
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client)
  const router = createMemoryRouter([{ element: <Session />, children: [{ path: '/clientes', element: <CustomersPage /> }, { path: '/clientes/:customerId', element: <CustomerDetailsPage /> }] }], { initialEntries: [path] }); routers.push(router)
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>); return Object.assign(router, { actor: (value: AuthUser) => changeActor(value) })
}
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); routers.splice(0).forEach(router => router.dispose()); localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks() })

it('lista/pagina filtra vínculos e telefone pendente na API e conserva retorno da ficha', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => String(url).includes('/customers?') ? json({ items: [customer], total: 21, page: new URL(String(url), 'http://test').searchParams.get('page') === '2' ? 2 : 1, pageSize: 20 }) : json(customer))
  const router = mount('/clientes?profile=Aluno&incomplete=true&q=Pessoa')
  const row = await screen.findByRole('link', { name: /Pessoa Teste/ }); expect(row).toHaveAttribute('href', '/clientes/one?profile=Aluno&incomplete=true&q=Pessoa')
  expect(fetch.mock.calls[0][0]).toContain('profile=Aluno'); expect(fetch.mock.calls[0][0]).toContain('incomplete=true')
  fireEvent.click(screen.getByRole('button', { name: 'Próxima' })); await waitFor(() => expect(router.state.location.search).toContain('page=2'))
  fireEvent.click(await screen.findByRole('link', { name: /Pessoa Teste/ })); await screen.findByRole('heading', { name: customer.name }); expect(screen.getByRole('link', { name: '← Clientes' })).toHaveAttribute('href', '/clientes?profile=Aluno&incomplete=true&q=Pessoa&page=2')
})

it('novo cadastro exige contato e só navega após confirmação, bloqueando duplo envio', async () => {
  let finish: ((response: Response) => void) | undefined; const bodies: unknown[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => { if (init?.method === 'POST') { bodies.push(JSON.parse(String(init.body))); return new Promise<Response>(resolve => { finish = resolve }) } return json(customer) })
  const router = mount('/clientes/novo'); const dialog = screen.getByRole('dialog', { name: 'Cadastrar cliente' })
  expect(within(dialog).getByText('O cadastro não cria login, matrícula, reserva ou cobrança.')).toBeVisible()
  fireEvent.change(within(dialog).getByLabelText('Nome'), { target: { value: customer.name } }); fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar cliente' })); expect(bodies).toHaveLength(0)
  fireEvent.change(within(dialog).getByLabelText('Telefone com DDD'), { target: { value: '(11) 98888-7777' } }); const save = within(dialog).getByRole('button', { name: 'Salvar cliente' }); fireEvent.click(save); fireEvent.click(save)
  expect(bodies).toHaveLength(1); expect(router.state.location.pathname).toBe('/clientes/novo'); finish?.(json(customer)); await waitFor(() => expect(router.state.location.pathname).toBe('/clientes/one'))
})

it('legado sem telefone continua pendente e edição não inventa contato ou login', async () => {
  const legacy = { ...customer, phone: '', incomplete: true }; let body: Record<string, unknown> | undefined
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => { if (init?.method === 'PUT') { body = JSON.parse(String(init.body)); return json({ ...legacy, name: body!.name, version: 2 }) } return json(legacy) })
  mount('/clientes/one?acao=editar'); const dialog = await screen.findByRole('dialog', { name: 'Editar cliente' }); fireEvent.change(within(dialog).getByLabelText('Nome'), { target: { value: 'Nome corrigido' } }); fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar cliente' }))
  await waitFor(() => expect(body).toMatchObject({ expectedVersion: 1, name: 'Nome corrigido', phone: '' })); expect(body).not.toHaveProperty('userId'); expect(body).not.toHaveProperty('profiles'); expect(await screen.findByText(/Cadastro antigo com telefone pendente/)).toBeInTheDocument()
})

it('conflito409 preserva edição e comparar usa nova leitura sem reenviar versão antiga', async () => {
  const latest = { ...customer, name: 'Nome em outro atendimento', version: 2 }; let updated = false; const puts: unknown[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => { if (init?.method === 'PUT') { updated = true; puts.push(JSON.parse(String(init.body))); return json({ message: 'Cadastro alterado. Confira a versão atual.' }, 409) } return json(updated ? latest : customer) })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  mount('/clientes/one?acao=editar'); const dialog = await screen.findByRole('dialog', { name: 'Editar cliente' }); fireEvent.change(within(dialog).getByLabelText('Nome'), { target: { value: 'Meu rascunho' } }); fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar cliente' }))
  expect(await screen.findByRole('heading', { name: 'O cadastro mudou em outro atendimento' })).toBeInTheDocument(); expect(within(dialog).getByLabelText('Nome')).toHaveValue('Meu rascunho'); expect(within(dialog).getByRole('button', { name: 'Salvar cliente' })).toBeDisabled()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Comparar cadastro atual' })); expect(await within(dialog).findByText(latest.name)).toBeInTheDocument(); expect(puts).toHaveLength(1)
})

it('cadastro sem permissão não consulta API nem mostra formulário', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(customer)); mount('/clientes/novo', { ...actor, roles: ['Student'], permissions: [] }); expect(screen.getByRole('heading', { name: 'Acesso restrito' })).toBeInTheDocument(); expect(fetch).not.toHaveBeenCalled(); expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument()
})

it('rota inexistente/erro não oferece criar ou editar pessoa presumida', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ message: 'Não encontrado' }, 404)); mount('/clientes/missing?acao=editar'); expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível abrir esta ficha'); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Editar cadastro' })).not.toBeInTheDocument()
})

it('perfis e conta pessoal são informativos sem conceder acesso financeiro', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ...customer, userId: 'account-fixture' })); mount('/clientes/one'); await screen.findByRole('heading', { name: customer.name }); fireEvent.click(screen.getByRole('button', { name: 'Vínculos e acesso' })); expect(screen.getByText(/Conta de acesso vinculada/)).toBeInTheDocument(); expect(screen.queryByRole('link', { name: /pagamentos/i })).not.toBeInTheDocument(); expect(screen.queryByText('account-fixture')).not.toBeInTheDocument()
})

it('troca de conta descarta rascunho e confirmação da sessão anterior sem enviar', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(customer))
  const router = mount('/clientes/novo'); fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Rascunho do operador anterior' } }); fireEvent.change(screen.getByLabelText('Telefone com DDD'), { target: { value: customer.phone } })
  await act(async () => router.actor({ ...actor, id: 'outro-operador' }))
  expect(screen.getByLabelText('Nome')).toHaveValue(''); expect(screen.getByLabelText('Telefone com DDD')).toHaveValue(''); expect(fetch).not.toHaveBeenCalled()
})

it('telefone legado inválido inalterado é preservado byte a byte ao corrigir nome', async () => {
  let body: Record<string, unknown> | undefined; const legacy = { ...customer, phone: 'Contato antigo a conferir', incomplete: true }
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => { if (init?.method === 'PUT') { body = JSON.parse(String(init.body)); return json({ ...legacy, version: 2 }) } return json(legacy) })
  mount('/clientes/one?acao=editar'); const dialog = await screen.findByRole('dialog', { name: 'Editar cliente' }); fireEvent.change(within(dialog).getByLabelText('Nome'), { target: { value: 'Nome corrigido' } }); fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar cliente' }))
  await waitFor(() => expect(body).toMatchObject({ name: 'Nome corrigido', phone: legacy.phone }))
})

it('novo cadastro incerto recupera a mesma criação após recarregar a página', async () => {
  const bodies: Record<string, unknown>[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => { if (init?.method === 'POST') { bodies.push(JSON.parse(String(init.body))); return bodies.length === 1 ? json({ message: 'Resposta perdida' }, 503) : json(customer) } return json(customer) })
  mount('/clientes/novo'); fireEvent.change(screen.getByLabelText('Nome'), { target: { value: customer.name } }); fireEvent.change(screen.getByLabelText('Telefone com DDD'), { target: { value: customer.phone } }); fireEvent.click(screen.getByRole('button', { name: 'Salvar cliente' })); await screen.findByRole('alert'); cleanup()
  const router = mount('/clientes/novo'); expect(screen.getByLabelText('Nome')).toBeDisabled(); fireEvent.click(screen.getByRole('button', { name: 'Conferir criação pendente' })); await waitFor(() => expect(router.state.location.pathname).toBe('/clientes/one')); expect(bodies).toHaveLength(2); expect(bodies[1]).toEqual(bodies[0]); expect(localStorage.length).toBe(0)
})

it.each([['students', 'Escola'], ['projects', 'Mensalistas'], ['rentalMembers', 'Mensalistas'], ['barTabs', 'Bar'], ['reservations', 'Reservas'], ['users', 'Área do cliente'], ['directory', 'Cadastro da equipe'], ['legacy-unknown', 'Cadastro anterior']])('origem %s mostra nome compreensível sem atribuir vínculo por origem', async (origin, label) => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ...customer, origin, profiles: [] })); mount('/clientes/one'); await screen.findByRole('heading', { name: customer.name }); expect(screen.getByText('Origem do cadastro').nextElementSibling).toHaveTextContent(label); expect(screen.queryByText(origin, { exact: true })).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Vínculos e acesso' })); expect(screen.getByText('Nenhum vínculo de aluno, mensalista ou Bar informado.')).toBeInTheDocument()
})
