import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiFetch, restoreSession, subscribeSession } from '../../lib/http'
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
  const currentUser = useRef<AuthUser | null>(null)
  const sessionEpoch = useRef(0)
  const updateSession = useCallback((next: AuthUser | null) => {
    sessionEpoch.current++
    if (accessScope(currentUser.current) !== accessScope(next)) queryClient.clear()
    currentUser.current = next
    setUser(next)
  }, [queryClient])

  useEffect(() => {
    if (demoMode) {
      setIsBootstrapping(false)
      return
    }

    let active = true
    const unsubscribe = subscribeSession(next => { if (active) updateSession(next) })

    async function bootstrap() {
      const token = await restoreSession()
      if (token) {
        const restoringUser = currentUser.current
        try {
          const restoredUser = await getCurrentUser()
          if (active && currentUser.current === restoringUser) updateSession(restoredUser)
        } catch {
          if (active && currentUser.current === restoringUser) updateSession(null)
        }
      }
      if (active) setIsBootstrapping(false)
    }

    void bootstrap()
    return () => {
      active = false
      unsubscribe()
    }
  }, [demoMode, updateSession])

  const value = useMemo(
    () => ({
      user,
      isBootstrapping,
      signIn: async (credentials: LoginCredentials) => {
        const started = ++sessionEpoch.current
        const authenticatedUser = await login(credentials)
        if (sessionEpoch.current === started) updateSession(authenticatedUser)
      },
      signInWithGoogle: async (credential: string, registration?: { name: string; phone: string }) => {
        const started = ++sessionEpoch.current
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
        const started = ++sessionEpoch.current
        try {
          await logout()
        } finally {
          if (sessionEpoch.current === started) updateSession(null)
        }
      },
      completeFirstAccessWithGoogle: async (credential: string) => {
        const started = ++sessionEpoch.current
        const authenticatedUser = await completeFirstAccessWithGoogle(credential)
        if (sessionEpoch.current === started) updateSession(authenticatedUser)
      },
      completeCustomerProfile: () => {
        const current = currentUser.current
        if (current?.needsCustomerProfile) updateSession({ ...current, needsCustomerProfile: false })
      },
      changePassword: async (passwords: PasswordChange) => {
        const started = ++sessionEpoch.current
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
    [isBootstrapping, user, updateSession],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
