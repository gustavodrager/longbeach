import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { restoreSession, subscribeSession } from '../../lib/http'
import { changePassword, completeFirstAccessWithGoogle, getCurrentUser, login, loginWithGoogle, logout } from './authApi'
import { AuthContext } from './authContext'
import type { AuthUser, LoginCredentials, PasswordChange } from './types'

type AuthProviderProps = PropsWithChildren<{ demoMode?: boolean }>
const accessScope = (user: AuthUser | null) => user ? JSON.stringify([user.id, [...user.roles].sort(), [...user.permissions].sort(), Boolean(user.requiresFirstAccess)]) : null

export function AuthProvider({ children, demoMode = false }: AuthProviderProps) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isBootstrapping, setIsBootstrapping] = useState(!demoMode)
  const currentUser = useRef<AuthUser | null>(null)
  const updateSession = useCallback((next: AuthUser | null) => {
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
        const authenticatedUser = await login(credentials)
        updateSession(authenticatedUser)
      },
      signInWithGoogle: async (credential: string) => {
        const authenticatedUser = await loginWithGoogle(credential)
        updateSession(authenticatedUser)
      },
      signOut: async () => {
        try {
          await logout()
        } finally {
          updateSession(null)
        }
      },
      completeFirstAccessWithGoogle: async (credential: string) => {
        const authenticatedUser = await completeFirstAccessWithGoogle(credential)
        updateSession(authenticatedUser)
      },
      changePassword: async (passwords: PasswordChange) => {
        await changePassword(passwords)
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
