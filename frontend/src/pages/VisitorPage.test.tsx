import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../features/auth/authContext'
import type { AuthUser } from '../features/auth/types'
import { VisitorPage } from './VisitorPage'

const clients: QueryClient[] = []
const signIn = vi.fn(); const signInWithGoogle = vi.fn()
function mount(user: AuthUser | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client)
  const auth: AuthContextValue = { user, signIn, signInWithGoogle, isBootstrapping: false, signOut: vi.fn(), changePassword: vi.fn(), completeFirstAccessWithGoogle: vi.fn() }
  render(<QueryClientProvider client={client}><AuthContext.Provider value={auth}><MemoryRouter initialEntries={['/visitante']}><VisitorPage /></MemoryRouter></AuthContext.Provider></QueryClientProvider>)
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks(); signIn.mockReset(); signInWithGoogle.mockReset() })

it('visitante consulta a entrada pública sem ganhar identidade ou acesso privado', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ googleClientId: 'google-client', clientRegistrationEnabled: true }))
  mount()
  expect(screen.getByRole('heading', { name: 'Seu momento na arena começa aqui.' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Ver cardápio' })).toHaveAttribute('href', '/cardapio/apresentacao')
  expect(await screen.findByRole('link', { name: 'Cadastrar como cliente' })).toHaveAttribute('href', '/login?cadastro=cliente')
  expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login')
  expect(screen.queryByRole('link', { name: 'Área de trabalho' })).not.toBeInTheDocument()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(signIn).not.toHaveBeenCalled(); expect(signInWithGoogle).not.toHaveBeenCalled()
  expect(fetch.mock.calls.every(([url, init]) => String(url).endsWith('/auth/options') && !init?.method)).toBe(true)
  expect(screen.getByText(/vinculados após conferência da equipe/)).toBeInTheDocument()
})

it.each([
  { googleClientId: 'google-client', clientRegistrationEnabled: false },
  { googleClientId: null, clientRegistrationEnabled: true },
])('respeita a disponibilidade real de cadastro: %j', async options => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(options)); mount()
  await screen.findByText(/Para cadastrar seu acesso, procure a equipe/)
  expect(screen.queryByRole('link', { name: 'Cadastrar como cliente' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Ver cardápio' })).toBeInTheDocument()
})

it('mantém visita pública e permite recuperar consulta das opções', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline')).mockResolvedValue(json({ googleClientId: 'google-client', clientRegistrationEnabled: true }))
  mount(); await screen.findByText(/Não foi possível consultar o cadastro agora/)
  expect(screen.queryByRole('link', { name: 'Cadastrar como cliente' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  await screen.findByRole('link', { name: 'Cadastrar como cliente' }); expect(fetch).toHaveBeenCalledTimes(2)
})

it('cliente autenticado pode abrir sua área sem criar um perfil visitante', () => {
  const fetch = vi.spyOn(globalThis, 'fetch')
  mount({ id: 'client', name: 'Cliente', email: 'client@example.invalid', roles: ['Student'], permissions: [] })
  expect(screen.getByRole('link', { name: 'Abrir minha área' })).toHaveAttribute('href', '/minha-area')
  expect(screen.getByRole('link', { name: 'Minha área' })).toHaveAttribute('href', '/minha-area')
  expect(screen.queryByRole('link', { name: 'Cadastrar como cliente' })).not.toBeInTheDocument()
  expect(fetch).not.toHaveBeenCalled()
})
