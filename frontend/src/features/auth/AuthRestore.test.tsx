import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode, type ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { setAccessToken, setCsrfToken } from '../../lib/http'
import { FirstAccessPage } from '../../pages/FirstAccessPage'
import { LoginPage } from '../../pages/LoginPage'
import { AuthProvider } from './AuthProvider'
import { AuthGuard } from './AuthGuard'
import { useAuth } from './authContext'
import type { AuthUser } from './types'

const manager: AuthUser = { id: 'session-person', name: 'Pessoa teste', email: 'session@example.invalid', roles: ['Manager'], permissions: ['finance:read'] }
const replacement: AuthUser = { ...manager, id: 'other-person', name: 'Outra pessoa' }
const target = '/agenda?date=2026-11-05#reserva'
const clients: QueryClient[] = []
const originalLocks = Object.getOwnPropertyDescriptor(navigator, 'locks')
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const session = (user = manager) => json({ accessToken: `synthetic-${user.id}`, csrfToken: 'synthetic-csrf', user })
const mockFetch = (handler: typeof globalThis.fetch) => vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => String(input).endsWith('/auth/options')
  ? Promise.resolve(json({ googleClientId: null, clientRegistrationEnabled: false, localLoginEnabled: true, localRegistrationEnabled: false }))
  : handler(input, init))

function LocationProbe() {
  const location = useLocation()
  return <output aria-label="Endereço atual">{location.pathname + location.search + location.hash}</output>
}
function Controls() {
  const { user, isBootstrapping, signIn, signOut } = useAuth()
  return <><output aria-label="Pessoa conectada">{user?.name ?? 'Sem sessão'}</output>
    <button disabled={isBootstrapping} onClick={() => void signIn({ email: 'synthetic-login', password: 'synthetic-password' }).catch(() => undefined)}>Entrar com senha</button>
    <button onClick={() => void signOut()}>Sair da sessão</button>
    <button onClick={() => void signIn({ email: 'synthetic-login', password: 'synthetic-password' }).catch(() => undefined)}>Trocar de conta durante a consulta</button></>
}
function mount({ path = target, strict = false }: { path?: string; strict?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client)
  const tree: ReactNode = <QueryClientProvider client={client}><AuthProvider><MemoryRouter initialEntries={[path]}><LocationProbe /><Controls /><Routes>
    <Route element={<AuthGuard />}><Route path="/agenda" element={<h1>Agenda privada</h1>} /><Route path="/" element={<h1>Área inicial</h1>} /></Route>
    <Route path="/primeiro-acesso" element={<FirstAccessPage />} />
    <Route path="/login" element={<LoginPage />} />
  </Routes></MemoryRouter></AuthProvider></QueryClientProvider>
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree)
}

beforeEach(() => { setAccessToken(null); setCsrfToken(null) })
afterEach(() => {
  cleanup(); clients.splice(0).forEach(client => client.clear()); setAccessToken(null); setCsrfToken(null); vi.restoreAllMocks()
  if (originalLocks) Object.defineProperty(navigator, 'locks', originalLocks)
  else Reflect.deleteProperty(navigator, 'locks')
})

it.each([503, 429, 409, 'network'] as const)('mantém a rota protegida e recupera a sessão após falha temporária %s', async failure => {
  let refreshes = 0
  const fetch = mockFetch(async input => {
    if (String(input).endsWith('/auth/refresh')) {
      if (++refreshes === 1) { if (failure === 'network') throw new TypeError('offline'); return json({}, failure) }
      return session()
    }
    if (String(input).endsWith('/auth/me')) return json(manager)
    throw new Error('Unexpected request')
  })
  mount()
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível retomar seu acesso.')
  expect(screen.getByLabelText('Endereço atual')).toHaveTextContent(target)
  expect(screen.queryByRole('heading', { name: 'Agenda privada' })).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Entrar' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  expect(await screen.findByRole('heading', { name: 'Agenda privada' })).toBeInTheDocument()
  expect(screen.getByLabelText('Endereço atual')).toHaveTextContent(target)
  expect(screen.getByLabelText('Pessoa conectada')).toHaveTextContent(manager.name)
  expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'))).toHaveLength(2)
  expect(fetch.mock.calls.some(([url]) => /auth\/(login|google)/.test(String(url)))).toBe(false)
})

