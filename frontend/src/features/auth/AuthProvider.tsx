import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError, apiFetch, restoreSession, subscribeSession } from '../../lib/http'
import { changePassword, completeFirstAccessWithGoogle, getCurrentUser, login, loginWithGoogle, logout, registerGoogleClient } from './authApi'
import { AuthContext } from './authContext'
import type { AuthUser, LoginCredentials, PasswordChange } from './types'
import { staffScopeKey } from './staffScope'

type AuthProviderProps = PropsWithChildren<{ demoMode?: boolean }>
const accessScope = staffScopeKey

export function AuthProvider({ children, demoMode = false }: AuthProviderProps) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isBootstrapping, setIsBootstrapping] = useState(!demoMode)
  const [sessionRestoreError, setSessionRestoreError] = useState<string | null>(null)
  const [restoreAttempt, setRestoreAttempt] = useState(0)
  const currentUser = useRef<AuthUser | null>(null)
  const sessionEpoch = useRef(0)
  const updateSession = useCallback((next: AuthUser | null) => {
    sessionEpoch.current++
    if (accessScope(currentUser.current) !== accessScope(next)) queryClient.clear()
    currentUser.current = next
    setUser(next)
    setSessionRestoreError(null)
  }, [queryClient])
  const beginAuthentication = useCallback(() => {
    setSessionRestoreError(null)
    setIsBootstrapping(false)
    return ++sessionEpoch.current
  }, [])
  const retrySessionRestore = useCallback(() => {
    setSessionRestoreError(null)
    setIsBootstrapping(true)
    setRestoreAttempt(attempt => attempt + 1)
  }, [])

  useEffect(() => {
    if (demoMode) {
      setIsBootstrapping(false)
      return
    }

    let active = true
    const started = sessionEpoch.current
    const unsubscribe = subscribeSession(next => { if (active) updateSession(next) })
    setIsBootstrapping(true)
    setSessionRestoreError(null)

    async function bootstrap() {
      try {
        const token = await restoreSession()
        if (!active || !token) return
        const restoredEpoch = sessionEpoch.current
        try {
          const restoredUser = await getCurrentUser()
          if (active && sessionEpoch.current === restoredEpoch) updateSession(restoredUser)
        } catch (error) {
          // The refresh has already validated this user. A temporary /me
          // failure must not discard that session or override a newer login.
          if (active && sessionEpoch.current === restoredEpoch && error instanceof ApiError && [401, 403].includes(error.status)) updateSession(null)
        }
      } catch {
        if (active && sessionEpoch.current === started && !currentUser.current) setSessionRestoreError('Não foi possível retomar seu acesso.')
      } finally {
        if (active) setIsBootstrapping(false)
      }
    }

    void bootstrap()
    return () => {
      active = false
      unsubscribe()
    }
  }, [demoMode, restoreAttempt, updateSession])

  const value = useMemo(
    () => ({
      user,
      isBootstrapping,
      sessionRestoreError,
      retrySessionRestore,
      signIn: async (credentials: LoginCredentials) => {
        const started = beginAuthentication()
        const authenticatedUser = await login(credentials)
        if (sessionEpoch.current === started) updateSession(authenticatedUser)
      },
      signInWithGoogle: async (credential: string, registration?: { name: string; phone: string }) => {
        const started = beginAuthentication()
        if (registration) {
          await registerGoogleClient(registration, credential)
          if (sessionEpoch.current !== started) return
        }
        const authenticatedUser = await loginWithGoogle(credential)
        if (authenticatedUser.roles.length === 1 && authenticatedUser.roles[0] === 'Student') {
          try {
            const customer = await apiFetch<{ incomplete: boolean } | null>('/api/v1/me/customer')
            if (!customer || customer.incomplete) authenticatedUser.needsCustomerProfile = true
          } catch { /* The login remains valid; a failed lookup never creates or links a customer. */ }
        }
        if (sessionEpoch.current === started) updateSession(authenticatedUser)
      },
      signOut: async () => {
        const started = beginAuthentication()
        try {
          await logout()
        } finally {
          if (sessionEpoch.current === started) updateSession(null)
        }
      },
      completeFirstAccessWithGoogle: async (credential: string) => {
        const started = beginAuthentication()
        const authenticatedUser = await completeFirstAccessWithGoogle(credential)
        if (sessionEpoch.current === started) updateSession(authenticatedUser)
      },
      completeCustomerProfile: () => {
        const current = currentUser.current
        if (current?.needsCustomerProfile) updateSession({ ...current, needsCustomerProfile: false })
      },
      changePassword: async (passwords: PasswordChange) => {
        const started = beginAuthentication()
        await changePassword(passwords)
        if (sessionEpoch.current !== started) return
        try {
          sessionStorage.setItem('lb_password_changed', '1')
        } catch {
          // Session storage can be unavailable in restricted browser modes.
        }
        updateSession(null)
      },
    }),
    [isBootstrapping, user, updateSession, sessionRestoreError, retrySessionRestore, beginAuthentication],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
