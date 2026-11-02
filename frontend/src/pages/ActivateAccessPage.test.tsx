import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../features/auth/authContext'
import { ActivateAccessPage } from './ActivateAccessPage'

const clients: QueryClient[] = []; const routers: ReturnType<typeof createMemoryRouter>[] = []
const signOut = vi.fn().mockResolvedValue(undefined); const signInWithGoogle = vi.fn()
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const expiresAtUtc = '2099-01-01T12:00:00Z'
function mount(recovery = false, token = 'synthetic-once-token') {
  const auth: AuthContextValue = { user: null, isBootstrapping: false, signOut, signIn: vi.fn(), signInWithGoogle, changePassword: vi.fn(), completeFirstAccessWithGoogle: vi.fn() }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client)
  const router = createMemoryRouter([{ path: '*', element: <AuthContext.Provider value={auth}><ActivateAccessPage recovery={recovery} /></AuthContext.Provider> }], { initialEntries: [`/${recovery ? 'recuperar-acesso' : 'ativar'}#token=${token}`] }); routers.push(router)
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>); return { router, client }
}
function credentials() {
  fireEvent.change(screen.getByLabelText('Usuário'), { target: { value: 'pessoa.ficticia' } })
  fireEvent.change(screen.getByLabelText('Criar senha'), { target: { value: 'SenhaFicticia2!Segura' } })
  fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: 'SenhaFicticia2!Segura' } })
}
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); routers.splice(0).forEach(router => router.dispose()); vi.restoreAllMocks(); signOut.mockClear(); signInWithGoogle.mockReset(); delete window.google; document.querySelectorAll('script[data-google-identity]').forEach(element => element.remove()) })

it.each([false, true])('consome token só em memória, limpa fragmento e conclui com login normal (recuperação %s)', async recovery => {
  const writes: { path: string; body: unknown }[] = []
  const local = vi.spyOn(Storage.prototype, 'setItem')
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const path = String(url)
    if (path.endsWith('/options')) return json({ googleClientId: null, clientRegistrationEnabled: false, localLoginEnabled: true })
    const body = JSON.parse(String(init?.body)); writes.push({ path, body })
    if (path.endsWith('/inspect')) return json({ purpose: recovery ? 'Recovery' : 'Activation', expiresAtUtc })
    return new Response(null, { status: 204 })
  })
  const { router, client } = mount(recovery)
  await screen.findByLabelText('Usuário')
  expect(router.state.location.hash).toBe(''); expect(router.state.location.state).toBeNull()
  credentials(); fireEvent.click(screen.getByRole('button', { name: recovery ? /^Recuperar acesso$/ : /^Ativar conta$/ }))
  expect(await screen.findByRole('heading', { name: 'Acesso pronto' })).toBeVisible()
  expect(writes).toEqual([{ path: '/api/v1/auth/access/inspect', body: { token: 'synthetic-once-token' } }, { path: `/api/v1/auth/access/${recovery ? 'recover' : 'activate'}`, body: { token: 'synthetic-once-token', username: 'pessoa.ficticia', password: 'SenhaFicticia2!Segura' } }])
  expect(signOut).toHaveBeenCalledOnce(); expect(signInWithGoogle).not.toHaveBeenCalled()
  expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login')
  expect(JSON.stringify(client.getQueryCache().getAll().map(query => ({ key: query.queryKey, data: query.state.data })))).not.toContain('synthetic-once-token')
  expect(local.mock.calls.every(args => !JSON.stringify(args).includes('synthetic-once-token') && !JSON.stringify(args).includes('SenhaFicticia2!Segura'))).toBe(true)
})

it.each([{ purpose: 'Recovery', expiresAtUtc }, { purpose: 'Activation', expiresAtUtc: '2020-01-01T00:00:00Z' }])('link de outra finalidade ou expirado não oferece ativação %j', async inspection => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async url => String(url).endsWith('/options') ? json({ googleClientId: null, localLoginEnabled: true }) : json(inspection))
  mount(); expect(await screen.findByRole('alert')).toHaveTextContent('Link inválido ou expirado')
  expect(screen.queryByLabelText('Usuário')).not.toBeInTheDocument(); expect(signOut).not.toHaveBeenCalled()
})

it('token ausente não é consultado e não aparece formulário', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ googleClientId: null, localLoginEnabled: true }))
  mount(false, ''); expect(await screen.findByRole('alert')).toHaveTextContent('Link inválido')
  expect(fetch.mock.calls.every(([url]) => String(url).endsWith('/options'))).toBe(true)
  expect(screen.queryByLabelText('Usuário')).not.toBeInTheDocument()
})

it('opção local desligada impede ativação e recuperação por senha na interface', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => String(url).endsWith('/options') ? json({ googleClientId: null, localLoginEnabled: false }) : json({ purpose: 'Recovery', expiresAtUtc }))
  mount(true); expect(await screen.findByText('O acesso com usuário e senha está indisponível. Peça ajuda à equipe.')).toBeVisible()
  expect(screen.queryByLabelText('Usuário')).not.toBeInTheDocument(); expect(fetch.mock.calls.every(([url]) => !String(url).endsWith('/recover'))).toBe(true)
})

