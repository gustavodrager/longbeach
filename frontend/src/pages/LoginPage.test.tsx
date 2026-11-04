import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext } from '../features/auth/authContext'
import { LoginPage } from './LoginPage'
import { AccountPage } from './AccountPage'
import type { AuthUser } from '../features/auth/types'

const clients: QueryClient[] = []
const routers: ReturnType<typeof createMemoryRouter>[] = []
const signInWithGoogle = vi.fn()
const signIn = vi.fn()
function mount(page = <LoginPage />, user: AuthUser | null = null, path = '/login', state?: unknown, isBootstrapping = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client)
  const url = new URL(path, 'https://test.example.invalid')
  const router = createMemoryRouter([
    { path: '/login', element: page },
    { path: '*', element: <h1>Destino após o acesso</h1> },
  ], { initialEntries: [{ pathname: url.pathname, search: url.search, hash: url.hash, state }] }); routers.push(router)
  render(<QueryClientProvider client={client}><AuthContext.Provider value={{ user, isBootstrapping, signIn, signOut: vi.fn(), signInWithGoogle, changePassword: vi.fn(), completeFirstAccessWithGoogle: vi.fn() }}><RouterProvider router={router} /></AuthContext.Provider></QueryClientProvider>)
  return router
}
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
const enabledOptions = { googleClientId: 'test-client', clientRegistrationEnabled: true }
function options(enabled = true) { return json({ ...enabledOptions, clientRegistrationEnabled: enabled }) }
function google() {
  let callback: (response: { credential: string }) => void = () => {}
  window.google = { accounts: { id: { initialize: vi.fn(value => { callback = value.callback }), renderButton: vi.fn(element => {
    const button = document.createElement('button'); button.textContent = 'Continuar com Google'; button.onclick = () => callback({ credential: 'test-credential' }); element.append(button)
  }) } } }
}
afterEach(() => {
  cleanup(); routers.splice(0).forEach(router => router.dispose()); clients.splice(0).forEach(client => client.clear())
  document.querySelectorAll('script[data-google-identity]').forEach(script => script.remove())
  delete window.google; vi.restoreAllMocks(); signInWithGoogle.mockReset(); signIn.mockReset()
})

it('mantém o efeito de cadastro visível e transmite apenas a credencial Google', async () => {
  google(); vi.spyOn(globalThis, 'fetch').mockResolvedValue(options()); signInWithGoogle.mockResolvedValue(undefined); mount()
  expect(screen.getByRole('heading', { name: 'Entrar', level: 1 })).toBeInTheDocument()
  const button = await screen.findByRole('button', { name: 'Continuar com Google' })
  expect(screen.getByText('Se ainda não tiver cadastro, criaremos sua conta de cliente.')).toBeVisible()
  fireEvent.click(button)
  await waitFor(() => expect(signInWithGoogle).toHaveBeenCalledExactlyOnceWith('test-credential'))
  expect(signIn).not.toHaveBeenCalled()
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Telefone, usuário ou e-mail')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Senha')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Criar conta' })).toHaveAttribute('href', '/login?cadastro=cliente')
  expect(screen.getByRole('link', { name: 'Voltar à entrada' })).toHaveAttribute('href', '/visitante')
})

it('não anuncia cadastro quando desligado e oferece somente Google', async () => {
  google(); vi.spyOn(globalThis, 'fetch').mockResolvedValue(options(false)); mount()
  await screen.findByRole('button', { name: 'Continuar com Google' })
  expect(screen.queryByText(/criaremos sua conta/i)).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Criar conta' })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Telefone, usuário ou e-mail')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Senha')).not.toBeInTheDocument()
})

it('mantém o retorno público disponível enquanto consulta as opções de acesso', async () => {
  let resolve!: (response: Response) => void
  google(); vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>(done => { resolve = done }))
  mount()
  expect(screen.getByRole('status')).toHaveTextContent('Carregando opções de acesso…')
  expect(screen.getByRole('link', { name: 'Voltar à entrada' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Criar conta' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Continuar com Google' })).not.toBeInTheDocument()
  resolve(options())
  await screen.findByRole('button', { name: 'Continuar com Google' })
  expect(screen.queryByText('Carregando opções de acesso…')).not.toBeInTheDocument()
  expect(signInWithGoogle).not.toHaveBeenCalled(); expect(signIn).not.toHaveBeenCalled()
})

