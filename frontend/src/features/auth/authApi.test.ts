import { apiFetch, getCsrfToken, setAccessToken, setCsrfToken } from '../../lib/http'
import { changePassword, completeFirstAccessWithGoogle, login, loginWithGoogle, logout } from './authApi'

const response = (token: string) => new Response(JSON.stringify({ accessToken: token, csrfToken: `csrf-${token}`, user: { id: token, name: 'Pessoa Fictícia', email: 'person@example.invalid', roles: ['Student'], permissions: [] } }), { status: 200 })
beforeEach(() => { setAccessToken(null); setCsrfToken(null); document.cookie = 'lb_csrf=; Max-Age=0; Path=/' })
afterEach(() => { setAccessToken(null); setCsrfToken(null); vi.restoreAllMocks() })

it.each([
  { name: 'local', start: () => login({ email: 'pessoa.ficticia', password: 'SyntheticPassword2!' }) },
  { name: 'Google', start: () => loginWithGoogle('synthetic-google') },
  { name: 'primeiro acesso', start: () => completeFirstAccessWithGoogle('synthetic-google') },
])('resposta antiga de $name não recoloca credenciais após sair, mesmo se o transporte ignorar cancelamento', async ({ start }) => {
  let finish!: (value: Response) => void; let pendingSignal: AbortSignal | null | undefined
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (String(url).endsWith('/logout') || String(url).endsWith('/probe')) return new Response(null, { status: 204 })
    pendingSignal = init?.signal; return new Promise<Response>(resolve => { finish = resolve })
  })
  const result = start().then(() => 'accepted', () => 'rejected')
  await logout(); expect(pendingSignal?.aborted).toBe(true)
  finish(response('old-session')); expect(await result).toBe('rejected')
  await apiFetch('/api/v1/probe', undefined, false)
  expect(new Headers(fetch.mock.calls.at(-1)?.[1]?.headers).has('Authorization')).toBe(false)
  expect(getCsrfToken()).toBeNull()
})

it('nova entrada cancela a anterior e preserva os tokens da conta mais recente', async () => {
  let finish!: (value: Response) => void
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
    if (String(url).endsWith('/auth/google')) return response('new-session')
    if (String(url).endsWith('/probe')) return new Response(null, { status: 204 })
    return new Promise<Response>(resolve => { finish = resolve })
  })
  const old = login({ email: 'old.person', password: 'SyntheticPassword2!' }).then(() => 'accepted', () => 'rejected')
  await loginWithGoogle('new-synthetic-google')
  finish(response('old-session')); expect(await old).toBe('rejected')
  await apiFetch('/api/v1/probe', undefined, false)
  expect(new Headers(fetch.mock.calls.at(-1)?.[1]?.headers).get('Authorization')).toBe('Bearer new-session')
  expect(getCsrfToken()).toBe('csrf-new-session')
})

it('troca de senha antiga não limpa credenciais de uma nova entrada', async () => {
  setAccessToken('previous-session'); setCsrfToken('previous-csrf')
  let finish!: (value: Response) => void
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => String(url).endsWith('/auth/google') ? response('new-session') : String(url).endsWith('/probe') ? new Response(null, { status: 204 }) : new Promise<Response>(resolve => { finish = resolve }))
  const old = changePassword({ currentPassword: 'OldPassword2!', newPassword: 'NewSyntheticPassword2!' }).then(() => 'accepted', () => 'rejected')
  await loginWithGoogle('new-synthetic-google')
  finish(new Response(JSON.stringify({ requiresReauthentication: true }), { status: 200 })); expect(await old).toBe('rejected')
  await apiFetch('/api/v1/probe', undefined, false)
  expect(new Headers(fetch.mock.calls.at(-1)?.[1]?.headers).get('Authorization')).toBe('Bearer new-session')
})

it('resposta atrasada de sair não limpa uma sessão iniciada depois', async () => {
  let finish!: (value: Response) => void
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => String(url).endsWith('/auth/logout') ? new Promise<Response>(resolve => { finish = resolve }) : String(url).endsWith('/auth/google') ? response('new-session') : new Response(null, { status: 204 }))
  const old = logout().catch(() => undefined)
  await loginWithGoogle('synthetic-google'); finish(new Response(null, { status: 204 })); await old
  await apiFetch('/api/v1/probe', undefined, false)
  expect(new Headers(fetch.mock.calls.at(-1)?.[1]?.headers).get('Authorization')).toBe('Bearer new-session'); expect(getCsrfToken()).toBe('csrf-new-session')
})
