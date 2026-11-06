import type { AuthUser } from '../features/auth/types'

const user: AuthUser = { id: 'session-fixture', name: 'Pessoa teste', email: 'session@example.invalid', roles: ['Manager'], permissions: [] }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const session = (number = 1) => ({ accessToken: `synthetic-access-${number}`, csrfToken: `synthetic-csrf-${number}`, user })
const observers: (() => void)[] = []

beforeEach(() => {
  vi.resetModules()
  document.cookie = 'lb_csrf=; Max-Age=0; Path=/'
  vi.stubGlobal('navigator', { onLine: true })
})
afterEach(() => {
  observers.splice(0).forEach(unsubscribe => unsubscribe())
  document.cookie = 'lb_csrf=; Max-Age=0; Path=/'
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('usa o CSRF atual do cookie quando outra aba substituiu o valor em memória', async () => {
  const http = await import('./http')
  http.setCsrfToken('synthetic-old-csrf')
  document.cookie = `lb_csrf=${encodeURIComponent('synthetic-current+/=')}; Path=/`
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(session()))
  expect(await http.restoreSession()).toBe('synthetic-access-1')
  expect(new Headers(fetch.mock.calls[0][1]?.headers).get('X-CSRF-Token')).toBe('synthetic-current+/=')
  expect(fetch.mock.calls[0][1]?.credentials).toBe('include')
})

it('mantém a mesma renovação para chamadas simultâneas dentro da aba', async () => {
  const http = await import('./http')
  let finish!: (response: Response) => void
  const fetch = vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>(resolve => { finish = resolve }))
  const first = http.restoreSession(); const second = http.restoreSession()
  finish(json(session()))
  expect(await Promise.all([first, second])).toEqual(['synthetic-access-1', 'synthetic-access-1'])
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('serializa duas abas e lê o cookie rotacionado só depois de obter o lock', async () => {
  let tail = Promise.resolve<unknown>(undefined)
  const request = vi.fn((_name: string, callback: () => Promise<unknown>) => {
    const pending = tail.then(callback)
    tail = pending.catch(() => undefined)
    return pending
  })
  vi.stubGlobal('navigator', { onLine: true, locks: { request } })
  const firstTab = await import('./http')
  vi.resetModules()
  const secondTab = await import('./http')
  firstTab.setCsrfToken('synthetic-stale-first'); secondTab.setCsrfToken('synthetic-stale-second')
  document.cookie = 'lb_csrf=synthetic-csrf-0; Path=/'
  let releaseFirst!: () => void
  const firstPending = new Promise<void>(resolve => { releaseFirst = resolve })
  let rotation = 0; let inFlight = 0; let maximumInFlight = 0
  const csrfHeaders: (string | null)[] = []
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    inFlight++; maximumInFlight = Math.max(maximumInFlight, inFlight)
    const csrf = new Headers(init?.headers).get('X-CSRF-Token'); csrfHeaders.push(csrf)
    expect(csrf).toBe(`synthetic-csrf-${rotation}`)
    if (rotation === 0) await firstPending
    rotation++
    document.cookie = `lb_csrf=synthetic-csrf-${rotation}; Path=/`
    inFlight--
    return json(session(rotation))
  })
  const first = firstTab.restoreSession(); const second = secondTab.restoreSession()
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  releaseFirst()
  expect(await Promise.all([first, second])).toEqual(['synthetic-access-1', 'synthetic-access-2'])
  expect(maximumInFlight).toBe(1)
  expect(csrfHeaders).toEqual(['synthetic-csrf-0', 'synthetic-csrf-1'])
  expect(request.mock.calls.map(([name]) => name)).toEqual(['longbeach-auth-refresh', 'longbeach-auth-refresh'])
})

it('não envia uma renovação que aguardava o lock depois de encerrar a sessão', async () => {
  let run!: () => Promise<unknown>
  let release!: (result: unknown) => void
  vi.stubGlobal('navigator', { locks: { request: vi.fn((_name, callback) => { run = callback; return new Promise(resolve => { release = resolve }) }) } })
  const http = await import('./http')
  const fetch = vi.spyOn(globalThis, 'fetch')
  const restoring = http.restoreSession()
  http.expireSession()
  release(await run())
  expect(await restoring).toBeNull()
  expect(fetch).not.toHaveBeenCalled()
})