it('falha nas opções não anuncia Google ou cadastro e permite recuperar a consulta', async () => {
  google(); const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline')).mockResolvedValue(options()); mount()
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível consultar as opções de acesso.')
  expect(screen.queryByRole('button', { name: 'Continuar com Google' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Criar conta' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Voltar à entrada' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  expect(await screen.findByRole('button', { name: 'Continuar com Google' })).toBeInTheDocument()
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(fetch.mock.calls.every(([url, init]) => String(url).endsWith('/auth/options') && !init?.method)).toBe(true)
})

it('exibe erro do acesso sem alegar cadastro concluído', async () => {
  google(); vi.spyOn(globalThis, 'fetch').mockResolvedValue(options()); signInWithGoogle.mockRejectedValue(new Error('Aguarde um minuto e tente novamente.')); mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Continuar com Google' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Aguarde um minuto e tente novamente.')
  expect(screen.queryByText(/cadastro concluído/i)).not.toBeInTheDocument()
})

it('mostra progresso e ignora outra credencial Google enquanto o acesso está pendente', async () => {
  let finish!: () => void
  google(); vi.spyOn(globalThis, 'fetch').mockResolvedValue(options())
  signInWithGoogle.mockReturnValue(new Promise<void>(resolve => { finish = resolve }))
  mount()
  const button = await screen.findByRole('button', { name: 'Continuar com Google' })
  fireEvent.click(button)
  expect(await screen.findByRole('status')).toHaveTextContent('Entrando com Google…')
  fireEvent.click(button)
  expect(signInWithGoogle).toHaveBeenCalledExactlyOnceWith('test-credential')
  finish()
  await waitFor(() => expect(screen.queryByText('Entrando com Google…')).not.toBeInTheDocument())
})

it('não envia uma credencial Google enquanto a sessão está sendo restaurada', async () => {
  google(); vi.spyOn(globalThis, 'fetch').mockResolvedValue(options())
  mount(<LoginPage />, null, '/login', undefined, true)
  fireEvent.click(await screen.findByRole('button', { name: 'Continuar com Google' }))
  expect(signInWithGoogle).not.toHaveBeenCalled(); expect(signIn).not.toHaveBeenCalled()
})

it('conta vinculada orienta segurança no Google sem pedir senha local', () => {
  mount(<AccountPage />, { id: 'test-user', name: 'Cliente', email: 'test@example.invalid', roles: ['Student'], permissions: [], googleLinked: true })
  expect(screen.getByRole('link', { name: /Gerenciar segurança no Google/ })).toHaveAttribute('href', 'https://myaccount.google.com/security')
  expect(screen.queryByLabelText('Senha atual')).not.toBeInTheDocument()
})

it.each([null, ''])('Google indisponível (%s) não libera cadastro nem oferece senha local', async googleClientId => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ googleClientId, clientRegistrationEnabled: true }))
  mount()
  expect(await screen.findByRole('alert')).toHaveTextContent('O acesso está indisponível.')
  expect(screen.queryByRole('button', { name: 'Continuar com Google' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Criar conta' })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Senha')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument()
})

it('erro no script Google permanece visível sem sugerir entrar com senha', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(options())
  mount()
  await waitFor(() => expect(document.querySelector('script[data-google-identity]')).not.toBeNull())
  fireEvent.error(document.querySelector('script[data-google-identity]')!)
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar o Google')
  expect(screen.getByRole('alert')).not.toHaveTextContent(/senha/)
})

it('mantém ajuda recolhida com recuperação Google e foco por teclado', async () => {
  google(); vi.spyOn(globalThis, 'fetch').mockResolvedValue(options()); mount()
  await screen.findByRole('button', { name: 'Continuar com Google' })
  const summary = screen.getByText('Precisa de ajuda?')
  const details = summary.closest('details')
  const recovery = screen.getByText('Recuperar conta Google')
  expect(details).not.toHaveAttribute('open'); expect(recovery).not.toBeVisible()
  const user = userEvent.setup()
  for (let tab = 0; tab < 10 && document.activeElement !== summary; tab++) await user.tab()
  expect(summary).toHaveFocus()
  // Browser QA covers native summary activation with Enter and Space.
  await user.click(summary)
  expect(recovery).toBeVisible()
  expect(screen.getByRole('link', { name: 'Recuperar conta Google' })).toHaveAttribute('href', 'https://accounts.google.com/signin/recovery')
  expect(recovery).toHaveAttribute('target', '_blank'); expect(recovery).toHaveAttribute('rel', expect.stringContaining('noreferrer'))
  await user.click(summary)
  expect(details).not.toHaveAttribute('open'); expect(recovery).not.toBeVisible()
})

