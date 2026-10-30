import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from './authContext'
import { AuthGuard } from './AuthGuard'
import { LoginPage } from '../../pages/LoginPage'
import { FirstAccessPage } from '../../pages/FirstAccessPage'

vi.mock('./GoogleSignInButton', () => ({ GoogleSignInButton: ({ onCredential, disabled }: { onCredential: (credential: string) => void; disabled?: boolean }) => <button type="button" disabled={disabled} onClick={() => onCredential('verified-test-credential')}>Entrar com Google</button> }))
const clients: QueryClient[] = []
afterEach(() => { cleanup(); clients.splice(0).forEach(c => c.clear()); vi.restoreAllMocks(); vi.unstubAllEnvs(); sessionStorage.clear() })
const pending = { id: 'test-user', name: 'Proprietário de teste', email: '', username: 'test.owner', requiresFirstAccess: true, roles: [], permissions: [] }
function auth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return { user: null, isBootstrapping: false, signIn: vi.fn(async () => {}), signInWithGoogle: vi.fn(async () => {}), signOut: vi.fn(async () => {}), changePassword: vi.fn(async () => {}), completeFirstAccessWithGoogle: vi.fn(async () => {}), ...overrides }
}
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
const enabledOptions = { googleClientId: 'test-client', clientRegistrationEnabled: false }
function start(value: AuthContextValue, path = '/login', options: () => Promise<Response> = async () => json(enabledOptions)) {
  const client = new QueryClient({defaultOptions:{queries:{retry:false}}}); clients.push(client)
  vi.spyOn(globalThis, 'fetch').mockImplementation(options)
  return render(<QueryClientProvider client={client}><AuthContext.Provider value={value}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/login" element={<LoginPage />} /><Route path="/primeiro-acesso" element={<FirstAccessPage />} />
    <Route element={<AuthGuard />}><Route path="/" element={<h1>Dados da arena</h1>} /></Route>
  </Routes></MemoryRouter></AuthContext.Provider></QueryClientProvider>)
}
const passwordDetails = () => screen.getByText('Criar senha', { selector: 'summary' }).closest('details')!
async function openPassword() { await userEvent.setup().click(screen.getByText('Criar senha', { selector: 'summary' })) }
function fillPassword(current = 'initial-test', next = 'PermanentPassword2!', confirmation = next) {
  fireEvent.change(screen.getByLabelText('Senha inicial'), { target: { value: current } })
  fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: next } })
  fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: confirmation } })
}

it('oferece somente Google e envia a credencial verificada', async () => {
  const value = auth(); start(value)
  await userEvent.setup().click(await screen.findByRole('button', { name: 'Entrar com Google' }))
  expect(value.signInWithGoogle).toHaveBeenCalledWith('verified-test-credential')
  expect(value.signIn).not.toHaveBeenCalled()
  expect(screen.queryByLabelText('Usuário ou e-mail')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Senha')).not.toBeInTheDocument()
})
it('redireciona sessão inicial restaurada antes de mostrar dados da arena', async () => {
  start(auth({ user: pending }), '/')
  expect(await screen.findByRole('heading', { name: 'Concluir acesso' })).toBeInTheDocument()
  expect(screen.queryByText('Dados da arena')).not.toBeInTheDocument()
})
it('só conclui com senha forte e confirmação coincidente', async () => {
  const value = auth({ user: pending }); start(value, '/primeiro-acesso')
  await openPassword()
  const user = userEvent.setup(); await user.type(screen.getByLabelText('Senha inicial'), 'initial-test')
  fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'onlylowercasepassword' } })
  fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: 'onlylowercasepassword' } })
  await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }))
  expect(value.changePassword).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'PermanentPassword2!' } })
  await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }))
  expect(screen.getByRole('alert')).toHaveTextContent('A confirmação não corresponde')
  fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: 'PermanentPassword2!' } })
  await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }))
  await waitFor(() => expect(value.changePassword).toHaveBeenCalledWith({ currentPassword: 'initial-test', newPassword: 'PermanentPassword2!' }))
})
it('vincula o Google à sessão inicial em vez de criar outra conta', async () => {
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client'); const value = auth({ user: pending }); start(value, '/primeiro-acesso')
  await userEvent.setup().click(await screen.findByRole('button', { name: 'Entrar com Google' }))
  expect(value.completeFirstAccessWithGoogle).toHaveBeenCalledWith('verified-test-credential')
  expect(value.signInWithGoogle).not.toHaveBeenCalled()
})
it('primeiro acesso exige uma sessão autenticada', async () => {
  start(auth(), '/primeiro-acesso')
  expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
})

