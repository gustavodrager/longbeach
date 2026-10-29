import { apiFetch, getCsrfToken, setAccessToken, setCsrfToken, subscribeSession } from './http'
import type { AuthUser } from '../features/auth/types'

const attendant: AuthUser = { id: 'person', name: 'Pessoa teste', email: 'person@example.invalid', roles: ['Operations'], permissions: ['students:read', 'students:write'] }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const listeners: (() => void)[] = []
function observe() { const listener = vi.fn(); listeners.push(subscribeSession(listener)); return listener }
beforeEach(() => { setAccessToken('old-token'); setCsrfToken('old-csrf') })
afterEach(() => { listeners.splice(0).forEach(stop => stop()); setAccessToken(null); setCsrfToken(null); vi.restoreAllMocks() })

it('publica o usuário da renovação e repete somente a requisição que recebeu 401', async () => {
  const session = observe()
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json({ accessToken: 'new-token', csrfToken: 'new-csrf', user: attendant })).mockResolvedValueOnce(json({ ok: true }))
  expect(await apiFetch('/api/v1/protected')).toEqual({ ok: true })
  expect(session).toHaveBeenCalledExactlyOnceWith(attendant)
  expect(fetch.mock.calls.map(([url]) => String(url))).toEqual(['/api/v1/protected', '/api/v1/auth/refresh', '/api/v1/protected'])
  expect(new Headers(fetch.mock.calls[2][1]?.headers).get('Authorization')).toBe('Bearer new-token')
  expect(getCsrfToken()).toBe('new-csrf')
})

it('revalida uma vez em negativas simultâneas sem repetir as operações proibidas', async () => {
  const session = observe()
  let complete!: (response: Response) => void
  const pending = new Promise<Response>(resolve => { complete = resolve })
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => String(url).endsWith('/auth/me') ? pending : json({ detail: 'Acesso restrito' }, 403))
  const first = apiFetch('/api/v1/first', { method: 'POST', body: '{}' }).catch(error => error)
  const second = apiFetch('/api/v1/second', { method: 'POST', body: '{}' }).catch(error => error)
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
  complete(json(attendant))
  expect(await first).toMatchObject({ status: 403 }); expect(await second).toMatchObject({ status: 403 })
  expect(session).toHaveBeenCalledExactlyOnceWith(attendant)
  expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/auth/me'))).toHaveLength(1)
  expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(2)
})

it('encerra uma conta bloqueada sem tentar renovar nem criar ciclo em auth/me', async () => {
  const session = observe()
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({}, 403)).mockResolvedValueOnce(json({}, 401))
  await expect(apiFetch('/api/v1/protected')).rejects.toMatchObject({ status: 403 })
  expect(session).toHaveBeenCalledExactlyOnceWith(null)
  expect(fetch.mock.calls.map(([url]) => String(url))).toEqual(['/api/v1/protected', '/api/v1/auth/me'])
})

it('encerra a sessão após um novo 401 sem entrar em ciclo de renovação', async () => {
  const session = observe()
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json({ accessToken: 'new-token', csrfToken: 'new-csrf', user: attendant })).mockResolvedValueOnce(json({}, 401))
  await expect(apiFetch('/api/v1/protected')).rejects.toMatchObject({ status: 401 })
  expect(session.mock.calls).toEqual([[attendant], [null]])
  expect(fetch).toHaveBeenCalledTimes(3)
})

it('não encerra a sessão quando a renovação falha temporariamente', async () => {
  const session = observe()
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json({}, 503))
  await expect(apiFetch('/api/v1/protected')).rejects.toMatchObject({ status: 401 })
  expect(session).not.toHaveBeenCalled(); expect(getCsrfToken()).toBe('old-csrf')
})

it('descarta uma renovação que terminou depois da saída da conta', async () => {
  const session = observe()
  let complete!: (response: Response) => void
  const pending = new Promise<Response>(resolve => { complete = resolve })
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({}, 401)).mockReturnValueOnce(pending)
  const request = apiFetch('/api/v1/protected').catch(error => error)
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
  setAccessToken(null); setCsrfToken(null)
  complete(json({ accessToken: 'stale-token', csrfToken: 'stale-csrf', user: attendant }))
  expect(await request).toMatchObject({ status: 401 })
  expect(session).not.toHaveBeenCalled(); expect(fetch).toHaveBeenCalledTimes(2)
  expect(getCsrfToken()).not.toBe('stale-csrf')
})

it.each([
  { replacement: null, change: 'logout' },
  { replacement: 'another-account-token', change: 'login de outra pessoa' },
  { replacement: 'new-token', change: 'nova sessão com o mesmo token' },
])('não reenvia a mutação se ocorrer $change entre a renovação e o replay', async ({ replacement }) => {
  listeners.push(subscribeSession(() => {
    queueMicrotask(() => { setAccessToken(replacement); setCsrfToken(replacement ? 'other-csrf' : null) })
  }))
  let complete!: (response: Response) => void
  const pending = new Promise<Response>(resolve => { complete = resolve })
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({}, 401)).mockReturnValueOnce(pending).mockResolvedValue(json({ ok: true }))
  const request = apiFetch('/api/v1/protected', { method: 'POST', body: '{"value":1}' }).catch(error => error)
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
  complete(json({ accessToken: 'new-token', csrfToken: 'new-csrf', user: attendant }))
  expect(await request).toMatchObject({ status: 401 })
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/protected'))).toHaveLength(1)
})

it('permite reenvios paralelos que pertencem à mesma renovação', async () => {
  let complete!: (response: Response) => void
  const pending = new Promise<Response>(resolve => { complete = resolve })
  const attempts = new Map<string, number>()
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const path = String(input)
    if (path.endsWith('/auth/refresh')) return pending
    const attempt = (attempts.get(path) ?? 0) + 1; attempts.set(path, attempt)
    return json({ ok: true }, attempt === 1 ? 401 : 200)
  })
  const first = apiFetch('/api/v1/first', { method: 'POST', body: '{}' })
  const second = apiFetch('/api/v1/second', { method: 'POST', body: '{}' })
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
  complete(json({ accessToken: 'new-token', csrfToken: 'new-csrf', user: attendant }))
  expect(await Promise.all([first, second])).toEqual([{ ok: true }, { ok: true }])
  expect(fetch).toHaveBeenCalledTimes(5)
  expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'))).toHaveLength(1)
  expect(fetch.mock.calls.slice(-2).map(([, init]) => new Headers(init?.headers).get('Authorization'))).toEqual(['Bearer new-token', 'Bearer new-token'])
})