it('homologação exige autorização da API e identifica dados e pagamentos de teste', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ googleClientId: null, clientRegistrationEnabled: false, homologationLoginEnabled: true }))
  signIn.mockResolvedValue(undefined)
  mount()
  expect(await screen.findByRole('heading', { name: 'Entrar na homologação' })).toBeInTheDocument()
  expect(screen.getByText('Ambiente de teste: dados fictícios e pagamentos Sandbox.')).toBeVisible()
  fireEvent.change(screen.getByLabelText('E-mail de teste'), { target: { value: 'reviewer@example.invalid' } })
  fireEvent.change(screen.getByLabelText('Senha de teste'), { target: { value: 'synthetic-password-for-unit-test' } })
  fireEvent.click(screen.getByRole('button', { name: 'Entrar na homologação' }))
  await waitFor(() => expect(signIn).toHaveBeenCalledExactlyOnceWith({ email: 'reviewer@example.invalid', password: 'synthetic-password-for-unit-test' }))
  expect(signInWithGoogle).not.toHaveBeenCalled()
  expect(screen.queryByText('O acesso está indisponível.')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Senha de teste')).toHaveValue('')
})

it('homologação bloqueia envio concorrente e limpa a senha após uma falha', async () => {
  let reject!: (reason: Error) => void
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ googleClientId: null, clientRegistrationEnabled: false, homologationLoginEnabled: true }))
  signIn.mockReturnValue(new Promise<void>((_, done) => { reject = done }))
  mount()
  fireEvent.change(await screen.findByLabelText('E-mail de teste'), { target: { value: 'reviewer@example.invalid' } })
  fireEvent.change(screen.getByLabelText('Senha de teste'), { target: { value: 'synthetic-password-for-unit-test' } })
  const submit = screen.getByRole('button', { name: 'Entrar na homologação' })
  fireEvent.click(submit)
  expect(submit).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent('Entrando…')
  fireEvent.click(submit)
  expect(signIn).toHaveBeenCalledTimes(1)
  reject(new Error('Acesso de teste recusado'))
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível entrar.')
  expect(screen.getByLabelText('E-mail de teste')).toHaveValue('reviewer@example.invalid')
  expect(screen.getByLabelText('Senha de teste')).toHaveValue('')
  expect(submit).toBeEnabled()
})

