const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
const CSRF_COOKIE = 'lb_csrf'

type RefreshResponse = {
  accessToken: string
  csrfToken: string
}

let accessToken: string | null = null
let csrfToken: string | null = null
let refreshRequest: Promise<string | null> | null = null

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
    const headers = new Headers({ Accept: 'application/json' })
    const csrfToken = getCsrfToken()
    if (csrfToken) headers.set('X-CSRF-Token', csrfToken)

    refreshRequest = fetch(`${API_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers,
    })
      .then(async (response) => {
        if (!response.ok) {
          setAccessToken(null)
          setCsrfToken(null)
          return null
        }
        const data = (await response.json()) as RefreshResponse
        setAccessToken(data.accessToken)
        setCsrfToken(data.csrfToken)
        return data.accessToken
      })
      .catch(() => {
        setAccessToken(null)
        setCsrfToken(null)
        return null
      })
      .finally(() => {
        refreshRequest = null
      })
  }

  return refreshRequest
}

export async function apiFetch<T>(path: string, init?: RequestInit, canRefresh = true): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: buildHeaders(init),
  })

  if (response.status === 401 && canRefresh) {
    const refreshed = await refreshAccessToken()
    if (refreshed) return apiFetch<T>(path, init, false)
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readError(response))
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export async function restoreSession() {
  return refreshAccessToken()
}
