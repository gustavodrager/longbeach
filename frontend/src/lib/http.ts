import type { AuthUser, LoginResponse } from '../features/auth/types'

const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
const CSRF_COOKIE = 'lb_csrf'

type RefreshResponse = Pick<LoginResponse, 'accessToken' | 'csrfToken' | 'user'>
type RefreshedSession = { token: string; version: number }
type RefreshResult = { session: RefreshedSession | null; unavailable?: ApiError }

let accessToken: string | null = null
let csrfToken: string | null = null
let refreshRequest: Promise<RefreshResult> | null = null
let sessionVersion = 0
let identityRequest: { version: number; request: Promise<void> } | null = null
const sessionListeners = new Set<(user: AuthUser | null) => void>()
const sessionVersionListeners = new Set<() => void>()

export const getSessionVersion = () => sessionVersion
export function subscribeSessionVersion(listener: () => void) {
  sessionVersionListeners.add(listener)
  return () => { sessionVersionListeners.delete(listener) }
}

export function subscribeSession(listener: (user: AuthUser | null) => void) {
  sessionListeners.add(listener)
  return () => { sessionListeners.delete(listener) }
}

function notifySession(user: AuthUser | null) {
  sessionListeners.forEach(listener => listener(user))
}

export function expireSession() {
  setAccessToken(null)
  setCsrfToken(null)
  notifySession(null)
}

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function setAccessToken(token: string | null) {
  accessToken = token
  invalidateSessionRequests()
}

/** Explicit account actions take precedence over an older background restore. */
export function invalidateSessionRequests() {
  sessionVersion++
  sessionVersionListeners.forEach(listener => listener())
}

export function getCsrfToken() {
  if (typeof document === 'undefined') return csrfToken

  // Another tab can rotate the shared refresh/CSRF cookies while this page stays open.
  let cookie: string | undefined
  try {
    cookie = document.cookie.split('; ').find(entry => entry.startsWith(`${CSRF_COOKIE}=`))
  } catch { return csrfToken }
  if (!cookie) return csrfToken

  const encodedValue = cookie.slice(CSRF_COOKIE.length + 1)
  try {
    csrfToken = decodeURIComponent(encodedValue)
  } catch {
    csrfToken = encodedValue
  }
  return csrfToken
}

export function setCsrfToken(token: string | null) {
  csrfToken = token
}

function buildHeaders(init?: RequestInit) {
  const headers = new Headers(init?.headers)
  if (init?.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }
  return headers
}

async function readError(response: Response) {
  try {
    const body = (await response.json()) as { detail?: string; message?: string; title?: string }
    return body.detail ?? body.message ?? body.title ?? 'Não foi possível concluir a solicitação.'
  } catch {
    return 'Não foi possível concluir a solicitação.'
  }
}

async function performRefresh(version: number): Promise<RefreshResult> {
  if (version !== sessionVersion) return { session: null }
  const headers = new Headers({ Accept: 'application/json' })
  const currentCsrf = getCsrfToken()
  if (currentCsrf) headers.set('X-CSRF-Token', currentCsrf)
  const response = await fetch(`${API_URL}/api/v1/auth/refresh`, { method: 'POST', credentials: 'include', headers })
  if (version !== sessionVersion) return { session: null }
  if (!response.ok) {
    if ([401, 403].includes(response.status)) { expireSession(); return { session: null } }
    if (response.status === 400) return { session: null } // No refresh cookie on a first visit.
    return { session: null, unavailable: new ApiError(response.status, 'Não foi possível retomar seu acesso. Tente novamente.') }
  }
  const data = (await response.json()) as RefreshResponse
  if (version !== sessionVersion) return { session: null }
  if (!data || typeof data.accessToken !== 'string' || !data.accessToken || typeof data.csrfToken !== 'string' || !data.csrfToken
    || !data.user || typeof data.user.id !== 'string' || !Array.isArray(data.user.roles) || !Array.isArray(data.user.permissions))
    throw new ApiError(502, 'Não foi possível retomar seu acesso. Tente novamente.')
  setAccessToken(data.accessToken)
  setCsrfToken(data.csrfToken)
  const session = { token: data.accessToken, version: sessionVersion }
  notifySession(data.user)
  return { session }
}