it('cadastro Google captura nome e telefone antes de criar a conta e entrar', async () => {
  google(); vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => init?.method === 'POST' ? new Response(null, { status: 204 }) : options()); signInWithGoogle.mockResolvedValue(undefined)
  mount(<LoginPage />, null, '/login?cadastro=cliente')
  expect(await screen.findByRole('heading', { name: 'Criar conta' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Continuar com Google' })).not.toBeInTheDocument()
  expect(window.google!.accounts.id.renderButton).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Informe seu nome.')
  expect(screen.getByLabelText('Nome')).toHaveFocus()
  expect(signInWithGoogle).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Pessoa Fictícia' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Informe um telefone válido com DDD.')
  expect(screen.getByLabelText('Telefone com DDD')).toHaveFocus()
  fireEvent.change(screen.getByLabelText('Telefone com DDD'), { target: { value: '11988887777' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
  expect(screen.getByRole('heading', { name: 'Criar conta' })).toHaveFocus()
  expect(screen.getByText('Ao continuar, criaremos sua conta de cliente.')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Continuar com Google' }))
  await waitFor(() => expect(signInWithGoogle).toHaveBeenCalledExactlyOnceWith('test-credential', { name: 'Pessoa Fictícia', phone: '11988887777' }))
  expect(screen.getByRole('link', { name: 'Já tenho conta' })).toHaveAttribute('href', '/login')
})

it.each([
  ['(11) 98888-7777', '11988887777'],
  ['+55 (11) 98888-7777', '5511988887777'],
])('colar telefone %s conserva todos os dígitos antes de escolher o acesso', async (formatted, digits) => {
  google(); vi.spyOn(globalThis, 'fetch').mockResolvedValue(options())
  const user = userEvent.setup()
  mount(<LoginPage />, null, '/login?cadastro=cliente')
  await user.type(await screen.findByLabelText('Nome'), 'Pessoa Fictícia')
  await user.click(screen.getByRole('button', { name: 'Continuar' }))
  expect(screen.getByLabelText('Telefone com DDD')).toHaveFocus()
  await user.paste(formatted)
  expect(screen.getByLabelText('Telefone com DDD')).toHaveValue(formatted)
  await user.click(screen.getByRole('button', { name: 'Continuar' }))
  expect(screen.getByText(`Pessoa Fictícia · ${formatted}`)).toBeVisible()
  expect(signInWithGoogle).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Continuar com Google' }))
  await waitFor(() => expect(signInWithGoogle).toHaveBeenCalledExactlyOnceWith('test-credential', { name: 'Pessoa Fictícia', phone: digits }))
})

it('URL de cadastro não contorna a opção desligada nem conta bloqueada', async () => {
  google(); vi.spyOn(globalThis, 'fetch').mockResolvedValue(options(false)); signInWithGoogle.mockRejectedValue(new Error('Acesso indisponível para esta conta. Procure a equipe.'))
  mount(<LoginPage />, null, '/login?cadastro=cliente')
  expect(await screen.findByText('O cadastro online está indisponível. Fale com a equipe.')).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Continuar com Google' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Acesso indisponível para esta conta')
  expect(screen.queryByRole('heading', { name: 'Criar conta' })).not.toBeInTheDocument()
  expect(screen.queryByText(/criaremos sua conta/i)).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Voltar à entrada' })).toBeInTheDocument()
})

it('troca de método e revisão dos dados preservam o cadastro sem criar vínculos ou enviar acesso', async () => {
  google()
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ...enabledOptions, localLoginEnabled: true, localRegistrationEnabled: true }))
  mount(<LoginPage />, null, '/login?cadastro=cliente')
  fireEvent.change(await screen.findByLabelText('Nome'), { target: { value: 'Pessoa Fictícia' } })
  fireEvent.change(screen.getByLabelText('Telefone com DDD'), { target: { value: '11988887777' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
  expect(screen.getByRole('heading', { name: 'Como quer entrar?' })).toHaveFocus()
  expect(screen.getByRole('button', { name: 'Continuar com Google' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Usar usuário e senha' }))
  fireEvent.change(screen.getByLabelText('Usuário'), { target: { value: 'pessoa.ficticia' } })
  fireEvent.click(screen.getByText('Adicionar e-mail (opcional)', { selector: 'summary' }))
  fireEvent.change(screen.getByLabelText('E-mail de contato (opcional)'), { target: { value: 'pessoa@example.invalid' } })
  fireEvent.click(screen.getByRole('button', { name: 'Usar Google' }))
  expect(screen.getByRole('button', { name: 'Continuar com Google' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Alterar dados' }))
  expect(screen.getByLabelText('Nome')).toHaveValue('Pessoa Fictícia')
  expect(screen.getByLabelText('Nome')).toHaveFocus()
  expect(screen.getByLabelText('Telefone com DDD')).toHaveValue('(11) 98888-7777')
  expect(screen.queryByRole('button', { name: 'Continuar com Google' })).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Nome revisado' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
  fireEvent.click(screen.getByRole('button', { name: 'Usar usuário e senha' }))
  expect(screen.getByLabelText('Usuário')).toHaveValue('pessoa.ficticia')
  expect(screen.getByLabelText('E-mail de contato (opcional)')).toHaveValue('pessoa@example.invalid')
  expect(screen.getByLabelText('E-mail de contato (opcional)')).toBeVisible()
  expect(screen.getByText('Nome revisado · (11) 98888-7777')).toBeVisible()
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  expect(signInWithGoogle).not.toHaveBeenCalled(); expect(signIn).not.toHaveBeenCalled()
  expect(fetch.mock.calls.every(([url, init]) => String(url).endsWith('/auth/options') && !init?.method)).toBe(true)
})

it('cadastro somente local recolhe e-mail opcional e revela um endereço inválido antes do envio', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ googleClientId: null, clientRegistrationEnabled: false, localRegistrationEnabled: true }))
  const user = userEvent.setup()
  mount(<LoginPage />, null, '/login?cadastro=cliente')
  fireEvent.change(await screen.findByLabelText('Nome'), { target: { value: 'Pessoa Fictícia' } })
  fireEvent.change(screen.getByLabelText('Telefone com DDD'), { target: { value: '11988887777' } })
  await user.click(screen.getByRole('button', { name: 'Continuar' }))
  expect(screen.getByRole('heading', { name: 'Criar conta' })).toHaveFocus()
  expect(screen.queryByRole('heading', { name: 'Como quer entrar?' })).not.toBeInTheDocument()
  const email = screen.getByLabelText('E-mail de contato (opcional)')
  const summary = screen.getByText('Adicionar e-mail (opcional)', { selector: 'summary' })
  expect(email).not.toBeVisible()
  fireEvent.change(screen.getByLabelText('Usuário'), { target: { value: 'pessoa.ficticia' } })
  fireEvent.change(screen.getByLabelText('Criar senha'), { target: { value: 'SenhaFicticia2!Segura' } })
  fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: 'SenhaFicticia2!Segura' } })
  await user.click(summary)
  await user.type(email, 'endereco-invalido')
  await user.click(summary)
  expect(email).not.toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Criar conta' }))
  expect(email).toBeVisible()
  expect(email).toBeInvalid()
  expect(summary.closest('details')).toHaveAttribute('open')
  expect(fetch.mock.calls.every(([, init]) => !init?.method)).toBe(true)
})

it.each([
  { path: '/login', action: 'Criar conta', pathname: '/login', search: '?cadastro=cliente' },
  { path: '/login?cadastro=cliente', action: 'Já tenho conta', pathname: '/login', search: '' },
  { path: '/login', action: 'Voltar à entrada', pathname: '/visitante', search: '' },
])('preserva o retorno completo ao escolher $action', async ({ path, action, pathname, search }) => {
  google(); vi.spyOn(globalThis, 'fetch').mockResolvedValue(options())
  const state = { from: { pathname: '/agenda', search: '?origem=qr', hash: '#token=synthetic-qr' }, returnLabel: 'Voltar à agenda' }
  const router = mount(<LoginPage />, null, path, state)
  await userEvent.setup().click(await screen.findByRole('link', { name: action }))
  await waitFor(() => expect(router.state.location.pathname).toBe(pathname))
  expect(router.state.location.search).toBe(search)
  expect(router.state.location.state).toEqual(state)
  expect(signInWithGoogle).not.toHaveBeenCalled(); expect(signIn).not.toHaveBeenCalled()
})

it.each([
  { roles: ['Manager'], permissions: [], expected: '/' },
  { roles: ['Teacher'], permissions: [], expected: '/professor' },
  { roles: ['Operations'], permissions: ['bar:sales:operate'], expected: '/atendimento/vender' },
  { roles: ['Student'], permissions: [], expected: '/minha-area' },
  { roles: ['Manager'], permissions: [], requiresFirstAccess: true, expected: '/primeiro-acesso' },
])('mantém o destino de $roles para quem já tem sessão', async ({ expected, ...profile }) => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(options())
  const user = { id: 'test-user', name: 'Pessoa de teste', email: 'person@example.invalid', ...profile } as AuthUser
  const router = mount(<LoginPage />, user)
  await screen.findByRole('heading', { name: 'Destino após o acesso' })
  expect(router.state.location.pathname).toBe(expected)
  expect(signInWithGoogle).not.toHaveBeenCalled(); expect(signIn).not.toHaveBeenCalled()
})

it('retorna à rota interna com parâmetros após restaurar uma sessão', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(options())
  const user: AuthUser = { id: 'test-user', name: 'Pessoa de teste', email: 'person@example.invalid', roles: ['Student'], permissions: [] }
  const router = mount(<LoginPage />, user, '/login', { from: { pathname: '/agenda', search: '?date=2026-10-30', hash: '#reserva' } })
  await screen.findByRole('heading', { name: 'Destino após o acesso' })
  expect(router.state.location.pathname + router.state.location.search + router.state.location.hash).toBe('/agenda?date=2026-10-30#reserva')
})

it('oferece usuário e senha em produção com Google indisponível quando a API autoriza', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ googleClientId: null, clientRegistrationEnabled: false, localLoginEnabled: true, localRegistrationEnabled: true }))
  signIn.mockResolvedValue(undefined); mount()
  fireEvent.change(await screen.findByLabelText('Telefone, usuário ou e-mail'), { target: { value: 'pessoa.ficticia' } })
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'SenhaFicticia2!Segura' } })
  fireEvent.click(screen.getByRole('button', { name: /^Entrar$/ }))
  await waitFor(() => expect(signIn).toHaveBeenCalledExactlyOnceWith({ email: 'pessoa.ficticia', password: 'SenhaFicticia2!Segura' }))
  expect(screen.queryByText(/homologação/i)).not.toBeInTheDocument(); expect(signInWithGoogle).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Senha')).toHaveValue('')
})

