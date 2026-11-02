import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../auth/authContext'
import { CustomerAccountAccess } from './CustomerAccountAccess'
import type { Customer } from './api'

const customer: Customer = { id: 'customer-fake', name: 'Pessoa Fictícia', phone: '11988887777', email: null, status: 'Ativo', version: 2, origin: 'Manual', incomplete: false, userId: null, profiles: [], mergedIntoId: null }
const pending = { status: 'Pending', userId: null, username: null, googleLinked: false, localPasswordEnabled: false, invitationExpiresAtUtc: null }
const clients: QueryClient[] = []
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client)
  const auth: AuthContextValue = { user: { id: 'manager-fake', name: 'Gestão Fictícia', email: 'manager@example.invalid', roles: ['Manager'], permissions: [] }, isBootstrapping: false, signOut: vi.fn(), signIn: vi.fn(), signInWithGoogle: vi.fn(), changePassword: vi.fn(), completeFirstAccessWithGoogle: vi.fn() }
  const refresh = vi.fn()
  const view = render(<QueryClientProvider client={client}><MemoryRouter><AuthContext.Provider value={auth}><CustomerAccountAccess customer={customer} refresh={refresh} /></AuthContext.Provider></MemoryRouter></QueryClientProvider>)
  return { ...view, client, refresh }
}
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks() })

it('emitir convite exige identidade, gera URL com fragmento e não guarda token no cache ou armazenamento', async () => {
  const stored = vi.spyOn(Storage.prototype, 'setItem'); const writes: { path: string; body: unknown }[] = []
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (init?.method === 'POST') { writes.push({ path: String(url), body: JSON.parse(String(init.body)) }); return json({ token: 'synthetic-private-invitation', purpose: 'Activation', expiresAtUtc: '2099-01-01T12:00:00Z' }) }
    return json(pending)
  })
  const { client } = mount(); await screen.findByText('Aguardando ativação')
  fireEvent.click(screen.getByText('Gerenciar acesso'))
  const submit = screen.getByRole('button', { name: 'Gerar link de ativação' }); expect(submit).toBeDisabled()
  expect(fetch.mock.calls.every(([, init]) => !init?.method)).toBe(true)
  fireEvent.click(screen.getByRole('checkbox', { name: /Conferi a identidade do cliente/ })); fireEvent.click(submit)
  const field = await screen.findByLabelText('Link para entregar')
  expect(field).toHaveValue(`${window.location.origin}/ativar#token=synthetic-private-invitation`)
  expect(writes).toEqual([{ path: '/api/v1/customers/customer-fake/access/invitations', body: { expectedVersion: 2, identityConfirmed: true } }])
  expect(screen.getByRole('img', { name: 'QR Code para concluir o acesso pessoal' })).toBeVisible()
  expect(JSON.stringify(client.getQueryCache().getAll().map(query => query.state.data))).not.toContain('synthetic-private-invitation')
  expect(stored.mock.calls.some(args => JSON.stringify(args).includes('synthetic-private-invitation'))).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Ocultar link' })); expect(screen.queryByLabelText('Link para entregar')).not.toBeInTheDocument()
})

it('recuperação informa consequência e usa a rota de recuperação, sem criar outra conta', async () => {
  const writes: { path: string; body: unknown }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (init?.method === 'POST') { writes.push({ path: String(url), body: JSON.parse(String(init.body)) }); return json({ token: 'synthetic-recovery', purpose: 'Recovery', expiresAtUtc: '2099-01-01T12:00:00Z' }) }
    return json({ ...pending, status: 'Active', userId: 'client-user', username: 'pessoa.ficticia', localPasswordEnabled: true })
  })
  mount(); await screen.findByText('Ativa'); fireEvent.click(screen.getByText('Gerenciar acesso'))
  expect(screen.getByText(/Usar a recuperação substitui o acesso/)).toBeVisible()
  fireEvent.click(screen.getByRole('checkbox', { name: /Conferi a identidade do cliente/ })); fireEvent.click(screen.getByRole('button', { name: 'Gerar link de recuperação' }))
  expect(await screen.findByLabelText('Link para entregar')).toHaveValue(`${window.location.origin}/recuperar-acesso#token=synthetic-recovery`)
  expect(writes[0]?.path).toBe('/api/v1/customers/customer-fake/access/recovery')
  expect(screen.queryByRole('button', { name: 'Gerar link de ativação' })).not.toBeInTheDocument()
})

