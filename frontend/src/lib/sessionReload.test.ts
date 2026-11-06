import { restoreSession, setAccessToken, setCsrfToken, withSessionCookieLock } from './http'
import { reloadAfterSessionRequests } from './sessionReload'

const originalLocks = Object.getOwnPropertyDescriptor(navigator, 'locks')
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
const session = { accessToken: 'synthetic-reload-token', csrfToken: 'synthetic-reload-csrf', user: { id: 'reload-person', name: 'Pessoa fictícia', email: 'reload@example.invalid', roles: ['Manager'], permissions: ['finance:read'] } }
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(finish => { resolve = finish })
  return { promise, resolve }
}
function installLocks() {
  let tail = Promise.resolve()
  const request = vi.fn((_name: string, work: () => Promise<unknown>) => {
    const result = tail.then(work)
    tail = result.then(() => undefined, () => undefined)
    return result
  })
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } })
  return request
}

beforeEach(() => {
  vi.useFakeTimers(); setAccessToken(null); setCsrfToken(null)
  Reflect.deleteProperty(navigator, 'locks')
})
afterEach(() => {
  setAccessToken(null); setCsrfToken(null); vi.useRealTimers(); vi.restoreAllMocks()
  if (originalLocks) Object.defineProperty(navigator, 'locks', originalLocks)
  else Reflect.deleteProperty(navigator, 'locks')
})

it.each([true, false])('aguarda a renovação em andamento antes de recarregar, Web Locks=%s', async supported => {
  if (supported) installLocks()
  const started = deferred<void>(), response = deferred<Response>(), navigated = deferred<void>()
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => { started.resolve(); return response.promise })
  const refreshing = restoreSession()
  await started.promise
  const reload = vi.fn(() => { navigated.resolve() })
  const navigation = reloadAfterSessionRequests(reload)
  await vi.advanceTimersByTimeAsync(5_000)
  expect(reload).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
  response.resolve(json(session))
  expect(await refreshing).toBe(session.accessToken)
  await navigated.promise
  expect(reload).toHaveBeenCalledTimes(1)
  window.dispatchEvent(new Event('pagehide'))
  await navigation
  expect(vi.getTimerCount()).toBe(0)
})

it('inicia o escape somente após adquirir o lock e o pagehide libera imediatamente', async () => {
  installLocks()
  const active = deferred<void>(), release = deferred<void>(), navigated = deferred<void>()
  const request = withSessionCookieLock(async () => { active.resolve(); await release.promise })
  await active.promise
  const reload = vi.fn(() => { navigated.resolve() })
  const navigation = reloadAfterSessionRequests(reload)
  await vi.advanceTimersByTimeAsync(5_000)
  expect(reload).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
  release.resolve()
  await request; await navigated.promise
  let nextAcquired = false
  const next = withSessionCookieLock(async () => { nextAcquired = true })
  await vi.advanceTimersByTimeAsync(0)
  expect(nextAcquired).toBe(false)
  window.dispatchEvent(new Event('pagehide'))
  await navigation; await next
  expect(nextAcquired).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})

it('libera o lock após dois segundos quando a navegação é cancelada', async () => {
  installLocks()
  const navigated = deferred<void>(), reload = vi.fn(() => { navigated.resolve() })
  const navigation = reloadAfterSessionRequests(reload)
  await navigated.promise
  let nextAcquired = false
  const next = withSessionCookieLock(async () => { nextAcquired = true })
  await vi.advanceTimersByTimeAsync(1_999)
  expect(nextAcquired).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  await navigation; await next
  expect(nextAcquired).toBe(true)
  expect(reload).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})

it('uma falha ao navegar remove o listener e libera o lock sem tentar de novo', async () => {
  installLocks()
  const remove = vi.spyOn(window, 'removeEventListener')
  const reload = vi.fn(() => { throw new Error('Navigation blocked') })
  await expect(reloadAfterSessionRequests(reload)).resolves.toBeUndefined()
  const next = vi.fn(async () => undefined)
  await withSessionCookieLock(next)
  expect(next).toHaveBeenCalledTimes(1)
  expect(reload).toHaveBeenCalledTimes(1)
  expect(remove).toHaveBeenCalledWith('pagehide', expect.any(Function))
  expect(vi.getTimerCount()).toBe(0)
})

it('propaga falha de aquisição para permitir fallback antes de qualquer navegação', async () => {
  const failure = new Error('Locks unavailable')
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: vi.fn().mockRejectedValue(failure) } })
  const reload = vi.fn()
  await expect(reloadAfterSessionRequests(reload)).rejects.toBe(failure)
  expect(reload).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('o pagehide também conclui a recarga sem suporte a Web Locks', async () => {
  const navigated = deferred<void>(), reload = vi.fn(() => { navigated.resolve() })
  const remove = vi.spyOn(window, 'removeEventListener')
  const navigation = reloadAfterSessionRequests(reload)
  await navigated.promise
  window.dispatchEvent(new Event('pagehide'))
  await navigation
  expect(reload).toHaveBeenCalledTimes(1)
  expect(remove).toHaveBeenCalledWith('pagehide', expect.any(Function))
  expect(vi.getTimerCount()).toBe(0)
})