it('termina a rotação antiga antes de enviar um login novo sem restaurar a identidade antiga', async () => {
  let tail = Promise.resolve<unknown>(undefined)
  vi.stubGlobal('navigator', { locks: { request: (_name: string, work: () => Promise<unknown>) => {
    const pending = tail.then(work); tail = pending.catch(() => undefined); return pending
  } } })
  const http = await import('./http'); const auth = await import('../features/auth/authApi')
  const listener = vi.fn(); observers.push(http.subscribeSession(listener))
  let finish!: (response: Response) => void
  const previous = new Promise<Response>(resolve => { finish = resolve })
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => String(input).endsWith('/refresh') ? previous : json(session(2)))
  const restore = http.restoreSession()
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  const login = auth.login({ email: 'session@example.invalid', password: 'synthetic-password' })
  expect(fetch).toHaveBeenCalledTimes(1)
  finish(json(session(1)))
  expect(await restore).toBeNull()
  expect(await login).toEqual(user)
  expect(listener).not.toHaveBeenCalled()
  expect(fetch.mock.calls.map(([url]) => String(url))).toEqual(['/api/v1/auth/refresh', '/api/v1/auth/login'])
  await http.apiFetch('/api/v1/protected')
  expect(new Headers(fetch.mock.calls[2][1]?.headers).get('Authorization')).toBe('Bearer synthetic-access-2')
})

it('usa o CSRF rotacionado durante a espera do logout sem restaurar a sessão antiga', async () => {
  let tail = Promise.resolve<unknown>(undefined)
  vi.stubGlobal('navigator', { locks: { request: (_name: string, work: () => Promise<unknown>) => {
    const pending = tail.then(work); tail = pending.catch(() => undefined); return pending
  } } })
  const http = await import('./http'); const auth = await import('../features/auth/authApi')
  document.cookie = 'lb_csrf=synthetic-before; Path=/'
  let finish!: (response: Response) => void
  const previous = new Promise<Response>(resolve => { finish = resolve })
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => String(input).endsWith('/refresh') ? previous : new Response(null, { status: 204 }))
  const restore = http.restoreSession()
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  const logout = auth.logout()
  document.cookie = 'lb_csrf=synthetic-after; Path=/'
  finish(json(session()))
  expect(await restore).toBeNull()
  await logout
  expect(new Headers(fetch.mock.calls[1][1]?.headers).get('X-CSRF-Token')).toBe('synthetic-after')
  expect(fetch.mock.calls.map(([url]) => String(url))).toEqual(['/api/v1/auth/refresh', '/api/v1/auth/logout'])
})

it.each([409, 429, 500, 503])('trata refresh %s como indisponibilidade recuperável sem apagar a sessão', async status => {
  const http = await import('./http')
  const listener = vi.fn(); observers.push(http.subscribeSession(listener))
  http.setAccessToken('synthetic-current')
  const version = http.getSessionVersion()
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({}, status)).mockResolvedValueOnce(json(session()))
  await expect(http.restoreSession()).rejects.toMatchObject({ status })
  expect(listener).not.toHaveBeenCalled(); expect(http.getSessionVersion()).toBe(version)
  expect(await http.restoreSession()).toBe('synthetic-access-1')
  expect(listener).toHaveBeenCalledExactlyOnceWith(user)
})

it.each([401, 403])('continua encerrando a sessão quando o servidor recusa o refresh com %s', async status => {
  const http = await import('./http')
  const listener = vi.fn(); observers.push(http.subscribeSession(listener))
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({}, status))
  expect(await http.restoreSession()).toBeNull()
  expect(listener).toHaveBeenCalledExactlyOnceWith(null)
})

it('permite a primeira visita sem cookie de renovação', async () => {
  const http = await import('./http')
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({}, 400))
  expect(await http.restoreSession()).toBeNull()
})

it('mantém recuperável uma falha de conexão ao retomar a sessão', async () => {
  const http = await import('./http')
  const listener = vi.fn(); observers.push(http.subscribeSession(listener))
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Synthetic offline'))
  await expect(http.restoreSession()).rejects.toMatchObject({ status: 0 })
  expect(listener).not.toHaveBeenCalled()
})

it('não aceita uma resposta incompleta como identidade autenticada', async () => {
  const http = await import('./http')
  const listener = vi.fn(); observers.push(http.subscribeSession(listener))
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ accessToken: 'incomplete' }))
  await expect(http.restoreSession()).rejects.toMatchObject({ status: 502 })
  expect(listener).not.toHaveBeenCalled()
})
