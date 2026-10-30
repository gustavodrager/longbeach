import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../features/auth/authContext'
import type { AuthUser, UserRole } from '../features/auth/types'
import { VisitorPage } from './VisitorPage'

const clients: QueryClient[] = []
const routers: ReturnType<typeof createMemoryRouter>[] = []
const signIn = vi.fn(); const signInWithGoogle = vi.fn()
function mount(user: AuthUser | null = null, state?: unknown) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client)
  const auth: AuthContextValue = { user, signIn, signInWithGoogle, isBootstrapping: false, signOut: vi.fn(), changePassword: vi.fn(), completeFirstAccessWithGoogle: vi.fn() }
  const router = createMemoryRouter([
    { path: '/visitante', element: <VisitorPage /> },
    { path: '/login', element: <h1>Acesso à conta</h1> },
  ], { initialEntries: [{ pathname: '/visitante', state }] }); routers.push(router)
  render(<QueryClientProvider client={client}><AuthContext.Provider value={auth}><RouterProvider router={router} /></AuthContext.Provider></QueryClientProvider>)
  return router
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const enabledOptions = { googleClientId: 'google-client', clientRegistrationEnabled: true }
const account = (role: UserRole, extra: Partial<AuthUser> = {}): AuthUser => ({
  id: 'test-user', name: 'Pessoa', email: 'person@example.invalid', roles: [role], permissions: [], ...extra,
})
afterEach(() => { cleanup(); routers.splice(0).forEach(router => router.dispose()); clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks(); signIn.mockReset(); signInWithGoogle.mockReset() })

it('visitante consulta a entrada pública sem ganhar identidade ou acesso privado', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(enabledOptions))
  mount()
  expect(screen.getByRole('heading', { name: 'Bem-vindo à Long Beach', level: 1 })).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Long Beach Arena' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Ver cardápio' })).toHaveAttribute('href', '/cardapio/apresentacao')
  expect(await screen.findByRole('link', { name: 'Criar conta' })).toHaveAttribute('href', '/login?cadastro=cliente')
  expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login')
  expect(screen.queryByRole('link', { name: 'Área de trabalho' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Minha área' })).not.toBeInTheDocument()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(signIn).not.toHaveBeenCalled(); expect(signInWithGoogle).not.toHaveBeenCalled()
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch.mock.calls.every(([url, init]) => String(url).endsWith('/auth/options') && !init?.method)).toBe(true)
})

it.each([
  { googleClientId: 'google-client', clientRegistrationEnabled: false },
  { googleClientId: null, clientRegistrationEnabled: true },
  { googleClientId: '', clientRegistrationEnabled: true },
  { googleClientId: 'google-client' },
])('respeita a disponibilidade real de cadastro: %j', async options => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(options)); mount()
  expect(await screen.findByText('Para criar sua conta, fale com a equipe.')).toBeVisible()
  expect(screen.queryByRole('link', { name: 'Criar conta' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login')
  expect(screen.getByRole('link', { name: 'Ver cardápio' })).toHaveAttribute('href', '/cardapio/apresentacao')
  expect(signIn).not.toHaveBeenCalled(); expect(signInWithGoogle).not.toHaveBeenCalled()
})

it('mantém entrar e cardápio disponíveis enquanto consulta o cadastro', async () => {
  let resolve!: (response: Response) => void
  vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>(done => { resolve = done }))
  mount()
  expect(screen.getByRole('status')).toHaveTextContent('Carregando opções de cadastro…')
  expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login')
  expect(screen.getByRole('link', { name: 'Ver cardápio' })).toHaveAttribute('href', '/cardapio/apresentacao')
  expect(screen.queryByRole('link', { name: 'Criar conta' })).not.toBeInTheDocument()
  resolve(json(enabledOptions))
  await screen.findByRole('link', { name: 'Criar conta' })
  expect(screen.queryByText('Carregando opções de cadastro…')).not.toBeInTheDocument()
})

it('mantém visita pública e permite recuperar consulta das opções', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline')).mockResolvedValue(json(enabledOptions))
  mount(); expect(await screen.findByText('Não foi possível consultar o cadastro.')).toBeVisible()
  expect(screen.queryByRole('link', { name: 'Criar conta' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Entrar' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Ver cardápio' })).toBeInTheDocument()
  await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar novamente' }))
  await screen.findByRole('link', { name: 'Criar conta' })
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(fetch.mock.calls.every(([url, init]) => String(url).endsWith('/auth/options') && !init?.method)).toBe(true)
  expect(signIn).not.toHaveBeenCalled(); expect(signInWithGoogle).not.toHaveBeenCalled()
})

