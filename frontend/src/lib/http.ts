import type { AuthUser, LoginResponse } from '../features/auth/types'

const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
const CSRF_COOKIE = 'lb_csrf'

type RefreshResponse = Pick<LoginResponse, 'accessToken' | 'csrfToken' | 'user'>
type RefreshedSession = { token: string; version: number }

let accessToken: string | null = null
let csrfToken: string | null = null
let refreshRequest: Promise<RefreshedSession | null> | null = null
let sessionVersion = 0
let identityRequest: { version: number; request: Promise<void> } | null = null
const sessionListeners = new Set<(user: AuthUser | null) => void>()

export function subscribeSession(listener: (user: AuthUser | null) => void) {
  sessionListeners.add(listener)
  return () => { sessionListeners.delete(listener) }
}

function notifySession(user: AuthUser | null) {
  sessionListeners.forEach(listener => listener(user))
}

function expireSession() {
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
  sessionVersion++
}

export function getCsrfToken() {
  if (csrfToken) return csrfToken
  if (typeof document === 'undefined') return null

  const cookie = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${CSRF_COOKIE}=`))
  if (!cookie) return null

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

async function refreshAccessToken() {
  if (!refreshRequest) {
    const version = sessionVersion
    const headers = new Headers({ Accept: 'application/json' })
    const csrfToken = getCsrfToken()
    if (csrfToken) headers.set('X-CSRF-Token', csrfToken)

    refreshRequest = fetch(`${API_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers,
    })
      .then(async (response) => {
        if (version !== sessionVersion) return null
        if (!response.ok) {
          if ([401, 403].includes(response.status)) expireSession()
          return null
        }
        const data = (await response.json()) as RefreshResponse
        if (version !== sessionVersion) return null
        setAccessToken(data.accessToken)
        setCsrfToken(data.csrfToken)
        const refreshed = { token: data.accessToken, version: sessionVersion }
        notifySession(data.user)
        return refreshed
      })
      .catch(() => null)
      .finally(() => {
        refreshRequest = null
      })
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

export async function apiFetch<T>(path: string, init?: RequestInit, canRefresh = true): Promise<T> {
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
    const refreshed = await refreshAccessToken()
    if (refreshed && refreshed.version === sessionVersion && refreshed.token === accessToken) return apiFetch<T>(path, init, false)
  }

  if (response.status === 401 && !canRefresh && version === sessionVersion && (!authentication || path === '/api/v1/auth/me')) expireSession()
  if (response.status === 403 && !authentication && version === sessionVersion && sessionListeners.size > 0) await revalidateSession(version)

  if (!response.ok) {
    throw new ApiError(response.status, await readError(response))
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export async function restoreSession() {
  const refreshed = await refreshAccessToken()
  return refreshed?.version === sessionVersion && refreshed.token === accessToken ? refreshed.token : null
}