it('identifica a conta e mantém a consequência visível com a senha recolhida', async () => {
  const value = auth({ user: pending }); start(value, '/primeiro-acesso')
  expect(screen.getByRole('heading', { name: 'Concluir acesso', level: 1 })).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Long Beach Arena' })).toBeInTheDocument()
  expect(screen.queryByText('Sua arena, no seu ritmo')).not.toBeInTheDocument()
  expect(screen.getByText('test.owner')).toBeVisible()
  expect(passwordDetails()).not.toHaveAttribute('open')
  expect(screen.getByLabelText('Senha inicial')).not.toBeVisible()
  expect(screen.getByText('A senha inicial deixa de funcionar ao concluir esta etapa.')).toBeVisible()
  await screen.findByRole('button', { name: 'Entrar com Google' })
  await userEvent.setup().click(screen.getByRole('button', { name: 'Sair' }))
  expect(value.signOut).toHaveBeenCalledExactlyOnceWith()
})

it('usa o nome para identificar a conta quando não há usuário', () => {
  start(auth({ user: { ...pending, username: null } }), '/primeiro-acesso')
  expect(screen.getByText('Proprietário de teste')).toBeVisible()
  expect(screen.queryByText(/Usuário:/)).not.toBeInTheDocument()
})

it('mostra os requisitos junto à nova senha ao abrir o formulário', async () => {
  start(auth({ user: pending }), '/primeiro-acesso')
  const help = screen.getByText('Use 14 ou mais caracteres, com letra maiúscula, minúscula, número e símbolo.')
  expect(help).not.toBeVisible()
  await openPassword()
  expect(help).toBeVisible()
  expect(screen.getByLabelText('Nova senha')).toHaveAttribute('aria-describedby', help.id)
  expect(screen.getByLabelText('Nova senha')).toHaveAttribute('minlength', '14')
  expect(screen.getByLabelText('Senha inicial')).toHaveAttribute('autocomplete', 'current-password')
  expect(screen.getByLabelText('Nova senha')).toHaveAttribute('autocomplete', 'new-password')
  expect(screen.getByLabelText('Confirmar nova senha')).toHaveAttribute('autocomplete', 'new-password')
})

