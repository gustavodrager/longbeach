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

export async function getCurrentUser() {
  return apiFetch<AuthUser>('/api/v1/auth/me', undefined, false)
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
