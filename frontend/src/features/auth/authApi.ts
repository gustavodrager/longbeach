import { ApiError, apiFetch, expireSession, getCsrfToken, getSessionVersion, setAccessToken, setCsrfToken, subscribeSessionVersion } from '../../lib/http'
import type {
  AuthUser,
  LoginCredentials,
  LoginResponse,
  PasswordChange,
  PasswordChangeResponse,
} from './types'

let pendingAuthentication: AbortController | null = null
function authenticationAttempt() {
  pendingAuthentication?.abort()
  const controller = new AbortController()
  pendingAuthentication = controller
  const version = getSessionVersion()
  const unsubscribe = subscribeSessionVersion(() => controller.abort())
  controller.signal.addEventListener('abort', unsubscribe, { once: true })
  const finish = () => { unsubscribe(); if (pendingAuthentication === controller) pendingAuthentication = null }
  const accept = (response: LoginResponse) => {
    if (controller.signal.aborted || getSessionVersion() !== version) throw new Error('Seu acesso mudou. Entre novamente.')
    finish(); setAccessToken(response.accessToken); setCsrfToken(response.csrfToken)
    return response.user
  }
  const clear = () => {
    if (controller.signal.aborted || getSessionVersion() !== version) throw new Error('Seu acesso mudou. Entre novamente.')
    finish(); setAccessToken(null); setCsrfToken(null)
  }
  return { signal: controller.signal, finish, accept, clear }
}

export async function login(credentials: LoginCredentials) {
  const attempt = authenticationAttempt()
  try {
    const response = await apiFetch<LoginResponse>(
      '/api/v1/auth/login',
      {
        method: 'POST',
        body: JSON.stringify(credentials),
        signal: attempt.signal,
      },
      false,
    )
    return attempt.accept(response)
  } finally { attempt.finish() }
}

export async function loginWithGoogle(credential: string) {
  const attempt = authenticationAttempt()
  try {
    const response = await fetch(`${(import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')}/api/v1/auth/google`, {
      method: 'POST',
      credentials: 'include',
      headers: { Authorization: `Bearer ${credential}`, Accept: 'application/json' },
      signal: attempt.signal,
    })
    if (!response.ok) throw new Error(response.status === 429
      ? 'Muitas tentativas. Aguarde um minuto e tente novamente.'
      : response.status >= 500
        ? 'Não foi possível concluir o acesso agora. Tente novamente em instantes.'
        : 'Não foi possível acessar com esta conta Google. Confira se escolheu a conta Google correta ou peça à equipe para conferir o vínculo.')
    const session = await response.json() as LoginResponse
    return attempt.accept(session)
  } finally { attempt.finish() }
}

export async function getCurrentUser() {
  return apiFetch<AuthUser>('/api/v1/auth/me', undefined, false)
}

export async function completeFirstAccessWithGoogle(credential: string) {
  const attempt = authenticationAttempt()
  try {
    const session = await apiFetch<LoginResponse>('/api/v1/auth/first-access/google', {
      method: 'POST', headers: { 'X-Google-Id-Token': credential },
      signal: attempt.signal,
    }, false)
    return attempt.accept(session)
  } finally { attempt.finish() }
}

export async function logout() {
  const csrfToken = getCsrfToken()
  pendingAuthentication?.abort()
  expireSession()
  const attempt = authenticationAttempt()
  try {
    const headers = new Headers()
    if (csrfToken) headers.set('X-CSRF-Token', csrfToken)
    await apiFetch<void>('/api/v1/auth/logout', { method: 'POST', headers, signal: attempt.signal }, false)
  } finally { attempt.finish() }
}

export async function changePassword(passwords: PasswordChange) {
  const attempt = authenticationAttempt()
  try {
    const response = await apiFetch<PasswordChangeResponse>('/api/v1/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(passwords),
      signal: attempt.signal,
    }, false)
    attempt.clear()
    return response
  } finally { attempt.finish() }
}

export type SignInOptions = { googleClientId: string | null; clientRegistrationEnabled: boolean; localLoginEnabled?: boolean; localRegistrationEnabled?: boolean; homologationLoginEnabled?: boolean }
export function getSignInOptions() {
  return apiFetch<SignInOptions>('/api/v1/auth/options', undefined, false)
}

export type RegistrationInput = { name: string; phone: string; email?: string | null; username: string; password: string }
export async function publicAuthRequest<T>(path: string, body: unknown, googleCredential?: string): Promise<T> {
  const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'application/json' })
  if (googleCredential) headers.set('Authorization', `Bearer ${googleCredential}`)
  const response = await fetch(`${(import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')}/api/v1/auth${path}`, {
    method: 'POST', credentials: 'include', headers, body: JSON.stringify(body),
  })
  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { detail?: string; message?: string } | null
    throw new ApiError(response.status, problem?.detail ?? problem?.message ?? (response.status === 429 ? 'Muitas tentativas. Aguarde e tente novamente.' : 'Não foi possível concluir. Confira os dados e tente novamente.'))
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}
export const registerClient = (input: RegistrationInput) => publicAuthRequest<void>('/register', input)
export const registerGoogleClient = (input: Pick<RegistrationInput, 'name' | 'phone'>, credential: string) => {
  pendingAuthentication?.abort()
  return publicAuthRequest<void>('/google/register', input, credential)
}