it('cadastro local exige contato, confirmação e envia somente o perfil público implícito', async () => {
  const writes: { url: string; body: unknown }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (init?.method === 'POST') { writes.push({ url: String(url), body: JSON.parse(String(init.body)) }); return new Response(null, { status: 204 }) }
    return json({ googleClientId: null, clientRegistrationEnabled: false, localLoginEnabled: true, localRegistrationEnabled: true })
  })
  mount(<LoginPage />, null, '/login?cadastro=cliente')
  fireEvent.change(await screen.findByLabelText('Nome'), { target: { value: 'Pessoa Fictícia' } })
  fireEvent.change(screen.getByLabelText('Telefone com DDD'), { target: { value: '(11) 98888-7777' } })
  expect(screen.queryByLabelText('Usuário')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
  fireEvent.change(screen.getByLabelText('Usuário'), { target: { value: 'pessoa.ficticia' } })
  fireEvent.change(screen.getByLabelText('Criar senha'), { target: { value: 'SenhaFicticia2!Segura' } })
  fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: 'OutraSenha2!Segura' } })
  fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('A confirmação não corresponde'); expect(writes).toEqual([])
  fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: 'SenhaFicticia2!Segura' } })
  fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
  expect(await screen.findByText('Conta criada. Entre com seu usuário e sua senha.')).toBeVisible()
  expect(writes).toEqual([{ url: '/api/v1/auth/register', body: { name: 'Pessoa Fictícia', phone: '11988887777', email: null, username: 'pessoa.ficticia', password: 'SenhaFicticia2!Segura' } }])
  expect(screen.getByLabelText('Telefone, usuário ou e-mail')).toHaveValue('pessoa.ficticia')
  expect(signIn).not.toHaveBeenCalled(); expect(signInWithGoogle).not.toHaveBeenCalled()
})