it('ativação Google consome o convite antes de oferecer entrar, sem criar pelo login Google', async () => {
  let callback: (value: { credential: string }) => void = () => {}
  window.google = { accounts: { id: { initialize: value => { callback = value.callback }, renderButton: element => { const button = document.createElement('button'); button.textContent = 'Continuar com Google'; button.onclick = () => callback({ credential: 'synthetic-google' }); element.append(button) } } } }
  const writes: { path: string; body: unknown; authorization: string | null }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const path = String(url)
    if (path.endsWith('/options')) return json({ googleClientId: 'test-google', clientRegistrationEnabled: true })
    writes.push({ path, body: JSON.parse(String(init?.body)), authorization: new Headers(init?.headers).get('Authorization') })
    return path.endsWith('/inspect') ? json({ purpose: 'Activation', expiresAtUtc }) : new Response(null, { status: 204 })
  })
  mount(); fireEvent.click(await screen.findByRole('button', { name: 'Continuar com Google' }))
  expect(await screen.findByRole('heading', { name: 'Acesso pronto' })).toBeVisible()
  expect(writes.at(-1)).toEqual({ path: '/api/v1/auth/access/activate/google', body: { token: 'synthetic-once-token' }, authorization: 'Bearer synthetic-google' })
  expect(signInWithGoogle).not.toHaveBeenCalled()
})

it('recusa da ativação mantém dados e nunca confirma sucesso ou duplica envio pendente', async () => {
  let finish!: (value: Response) => void
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => String(url).endsWith('/options') ? json({ googleClientId: null, localLoginEnabled: true }) : String(url).endsWith('/inspect') ? json({ purpose: 'Activation', expiresAtUtc }) : new Promise<Response>(resolve => { finish = resolve }))
  mount(); await screen.findByLabelText('Usuário'); credentials()
  const submit = screen.getByRole('button', { name: 'Ativar conta' }); fireEvent.click(submit); fireEvent.click(submit)
  await waitFor(() => expect(submit).toBeDisabled()); expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/activate'))).toHaveLength(1)
  finish(json({ message: 'Link indisponível. Peça um novo à equipe.' }, 409))
  expect(await screen.findByRole('alert')).toHaveTextContent('Link indisponível')
  expect(screen.getByLabelText('Usuário')).toHaveValue('pessoa.ficticia'); expect(screen.queryByRole('heading', { name: 'Acesso pronto' })).not.toBeInTheDocument(); expect(signOut).not.toHaveBeenCalled()
})

it('novo fragmento na mesma página substitui o token e limpa os dados da ativação anterior', async () => {
  const writes: { path: string; token: string }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const path = String(url)
    if (path.endsWith('/options')) return json({ googleClientId: null, localLoginEnabled: true })
    writes.push({ path, token: JSON.parse(String(init?.body)).token })
    return path.endsWith('/inspect') ? json({ purpose: 'Activation', expiresAtUtc }) : new Response(null, { status: 204 })
  })
  const { router } = mount(); await screen.findByLabelText('Usuário'); credentials()
  await act(() => router.navigate('/ativar#token=synthetic-token-B'))
  await waitFor(() => expect(screen.getByLabelText('Usuário')).toHaveValue(''))
  expect(router.state.location.hash).toBe(''); credentials(); fireEvent.click(screen.getByRole('button', { name: 'Ativar conta' }))
  await screen.findByRole('heading', { name: 'Acesso pronto' })
  expect(writes).toEqual([{ path: '/api/v1/auth/access/inspect', token: 'synthetic-once-token' }, { path: '/api/v1/auth/access/inspect', token: 'synthetic-token-B' }, { path: '/api/v1/auth/access/activate', token: 'synthetic-token-B' }])
})

it('resposta de uma ativação anterior não conclui nem encerra a sessão de um novo link aberto', async () => {
  let finish!: (value: Response) => void
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (String(url).endsWith('/options')) return json({ googleClientId: null, localLoginEnabled: true })
    if (String(url).endsWith('/inspect')) return json({ purpose: 'Activation', expiresAtUtc })
    if (JSON.parse(String(init?.body)).token === 'synthetic-once-token') return new Promise<Response>(resolve => { finish = resolve })
    return new Response(null, { status: 204 })
  })
  const { router } = mount(); await screen.findByLabelText('Usuário'); credentials(); fireEvent.click(screen.getByRole('button', { name: 'Ativar conta' }))
  await act(() => router.navigate('/ativar#token=synthetic-token-B')); await screen.findByLabelText('Usuário')
  await act(async () => finish(new Response(null, { status: 204 })))
  expect(screen.queryByRole('heading', { name: 'Acesso pronto' })).not.toBeInTheDocument(); expect(signOut).not.toHaveBeenCalled()
  credentials(); fireEvent.click(screen.getByRole('button', { name: 'Ativar conta' })); await screen.findByRole('heading', { name: 'Acesso pronto' }); expect(signOut).toHaveBeenCalledOnce()
})