it.each([503, 'network'] as const)('preserva o usuário validado no refresh quando a consulta de identidade falha com %s', async failure => {
  mockFetch(async input => {
    if (String(input).endsWith('/auth/refresh')) return session()
    if (String(input).endsWith('/auth/me')) { if (failure === 'network') throw new TypeError('offline'); return json({}, failure) }
    throw new Error('Unexpected request')
  })
  mount()
  expect(await screen.findByRole('heading', { name: 'Agenda privada' })).toBeInTheDocument()
  expect(screen.getByLabelText('Pessoa conectada')).toHaveTextContent(manager.name)
  expect(screen.getByLabelText('Endereço atual')).toHaveTextContent(target)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it.each([{ phase: 'refresh', status: 401 }, { phase: 'refresh', status: 403 }, { phase: 'me', status: 401 }, { phase: 'me', status: 403 }])('mantém o bloqueio definitivo de sessão em $phase/$status', async ({ phase, status }) => {
  mockFetch(async input => {
    if (String(input).endsWith('/auth/refresh')) return phase === 'refresh' ? json({}, status) : session()
    if (String(input).endsWith('/auth/me')) return json({}, status)
    throw new Error('Unexpected request')
  })
  mount()
  expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
  expect(screen.getByLabelText('Pessoa conectada')).toHaveTextContent('Sem sessão')
  expect(screen.queryByRole('heading', { name: 'Agenda privada' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Tentar novamente' })).not.toBeInTheDocument()
})

it('retoma primeiro acesso na mesma página após indisponibilidade sem pedir novo login', async () => {
  const firstAccess = { ...manager, requiresFirstAccess: true, requiresLocalPasswordChange: true }
  let refreshes = 0
  mockFetch(async input => {
    if (String(input).endsWith('/auth/refresh')) return ++refreshes === 1 ? json({}, 503) : session(firstAccess)
    if (String(input).endsWith('/auth/me')) return json(firstAccess)
    throw new Error('Unexpected request')
  })
  const path = '/primeiro-acesso?retorno=escola#senha'
  mount({ path })
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível retomar seu acesso.')
  expect(screen.getByLabelText('Endereço atual')).toHaveTextContent(path)
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  expect(await screen.findByRole('heading', { name: 'Concluir acesso' })).toBeInTheDocument()
  expect(screen.getByLabelText('Endereço atual')).toHaveTextContent(path)
  expect(screen.queryByRole('heading', { name: 'Entrar' })).not.toBeInTheDocument()
})

it('permite entrar com senha sem exigir que a renovação indisponível volte a funcionar', async () => {
  const fetch = mockFetch(async input => {
    if (String(input).endsWith('/auth/refresh')) return json({}, 503)
    if (String(input).endsWith('/auth/login')) return session(replacement)
    throw new Error('Unexpected request')
  })
  mount({ path: '/login' })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Entrar com senha' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Entrar com senha' }))
  await waitFor(() => expect(screen.getByLabelText('Pessoa conectada')).toHaveTextContent(replacement.name))
  expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'))).toHaveLength(1)
})

it('sair durante a restauração impede que a consulta antiga reconecte a pessoa', async () => {
  let finish!: (response: Response) => void
  mockFetch(async input => {
    if (String(input).endsWith('/auth/refresh')) return session()
    if (String(input).endsWith('/auth/me')) return new Promise<Response>(resolve => { finish = resolve })
    if (String(input).endsWith('/auth/logout')) return new Response(null, { status: 204 })
    throw new Error('Unexpected request')
  })
  mount()
  await waitFor(() => expect(finish).toBeDefined())
  fireEvent.click(screen.getByRole('button', { name: 'Sair da sessão' }))
  await act(async () => finish(json(manager)))
  expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
  expect(screen.getByLabelText('Pessoa conectada')).toHaveTextContent('Sem sessão')
})

it.each([200, 503])('a consulta antiga de identidade %s não substitui nem encerra um novo login', async status => {
  let finish!: (response: Response) => void
  mockFetch(async input => {
    if (String(input).endsWith('/auth/refresh')) return session()
    if (String(input).endsWith('/auth/me')) return new Promise<Response>(resolve => { finish = resolve })
    if (String(input).endsWith('/auth/login')) return session(replacement)
    throw new Error('Unexpected request')
  })
  mount()
  await waitFor(() => expect(finish).toBeDefined())
  fireEvent.click(screen.getByRole('button', { name: 'Trocar de conta durante a consulta' }))
  await waitFor(() => expect(screen.getByLabelText('Pessoa conectada')).toHaveTextContent(replacement.name))
  await act(async () => finish(json(manager, status)))
  expect(screen.getByRole('heading', { name: 'Agenda privada' })).toBeInTheDocument()
  expect(screen.getByLabelText('Pessoa conectada')).toHaveTextContent(replacement.name)
})

it('um refresh anterior não aborta nem substitui a entrada explícita em outra conta', async () => {
  let finishRefresh!: (response: Response) => void
  const fetch = mockFetch(async input => {
    if (String(input).endsWith('/auth/refresh')) return new Promise<Response>(resolve => { finishRefresh = resolve })
    if (String(input).endsWith('/auth/login')) return session(replacement)
    if (String(input).endsWith('/auth/me')) return json(manager)
    throw new Error('Unexpected request')
  })
  mount()
  await waitFor(() => expect(finishRefresh).toBeDefined())
  fireEvent.click(screen.getByRole('button', { name: 'Trocar de conta durante a consulta' }))
  await waitFor(() => expect(screen.getByLabelText('Pessoa conectada')).toHaveTextContent(replacement.name))
  await act(async () => finishRefresh(session()))
  expect(screen.getByRole('heading', { name: 'Agenda privada' })).toBeInTheDocument()
  expect(screen.getByLabelText('Pessoa conectada')).toHaveTextContent(replacement.name)
  expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/auth/me'))).toBe(false)
})

it('serializa a entrada explícita atrás do refresh pendente e ignora a identidade anterior', async () => {
  let tail = Promise.resolve()
  const request = vi.fn((_name: string, work: () => Promise<unknown>) => {
    const result = tail.then(work)
    tail = result.then(() => undefined, () => undefined)
    return result
  })
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } })
  let finishRefresh!: (response: Response) => void
  const fetch = mockFetch(async input => {
    if (String(input).endsWith('/auth/refresh')) return new Promise<Response>(resolve => { finishRefresh = resolve })
    if (String(input).endsWith('/auth/login')) return session(replacement)
    if (String(input).endsWith('/auth/me')) return json(manager)
    throw new Error('Unexpected request')
  })
  mount()
  await waitFor(() => expect(finishRefresh).toBeDefined())
  fireEvent.click(screen.getByRole('button', { name: 'Trocar de conta durante a consulta' }))
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2))
  expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/auth/login'))).toBe(false)
  expect(screen.getByLabelText('Pessoa conectada')).toHaveTextContent('Sem sessão')
  await act(async () => finishRefresh(session()))
  expect(await screen.findByRole('heading', { name: 'Agenda privada' })).toBeInTheDocument()
  expect(screen.getByLabelText('Pessoa conectada')).toHaveTextContent(replacement.name)
  expect(request.mock.calls.map(([name]) => name)).toEqual(['longbeach-auth-refresh', 'longbeach-auth-refresh'])
  expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/auth/me'))).toBe(false)
})