it('revoga links pendentes sem alterar ficha ou emitir outro convite', async () => {
  const writes: { path: string; body: unknown }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (init?.method === 'POST') { writes.push({ path: String(url), body: JSON.parse(String(init.body)) }); return new Response(null, { status: 204 }) }
    return json({ ...pending, status: 'Invited', invitationExpiresAtUtc: '2099-01-01T12:00:00Z' })
  })
  mount(); await screen.findByText('Convite pendente'); fireEvent.click(screen.getByText('Gerenciar acesso')); fireEvent.click(screen.getByRole('button', { name: 'Revogar links pendentes' }))
  expect(await screen.findByText('Links pendentes revogados.')).toBeVisible()
  expect(writes).toEqual([{ path: '/api/v1/customers/customer-fake/access/revoke', body: { expectedVersion: 2 } }])
})

it('falha ou conflito não exibe link e exige atualizar a ficha antes de repetir', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => init?.method === 'POST' ? json({ message: 'Cadastro alterado.' }, 409) : json(pending))
  const { refresh } = mount(); await screen.findByText('Aguardando ativação'); fireEvent.click(screen.getByText('Gerenciar acesso')); fireEvent.click(screen.getByRole('checkbox', { name: /Conferi a identidade do cliente/ })); fireEvent.click(screen.getByRole('button', { name: 'Gerar link de ativação' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Cadastro alterado'); expect(screen.queryByLabelText('Link para entregar')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Gerar link de ativação' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar ficha para nova conferência' })); expect(refresh).toHaveBeenCalledOnce()
  expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
})

it('dependente não oferece conta própria e vincula responsável com versão separada', async () => {
  const writes: { path: string; body: unknown }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const path = String(url)
    if (init?.method === 'PUT') { writes.push({ path, body: JSON.parse(String(init.body)) }); return new Response(null, { status: 204 }) }
    if (path.includes('/guardian-candidates?')) return json([{ id: 'guardian-fake', name: 'Responsável Fictício', emailHint: 'r•••@example.invalid' }])
    if (path.endsWith('/guardians')) return json([])
    return json({ ...pending, status: 'Guardian' })
  })
  mount(); await screen.findByText('Acesso pelo responsável'); fireEvent.click(screen.getByText('Gerenciar acesso'))
  expect(screen.queryByRole('button', { name: 'Gerar link de ativação' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('Acesso por responsável'))
  fireEvent.change(await screen.findByLabelText('Buscar responsável'), { target: { value: 'Responsável' } })
  fireEvent.click(await screen.findByRole('button', { name: 'Responsável Fictício · r•••@example.invalid' }))
  expect(screen.getByRole('button', { name: 'Vincular responsável' })).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox', { name: /Conferi a identidade e a autorização do responsável/ })); fireEvent.click(screen.getByRole('button', { name: 'Vincular responsável' }))
  await waitFor(() => expect(writes).toEqual([{ path: '/api/v1/customers/customer-fake/guardians/guardian-fake', body: { isGranted: true, expectedVersion: 0 } }]))
})

it.each(['FirstAccess', 'Pending'])('conta já vinculada em %s não oferece novo convite ou recuperação', async status => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ...pending, status, userId: 'existing-user' }))
  mount(); await screen.findByText(status === 'FirstAccess' ? 'Primeiro acesso pendente' : 'Aguardando ativação'); fireEvent.click(screen.getByText('Gerenciar acesso'))
  expect(screen.queryByRole('button', { name: 'Gerar link de ativação' })).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Gerar link de recuperação' })).not.toBeInTheDocument()
  if (status === 'FirstAccess') expect(screen.getByText('Use o acesso inicial entregue pela gestão.')).toBeVisible()
})
