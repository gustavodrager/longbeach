import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext } from '../features/auth/authContext'
import { LoginPage } from './LoginPage'
import { AccountPage } from './AccountPage'
import type { AuthUser } from '../features/auth/types'

const clients: QueryClient[] = []
const signInWithGoogle = vi.fn()
function mount(page = <LoginPage />, user: AuthUser | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client)
  return render(<QueryClientProvider client={client}><AuthContext.Provider value={{ user, isBootstrapping: false, signIn: vi.fn(), signOut: vi.fn(), signInWithGoogle, changePassword: vi.fn(), completeFirstAccessWithGoogle: vi.fn() }}><MemoryRouter>{page}</MemoryRouter></AuthContext.Provider></QueryClientProvider>)
}
function options(enabled = true) { return new Response(JSON.stringify({ googleClientId: 'test-client', clientRegistrationEnabled: enabled }), { status: 200 }) }
function google() {
  let callback: (response: { credential: string }) => void = () => {}
  window.google = { accounts: { id: { initialize: vi.fn(value => { callback = value.callback }), renderButton: vi.fn(element => {
    const button = document.createElement('button'); button.textContent = 'Continuar com Google'; button.onclick = () => callback({ credential: 'test-credential' }); element.append(button)
  }) } } }
}
afterEach(() => { cleanup(); clients.splice(0).forEach(c => c.clear()); delete window.google; vi.restoreAllMocks(); signInWithGoogle.mockReset() })
it('explica cadastro de cliente e transmite apenas a credencial Google', async () => {
  google(); vi.spyOn(globalThis, 'fetch').mockResolvedValue(options()); signInWithGoogle.mockResolvedValue(undefined); mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Continuar com Google' }))
  await waitFor(() => expect(signInWithGoogle).toHaveBeenCalledWith('test-credential'))
  expect(screen.getByText(/Criaremos sua conta de cliente/)).toBeInTheDocument()
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Usuário ou e-mail')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Senha')).not.toBeInTheDocument()
})
it('não anuncia cadastro quando desligado e oferece somente Google', async () => {
  google(); vi.spyOn(globalThis, 'fetch').mockResolvedValue(options(false)); mount()
  await screen.findByRole('button', { name: 'Continuar com Google' })
  expect(screen.queryByText(/Criaremos sua conta/)).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Usuário ou e-mail')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Senha')).not.toBeInTheDocument()
})
it('falha nas opções não anuncia Google e permite tentar novamente', async () => {
  google(); vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline')).mockResolvedValue(options()); mount()
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível consultar')
  expect(screen.queryByRole('button', { name: 'Continuar com Google' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  expect(await screen.findByRole('button', { name: 'Continuar com Google' })).toBeInTheDocument()
})
it('exibe erro do acesso sem alegar cadastro concluído', async () => {
  google(); vi.spyOn(globalThis, 'fetch').mockResolvedValue(options()); signInWithGoogle.mockRejectedValue(new Error('Aguarde um minuto e tente novamente.')); mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Continuar com Google' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Aguarde um minuto')
})
it('conta vinculada orienta segurança no Google sem pedir senha local', () => {
  mount(<AccountPage />, { id: 'test-user', name: 'Cliente', email: 'test@example.invalid', roles: ['Student'], permissions: [], googleLinked: true })
  expect(screen.getByRole('link', { name: /Gerenciar segurança no Google/ })).toHaveAttribute('href', 'https://myaccount.google.com/security')
  expect(screen.queryByLabelText('Senha atual')).not.toBeInTheDocument()
})

it('Google desativado informa indisponibilidade sem oferecer senha', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ googleClientId: null, clientRegistrationEnabled: false }), { status: 200 }))
  mount()
  expect(await screen.findByRole('alert')).toHaveTextContent('O acesso com Google está indisponível')
  expect(screen.queryByLabelText('Senha')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'recupere sua conta no Google' })).toHaveAttribute('href', 'https://accounts.google.com/signin/recovery')
})
it('erro no script Google não sugere entrar com senha', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(options())
  mount()
  await waitFor(() => expect(document.querySelector('script[data-google-identity]')).not.toBeNull())
  fireEvent.error(document.querySelector('script[data-google-identity]')!)
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar o Google')
  expect(screen.getByRole('alert')).not.toHaveTextContent(/senha/)
})