/** Cookie rotations and explicit account changes share a lock across browser tabs. */
export async function withSessionCookieLock<T>(work: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  return locks ? locks.request('longbeach-auth-refresh', work) : work()
}

async function refreshAccessToken() {
  if (!refreshRequest) {
    const version = sessionVersion
    // Read the current CSRF cookie only after acquiring the cross-tab lock.
    const pending = withSessionCookieLock(() => performRefresh(version)).catch((cause): RefreshResult => version !== sessionVersion ? { session: null } : {
      session: null, unavailable: cause instanceof ApiError ? cause : new ApiError(0, 'Não foi possível retomar seu acesso. Tente novamente.'),
    }).finally(() => { if (refreshRequest === pending) refreshRequest = null })
    refreshRequest = pending
  }
  return refreshRequest
}

/** A forbidden operation is never replayed; only the current identity is checked. */
async function revalidateSession(version: number) {
  if (identityRequest?.version === version) return identityRequest.request
  const request = (async () => {
    try {
      const response = await fetch(`${API_URL}/api/v1/auth/me`, { credentials: 'include', headers: buildHeaders() })
      if (version !== sessionVersion) return
      if ([401, 403].includes(response.status)) { expireSession(); return }
      if (response.ok) {
        const user = await response.json() as AuthUser
        if (version === sessionVersion) notifySession(user)
      }
    } catch { /* Keep the current session and drafts on a temporary connection failure. */ }
  })()
  identityRequest = { version, request }
  try { await request } finally { if (identityRequest?.request === request) identityRequest = null }
}

export async function apiFetch<T>(path: string, init?: RequestInit, canRefresh = true, responseType: 'json' | 'blob' = 'json'): Promise<T> {
  if (path.startsWith('/api/v1/bar/') && init?.method && !['GET', 'HEAD'].includes(init.method.toUpperCase()) && !navigator.onLine)
    throw new ApiError(0, 'Sem conexão. O registro só será confirmado após reconectar. Seu rascunho foi preservado.');
  const version = sessionVersion
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: buildHeaders(init),
  })

  const authentication = path.startsWith('/api/v1/auth/')
  if (response.status === 401 && canRefresh && version === sessionVersion) {
    const { session: refreshed } = await refreshAccessToken()
    if (refreshed && refreshed.version === sessionVersion && refreshed.token === accessToken) return apiFetch<T>(path, init, false, responseType)
  }

  if (response.status === 401 && !canRefresh && version === sessionVersion && (!authentication || path === '/api/v1/auth/me')) expireSession()
  if (response.status === 403 && !canRefresh && version === sessionVersion && path === '/api/v1/auth/me') expireSession()
  if (response.status === 403 && !authentication && version === sessionVersion && sessionListeners.size > 0) await revalidateSession(version)

  if (!response.ok) {
    throw new ApiError(response.status, await readError(response))
  }

  if (response.status === 204) return undefined as T
  if (responseType === 'blob') return response.blob() as Promise<T>
  return response.json() as Promise<T>
}

/** Private media uses the same authentication and expiry rules as JSON requests. */
export const apiFetchBlob = (path: string, signal?: AbortSignal) => apiFetch<Blob>(path, { signal }, true, 'blob')

export async function restoreSession() {
  const { session: refreshed, unavailable } = await refreshAccessToken()
  if (unavailable) throw unavailable
  return refreshed?.version === sessionVersion && refreshed.token === accessToken ? refreshed.token : null
}

/** A PWA reload must also await this tab's refresh in browsers without Web Locks. */
export async function waitForPendingSessionRefresh() {
  await refreshRequest
}
