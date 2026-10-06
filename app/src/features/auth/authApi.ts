import { apiFetch, getCsrfToken, setAccessToken, setCsrfToken } from '../../lib/http'
import type {
  AuthUser,
  LoginCredentials,
  LoginResponse,
  PasswordChange,
  PasswordChangeResponse,
} from './types'

export async function login(credentials: LoginCredentials) {
  const response = await apiFetch<LoginResponse>(
    '/api/v1/auth/login',
    {
      method: 'POST',
      body: JSON.stringify(credentials),
    },
    false,
  )
  setAccessToken(response.accessToken)
  setCsrfToken(response.csrfToken)
  return response.user
}

export async function loginWithGoogle(credential: string) {
  const response = await fetch(`${(import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')}/api/v1/auth/google`, {
    method: 'POST',
    credentials: 'include',
    headers: { Authorization: `Bearer ${credential}`, Accept: 'application/json' },
  })
  if (!response.ok) throw new Error('Google sign-in was rejected.')
  const session = await response.json() as LoginResponse
  setAccessToken(session.accessToken)
  setCsrfToken(session.csrfToken)
  return session.user
}

export async function getCurrentUser() {
  return apiFetch<AuthUser>('/api/v1/auth/me', undefined, false)
}

export async function completeFirstAccessWithGoogle(credential: string) {
  const session = await apiFetch<LoginResponse>('/api/v1/auth/first-access/google', {
    method: 'POST', headers: { 'X-Google-Id-Token': credential },
  }, false)
  setAccessToken(session.accessToken)
  setCsrfToken(session.csrfToken)
  return session.user
}

export async function logout() {
  try {
    const headers = new Headers()
    const csrfToken = getCsrfToken()
    if (csrfToken) headers.set('X-CSRF-Token', csrfToken)
    await apiFetch<void>('/api/v1/auth/logout', { method: 'POST', headers }, false)
  } finally {
    setAccessToken(null)
    setCsrfToken(null)
  }
}

export async function changePassword(passwords: PasswordChange) {
  const response = await apiFetch<PasswordChangeResponse>('/api/v1/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(passwords),
  })
  setAccessToken(null)
  setCsrfToken(null)
  return response
}
