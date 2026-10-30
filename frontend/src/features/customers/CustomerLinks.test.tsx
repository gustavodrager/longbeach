import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../auth/authContext'
import type { AuthUser } from '../auth/types'
import { CustomerLinks } from './CustomerLinks'
import type { Customer } from './api'

const actor: AuthUser = { id: 'operator-fixture', name: 'Operação fictícia', email: 'operator@example.invalid', roles: ['Operations'], permissions: ['customers:read', 'customers:write', 'students:read'] }
const customer: Customer = { id: 'customer-fixture', name: 'Pessoa Teste', phone: '11988887777', email: null, status: 'Ativo', version: 2, origin: 'Manual', incomplete: false, userId: null, profiles: ['Aluno'], mergedIntoId: null }
const manager: AuthUser = { ...actor, roles: ['Manager'], permissions: ['customers:read', 'customers:write', 'users:manage'] }
const clients: QueryClient[] = []; const routers: ReturnType<typeof createMemoryRouter>[] = []
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }) }
function mount(user = actor, refresh = vi.fn()) {
  const auth: AuthContextValue = { user, isBootstrapping: false, signIn: async () => {}, signInWithGoogle: async () => {}, signOut: async () => {}, changePassword: async () => {}, completeFirstAccessWithGoogle: async () => {} }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client)
  const router = createMemoryRouter([{ path: '*', element: <AuthContext.Provider value={auth}><CustomerLinks customer={customer} refresh={refresh} /></AuthContext.Provider> }]); routers.push(router)
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>); return { refresh }
}
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); routers.splice(0).forEach(router => router.dispose()); vi.restoreAllMocks() })

it('links usam sourceId/parentId reais e ocultam registros sem a permissão de origem', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json([{ kind: 'students', sourceId: 'student-other-id', parentId: null, name: 'Ficha escolar sintética' }, { kind: 'rentalMembers', sourceId: 'member-id', parentId: 'group-other-id', name: 'Grupo privado sintético' }, { kind: 'tabs', sourceId: 'tab-id', parentId: null, name: 'Comanda privada sintética' }]))
  mount(); expect(await screen.findByRole('link', { name: /Ficha escolar sintética/ })).toHaveAttribute('href', '/alunos/student-other-id'); expect(screen.queryByText(/Grupo privado/)).not.toBeInTheDocument(); expect(screen.queryByText(/Comanda privada/)).not.toBeInTheDocument(); expect(screen.queryByLabelText('Buscar conta Google')).not.toBeInTheDocument()
})

it('mensalista aponta para grupo pai, preservando identidade distinta do cliente e do integrante', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json([{ kind: 'rentalMembers', sourceId: 'member-id', parentId: 'group-other-id', name: 'Grupo Sintético' }]))
  mount({ ...actor, permissions: ['customers:read', 'projects:read'] }); expect(await screen.findByRole('link', { name: /Grupo Sintético/ })).toHaveAttribute('href', '/mensalistas/group-other-id?secao=integrantes')
})

it.each([{ ...actor, permissions: [...actor.permissions, 'users:manage'] }, { ...manager, roles: ['Manager', 'Student'] as AuthUser['roles'] }])('associação não aparece fora do gestor ou com perfis acumulados', user => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json([])); mount(user); expect(screen.queryByLabelText('Buscar conta Google')).not.toBeInTheDocument(); expect(fetch.mock.calls.every(([url]) => !String(url).includes('user-candidates'))).toBe(true)
})

it('gestão pesquisa Google por nome/e-mail mascarado e confirma associação sem campos UUID', async () => {
  const writes: unknown[] = []; const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => { if (String(url).endsWith('/links')) return json([]); if (init?.method === 'POST') { writes.push(JSON.parse(String(init.body))); return json({ ...customer, userId: 'user-fixture', version: 3 }) } return json([{ id: 'user-fixture', name: 'Conta Pessoa Teste', emailHint: 'p••••@example.invalid' }]) })
  mount(manager); const search = screen.getByLabelText('Buscar conta Google'); fireEvent.change(search, { target: { value: 'P' } }); expect(fetch.mock.calls.some(([url]) => String(url).includes('user-candidates'))).toBe(false); fireEvent.change(search, { target: { value: 'Pessoa' } }); fireEvent.click(await screen.findByRole('button', { name: 'Conta Pessoa Teste · p••••@example.invalid' })); expect(screen.queryByText('user-fixture')).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Confirmar associação da conta' })).toBeDisabled(); fireEvent.click(screen.getByRole('checkbox', { name: /Conferi a identidade/ })); fireEvent.click(screen.getByRole('button', { name: 'Confirmar associação da conta' })); await waitFor(() => expect(writes).toEqual([{ userId: 'user-fixture', expectedVersion: 2 }])); expect(screen.getByText(/não concede automaticamente/)).toBeInTheDocument()
})

it('conflito de associação mantém escolha e exige atualizar antes de outro envio', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => String(url).endsWith('/links') ? json([]) : init?.method === 'POST' ? json({ message: 'Ficha alterada em outro atendimento' }, 409) : json([{ id: 'user-fixture', name: 'Conta Teste', emailHint: 't••••@example.invalid' }]))
  const { refresh } = mount(manager); fireEvent.change(screen.getByLabelText('Buscar conta Google'), { target: { value: 'Conta' } }); fireEvent.click(await screen.findByRole('button', { name: /Conta Teste/ })); fireEvent.click(screen.getByRole('checkbox', { name: /Conferi a identidade/ })); fireEvent.click(screen.getByRole('button', { name: 'Confirmar associação da conta' })); expect(await screen.findByRole('alert')).toHaveTextContent('Atualize a ficha'); expect(screen.getByRole('button', { name: 'Confirmar associação da conta' })).toBeDisabled(); fireEvent.click(screen.getByRole('button', { name: 'Atualizar ficha para nova conferência' })); expect(refresh).toHaveBeenCalledOnce(); expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
})