it('recusa cadastro local mantém dados e não apresenta conta criada', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => init?.method === 'POST' ? new Response(JSON.stringify({ message: 'Não foi possível usar esse acesso. Procure a equipe.' }), { status: 409 }) : json({ googleClientId: null, clientRegistrationEnabled: false, localRegistrationEnabled: true }))
  mount(<LoginPage />, null, '/login?cadastro=cliente')
  fireEvent.change(await screen.findByLabelText('Nome'), { target: { value: 'Pessoa Fictícia' } }); fireEvent.change(screen.getByLabelText('Telefone com DDD'), { target: { value: '11988887777' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
  fireEvent.change(screen.getByLabelText('Usuário'), { target: { value: 'pessoa.ficticia' } }); fireEvent.change(screen.getByLabelText('Criar senha'), { target: { value: 'SenhaFicticia2!Segura' } }); fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: 'SenhaFicticia2!Segura' } })
  fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível usar esse acesso')
  expect(screen.getByLabelText('Usuário')).toHaveValue('pessoa.ficticia'); expect(screen.queryByText(/Conta criada/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Alterar dados' }))
  expect(screen.getByLabelText('Nome')).toHaveValue('Pessoa Fictícia')
  expect(signIn).not.toHaveBeenCalled()
})

it('falha de senha em produção não cria sessão e limpa somente a senha', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ googleClientId: null, clientRegistrationEnabled: false, localLoginEnabled: true }))
  signIn.mockRejectedValue(new Error('401')); mount()
  fireEvent.change(await screen.findByLabelText('Telefone, usuário ou e-mail'), { target: { value: 'pessoa.ficticia' } }); fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'SenhaIncorreta2!' } })
  fireEvent.click(screen.getByRole('button', { name: /^Entrar$/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Confira seu usuário e sua senha.')
  expect(screen.getByLabelText('Telefone, usuário ou e-mail')).toHaveValue('pessoa.ficticia'); expect(screen.getByLabelText('Senha')).toHaveValue('')
})