it('cliente autenticado encontra uma única entrada para sua área e o cardápio', () => {
  const fetch = vi.spyOn(globalThis, 'fetch')
  mount(account('Student'))
  expect(screen.getByRole('link', { name: 'Minha área' })).toHaveAttribute('href', '/minha-area')
  expect(screen.getByRole('link', { name: 'Ver cardápio' })).toHaveAttribute('href', '/cardapio/apresentacao')
  expect(screen.queryByRole('link', { name: 'Área de trabalho' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Entrar' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Criar conta' })).not.toBeInTheDocument()
  expect(fetch).not.toHaveBeenCalled()
})

it.each([
  { role: 'Manager' as const, permissions: [], destination: '/' },
  { role: 'Teacher' as const, permissions: [], destination: '/professor' },
  { role: 'Operations' as const, permissions: ['bar:sales:operate'], destination: '/atendimento/vender' },
  { role: 'Operations' as const, permissions: [], destination: '/' },
])('leva $role à sua área de trabalho em $destination sem nova autenticação', ({ role, permissions, destination }) => {
  const fetch = vi.spyOn(globalThis, 'fetch')
  mount(account(role, { permissions }))
  expect(screen.getByRole('link', { name: 'Área de trabalho' })).toHaveAttribute('href', destination)
  expect(screen.getByRole('link', { name: 'Minha área' })).toHaveAttribute('href', '/minha-area')
  expect(screen.getByRole('link', { name: 'Ver cardápio' })).toHaveAttribute('href', '/cardapio/apresentacao')
  expect(screen.queryByRole('link', { name: 'Entrar' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Criar conta' })).not.toBeInTheDocument()
  expect(fetch).not.toHaveBeenCalled()
  expect(signIn).not.toHaveBeenCalled(); expect(signInWithGoogle).not.toHaveBeenCalled()
})

it.each<UserRole>(['Manager', 'Teacher', 'Operations', 'Student'])('direciona o primeiro acesso de %s antes de oferecer áreas privadas', role => {
  const fetch = vi.spyOn(globalThis, 'fetch')
  mount(account(role, { requiresFirstAccess: true, permissions: ['bar:sales:operate'] }))
  expect(screen.getByRole('link', { name: 'Concluir acesso' })).toHaveAttribute('href', '/primeiro-acesso')
  expect(screen.getByRole('link', { name: 'Ver cardápio' })).toHaveAttribute('href', '/cardapio/apresentacao')
  expect(screen.queryByRole('link', { name: 'Área de trabalho' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Minha área' })).not.toBeInTheDocument()
  expect(fetch).not.toHaveBeenCalled()
})

it.each([
  { action: 'Entrar', search: '' },
  { action: 'Criar conta', search: '?cadastro=cliente' },
])('preserva o retorno completo ao escolher $action', async ({ action, search }) => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(enabledOptions))
  const state = { from: { pathname: '/cliente', search: '?origem=qr', hash: '#token=synthetic-qr' }, returnTo: '/agenda?date=2026-10-30#atividade', returnLabel: 'Voltar à agenda' }
  const router = mount(null, state)
  await userEvent.setup().click(await screen.findByRole('link', { name: action }))
  await screen.findByRole('heading', { name: 'Acesso à conta' })
  expect(router.state.location.pathname).toBe('/login')
  expect(router.state.location.search).toBe(search)
  expect(router.state.location.state).toEqual(state)
})

it('mantém a ajuda recolhida e permite alcançá-la pelo teclado', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(enabledOptions))
  mount(); await screen.findByRole('link', { name: 'Criar conta' })
  const summary = screen.getByText('Precisa de ajuda?')
  const details = summary.closest('details')
  const qrHelp = screen.getByText('Peça à equipe o QR Code da sua comanda.')
  const accountHelp = screen.getByText('Aulas, reservas e pagamentos aparecem após a equipe vincular seu cadastro.')
  expect(details).not.toHaveAttribute('open')
  expect(qrHelp).not.toBeVisible(); expect(accountHelp).not.toBeVisible()
  const user = userEvent.setup()
  for (let tab = 0; tab < 8 && document.activeElement !== summary; tab++) await user.tab()
  expect(summary).toHaveFocus()
  // JSDOM does not activate summary with Enter/Space; browser QA checks those keys.
  await user.click(summary)
  expect(details).toHaveAttribute('open')
  expect(qrHelp).toBeVisible(); expect(accountHelp).toBeVisible()
  await user.click(summary)
  expect(details).not.toHaveAttribute('open')
  expect(qrHelp).not.toBeVisible(); expect(accountHelp).not.toBeVisible()
})
