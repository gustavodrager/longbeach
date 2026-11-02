import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../features/auth/authContext'
import { AccountPage } from './AccountPage'

type Methods = { username: string | null; googleLinked: boolean; localPasswordEnabled: boolean }
const clients: QueryClient[] = []; const routers: ReturnType<typeof createMemoryRouter>[] = []
const signOut = vi.fn().mockResolvedValue(undefined)
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
function google() {
  let callback: (value: { credential: string }) => void = () => {}
  window.google = { accounts: { id: { initialize: value => { callback = value.callback }, renderButton: element => { const button = document.createElement('button'); button.textContent = 'Confirmar Google'; button.onclick = () => callback({ credential: 'synthetic-fresh-google' }); element.append(button) } } } }
}
function mount(methods: Methods, fail = false) {
  const writes: { body: unknown; google: string | null }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (init?.method === 'PUT') { writes.push({ body: JSON.parse(String(init.body)), google: new Headers(init.headers).get('X-Google-Id-Token') }); return fail ? json({ message: 'Não foi possível confirmar sua identidade.' }, 403) : new Response(null, { status: 204 }) }
    return String(url).endsWith('/auth/options') ? json({ googleClientId: 'test-google', clientRegistrationEnabled: true, localLoginEnabled: true }) : json(methods)
  })
  const auth: AuthContextValue = { user: { id: 'client-fake', name: 'Pessoa Fictícia', email: 'person@example.invalid', roles: ['Student'], permissions: [], ...methods }, isBootstrapping: false, signOut, signIn: vi.fn(), signInWithGoogle: vi.fn(), changePassword: vi.fn(), completeFirstAccessWithGoogle: vi.fn() }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client)
  const router = createMemoryRouter([{ path: '/minha-area/seguranca', element: <AuthContext.Provider value={auth}><AccountPage /></AuthContext.Provider> }, { path: '/login', element: <h1>Entrar novamente</h1> }], { initialEntries: ['/minha-area/seguranca'] }); routers.push(router)
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>); return { writes, router }
}
function passwords() { fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'SenhaFicticia2!Segura' } }); fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: 'SenhaFicticia2!Segura' } }) }
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); routers.splice(0).forEach(router => router.dispose()); vi.restoreAllMocks(); signOut.mockClear(); delete window.google; document.querySelectorAll('script[data-google-identity]').forEach(element => element.remove()) })

it('conta Google pode adicionar senha confirmando novamente o mesmo Google e depois entra de novo', async () => {
  google(); const { writes } = mount({ username: null, googleLinked: true, localPasswordEnabled: false })
  fireEvent.click(await screen.findByText('Adicionar usuário e senha'))
  fireEvent.change(screen.getByLabelText('Usuário'), { target: { value: 'pessoa.ficticia' } }); passwords()
  fireEvent.click(await screen.findByRole('button', { name: 'Confirmar Google' }))
  expect(await screen.findByRole('heading', { name: 'Entrar novamente' })).toBeVisible()
  expect(writes).toEqual([{ body: { action: 'password', currentPassword: null, username: 'pessoa.ficticia', newPassword: 'SenhaFicticia2!Segura' }, google: 'synthetic-fresh-google' }])
  expect(signOut).toHaveBeenCalledOnce()
})

it('conta com senha exige senha atual para vincular Google sem remover o acesso local', async () => {
  google(); const { writes } = mount({ username: 'pessoa.ficticia', googleLinked: false, localPasswordEnabled: true })
  fireEvent.click(await screen.findByText('Vincular Google'))
  fireEvent.click(await screen.findByRole('button', { name: 'Confirmar Google' })); expect(writes).toEqual([])
  fireEvent.change(screen.getByLabelText('Senha atual para vincular Google'), { target: { value: 'SenhaAtualFicticia2!' } })
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar Google' }))
  await screen.findByRole('heading', { name: 'Entrar novamente' })
  expect(writes).toEqual([{ body: { action: 'google', currentPassword: 'SenhaAtualFicticia2!' }, google: 'synthetic-fresh-google' }])
})

it('conta com ambos mantém Google visível e altera senha com confirmação local', async () => {
  google(); const { writes } = mount({ username: 'pessoa.ficticia', googleLinked: true, localPasswordEnabled: true })
  fireEvent.click(await screen.findByText('Alterar senha')); expect(screen.getByRole('heading', { name: 'Acesso pelo Google' })).toBeVisible()
  passwords(); fireEvent.click(screen.getByRole('button', { name: 'Salvar com a senha atual' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Confirme com sua senha atual'); expect(writes).toEqual([])
  fireEvent.change(screen.getByLabelText('Senha atual'), { target: { value: 'SenhaAtualFicticia2!' } }); fireEvent.click(screen.getByRole('button', { name: 'Salvar com a senha atual' }))
  await screen.findByRole('heading', { name: 'Entrar novamente' }); expect(writes).toHaveLength(1); expect(writes[0]?.google).toBeNull()
})

it('reautenticação recusada conserva formulário, conta e métodos sem confirmar alteração', async () => {
  google(); const { writes, router } = mount({ username: 'pessoa.ficticia', googleLinked: true, localPasswordEnabled: false }, true)
  fireEvent.click(await screen.findByText('Adicionar usuário e senha')); passwords(); fireEvent.click(await screen.findByRole('button', { name: 'Confirmar Google' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível confirmar sua identidade.')
  expect(screen.getByLabelText('Nova senha')).toHaveValue('SenhaFicticia2!Segura'); expect(router.state.location.pathname).toBe('/minha-area/seguranca')
  expect(writes).toHaveLength(1); expect(signOut).not.toHaveBeenCalled()
})