it('compartilha a restauração no StrictMode sem liberar a rota durante o carregamento', async () => {
  let finish!: (response: Response) => void
  const fetch = mockFetch(async input => {
    if (String(input).endsWith('/auth/refresh')) return new Promise<Response>(resolve => { finish = resolve })
    if (String(input).endsWith('/auth/me')) return json(manager)
    throw new Error('Unexpected request')
  })
  mount({ strict: true })
  await waitFor(() => expect(finish).toBeDefined())
  expect(screen.queryByRole('heading', { name: 'Agenda privada' })).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Entrar' })).not.toBeInTheDocument()
  await act(async () => finish(session()))
  expect(await screen.findByRole('heading', { name: 'Agenda privada' })).toBeInTheDocument()
  expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'))).toHaveLength(1)
  expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/auth/me'))).toHaveLength(1)
})

it('ignora a resposta de uma restauração desmontada depois que outra conta já foi carregada', async () => {
  let finishOld!: (response: Response) => void
  let refreshes = 0; let identityReads = 0
  mockFetch(async input => {
    if (String(input).endsWith('/auth/refresh')) return session(++refreshes === 1 ? manager : replacement)
    if (String(input).endsWith('/auth/me')) return ++identityReads === 1 ? new Promise<Response>(resolve => { finishOld = resolve }) : json(replacement)
    throw new Error('Unexpected request')
  })
  const first = mount()
  await waitFor(() => expect(finishOld).toBeDefined())
  first.unmount()
  mount()
  expect(await screen.findByRole('heading', { name: 'Agenda privada' })).toBeInTheDocument()
  await act(async () => finishOld(json({}, 401)))
  expect(screen.getByLabelText('Pessoa conectada')).toHaveTextContent(replacement.name)
  expect(screen.queryByRole('heading', { name: 'Entrar' })).not.toBeInTheDocument()
})
