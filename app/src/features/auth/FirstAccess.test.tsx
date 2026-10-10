import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from './authContext'
import { AuthGuard } from './AuthGuard'
import { LoginPage } from '../../pages/LoginPage'
import { FirstAccessPage } from '../../pages/FirstAccessPage'

vi.mock('./GoogleSignInButton', () => ({ GoogleSignInButton: ({ onCredential }: { onCredential: (credential: string) => void }) => <button type="button" onClick={() => onCredential('verified-test-credential')}>Entrar com Google</button> }))
const clients: QueryClient[] = []
afterEach(() => { cleanup(); clients.splice(0).forEach(c => c.clear()); vi.restoreAllMocks(); vi.unstubAllEnvs(); sessionStorage.clear() })
const pending = { id: 'test-user', name: 'Proprietário de teste', email: '', username: 'test.owner', requiresFirstAccess: true, roles: [], permissions: [] }
function auth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return { user: null, isBootstrapping: false, signIn: vi.fn(async () => {}), signInWithGoogle: vi.fn(async () => {}), signOut: vi.fn(async () => {}), changePassword: vi.fn(async () => {}), completeFirstAccessWithGoogle: vi.fn(async () => {}), ...overrides }
}
function start(value: AuthContextValue, path = '/login') {
  const client = new QueryClient({defaultOptions:{queries:{retry:false}}}); clients.push(client)
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ googleClientId: 'test-client', clientRegistrationEnabled: false })))
  return render(<QueryClientProvider client={client}><AuthContext.Provider value={value}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/login" element={<LoginPage />} /><Route path="/primeiro-acesso" element={<FirstAccessPage />} />
    <Route element={<AuthGuard />}><Route path="/" element={<h1>Dados da arena</h1>} /></Route>
  </Routes></MemoryRouter></AuthContext.Provider></QueryClientProvider>)
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
  expect(await screen.findByRole('heading', { name: 'Olá, Proprietário de teste' })).toBeInTheDocument()
  expect(screen.queryByText('Dados da arena')).not.toBeInTheDocument()
})
it('só conclui com senha forte e confirmação coincidente', async () => {
  const value = auth({ user: pending }); start(value, '/primeiro-acesso')
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
  expect(await screen.findByRole('heading', { name: 'Entre no Long Beach OS' })).toBeInTheDocument()
})