it('recusa reutilizar a senha inicial', async () => {
  const value = auth({ user: pending }); start(value, '/primeiro-acesso')
  await openPassword(); fillPassword('PermanentPassword2!')
  await userEvent.setup().click(screen.getByRole('button', { name: 'Salvar nova senha' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Escolha uma senha diferente da inicial.')
  expect(value.changePassword).not.toHaveBeenCalled()
})

it('mantém Criar senha e o rascunho durante a consulta do Google', async () => {
  let resolve!: (response: Response) => void
  start(auth({ user: pending }), '/primeiro-acesso', () => new Promise(done => { resolve = done }))
  expect(screen.getByRole('status')).toHaveTextContent('Consultando acesso Google…')
  expect(screen.queryByRole('button', { name: 'Entrar com Google' })).not.toBeInTheDocument()
  await openPassword(); fillPassword()
  resolve(json(enabledOptions))
  await screen.findByRole('button', { name: 'Entrar com Google' })
  expect(passwordDetails()).toHaveAttribute('open')
  expect(screen.getByLabelText('Nova senha')).toHaveValue('PermanentPassword2!')
})

it('preserva os campos após falha e recuperação das opções Google', async () => {
  let attempt = 0
  start(auth({ user: pending }), '/primeiro-acesso', async () => {
    if (++attempt === 1) throw new Error('offline')
    return json(enabledOptions)
  })
  await screen.findByText(/Não foi possível consultar o Google/)
  expect(screen.queryByRole('button', { name: 'Entrar com Google' })).not.toBeInTheDocument()
  await openPassword(); fillPassword()
  await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar novamente' }))
  await screen.findByRole('button', { name: 'Entrar com Google' })
  expect(attempt).toBe(2)
  expect(passwordDetails()).toHaveAttribute('open')
  expect(screen.getByLabelText('Senha inicial')).toHaveValue('initial-test')
  expect(screen.getByLabelText('Nova senha')).toHaveValue('PermanentPassword2!')
  expect(screen.getByLabelText('Confirmar nova senha')).toHaveValue('PermanentPassword2!')
})

it('permite concluir com senha quando o Google está indisponível', async () => {
  const value = auth({ user: pending }); start(value, '/primeiro-acesso', async () => json({ googleClientId: null, clientRegistrationEnabled: false }))
  await screen.findByText('Google indisponível. Você pode criar uma senha.')
  expect(screen.queryByRole('button', { name: 'Entrar com Google' })).not.toBeInTheDocument()
  await openPassword(); fillPassword()
  await userEvent.setup().click(screen.getByRole('button', { name: 'Salvar nova senha' }))
  await waitFor(() => expect(value.changePassword).toHaveBeenCalledExactlyOnceWith({ currentPassword: 'initial-test', newPassword: 'PermanentPassword2!' }))
})

it('bloqueia ações enquanto vincula o Google e mantém a alternativa após erro', async () => {
  let reject!: (reason: Error) => void
  const value = auth({ user: pending, completeFirstAccessWithGoogle: vi.fn(() => new Promise<void>((_, fail) => { reject = fail })) })
  start(value, '/primeiro-acesso'); await openPassword()
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Entrar com Google' }))
  expect(screen.getByRole('status')).toHaveTextContent('Salvando acesso…')
  for (const label of ['Senha inicial', 'Nova senha', 'Confirmar nova senha']) expect(screen.getByLabelText(label)).toBeDisabled()
  for (const name of ['Entrar com Google', 'Salvar nova senha', 'Sair']) expect(screen.getByRole('button', { name })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Sair' }))
  expect(value.signOut).not.toHaveBeenCalled()
  reject(new Error('linked account'))
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível vincular essa conta.')
  expect(screen.getByRole('button', { name: 'Salvar nova senha' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Sair' })).toBeEnabled()
})

it('bloqueia novo envio ao salvar senha e conserva os campos se a API recusa', async () => {
  let reject!: (reason: Error) => void
  const value = auth({ user: pending, changePassword: vi.fn(() => new Promise<void>((_, fail) => { reject = fail })) })
  start(value, '/primeiro-acesso'); await screen.findByRole('button', { name: 'Entrar com Google' }); await openPassword(); fillPassword()
  await userEvent.setup().click(screen.getByRole('button', { name: 'Salvar nova senha' }))
  expect(screen.getByRole('button', { name: 'Salvando…' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Entrar com Google' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Sair' })).toBeDisabled()
  fireEvent.submit(screen.getByLabelText('Senha inicial').closest('form')!)
  expect(value.changePassword).toHaveBeenCalledTimes(1)
  reject(new Error('expired session'))
  expect(await screen.findByRole('alert')).toHaveTextContent('Confira a senha inicial ou entre novamente se o acesso expirou.')
  expect(screen.getByLabelText('Senha inicial')).toHaveValue('initial-test')
  expect(screen.getByLabelText('Nova senha')).toHaveValue('PermanentPassword2!')
  expect(screen.getByRole('button', { name: 'Salvar nova senha' })).toBeEnabled()
})

it('aguarda a restauração da sessão antes de oferecer o primeiro acesso', () => {
  start(auth({ user: pending, isBootstrapping: true }), '/primeiro-acesso')
  expect(screen.getByRole('status')).toHaveTextContent('Carregando seu acesso…')
  expect(screen.queryByRole('heading', { name: 'Concluir acesso' })).not.toBeInTheDocument()
  expect(screen.queryByText('Criar senha')).not.toBeInTheDocument()
})

it('não repete o primeiro acesso depois que a conta está concluída', async () => {
  start(auth({ user: { ...pending, requiresFirstAccess: false, roles: ['Manager'] } }), '/primeiro-acesso')
  expect(await screen.findByRole('heading', { name: 'Dados da arena' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Concluir acesso' })).not.toBeInTheDocument()
})
