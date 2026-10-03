import { useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import { restoreSession } from '../../lib/http'
import { changePassword, getCurrentUser, login, logout } from './authApi'
import { AuthContext } from './authContext'
import type { AuthUser, LoginCredentials, PasswordChange } from './types'

type AuthProviderProps = PropsWithChildren<{ demoMode?: boolean }>

export function AuthProvider({ children, demoMode = false }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isBootstrapping, setIsBootstrapping] = useState(!demoMode)

  useEffect(() => {
    if (demoMode) {
      setIsBootstrapping(false)
      return
    }

    let active = true

    async function bootstrap() {
      const token = await restoreSession()
      if (token) {
        try {
          const currentUser = await getCurrentUser()
          if (active) setUser(currentUser)
        } catch {
          if (active) setUser(null)
        }
      }
      if (active) setIsBootstrapping(false)
    }

    void bootstrap()
    return () => {
      active = false
    }
  }, [demoMode])

  const value = useMemo(
    () => ({
      user,
      isBootstrapping,
      signIn: async (credentials: LoginCredentials) => {
        const authenticatedUser = await login(credentials)
        setUser(authenticatedUser)
      },
      signOut: async () => {
        try {
          await logout()
        } finally {
          setUser(null)
        }
      },
      changePassword: async (passwords: PasswordChange) => {
        await changePassword(passwords)
        try {
          sessionStorage.setItem('lb_password_changed', '1')
        } catch {
          // Session storage can be unavailable in restricted browser modes.
        }
        setUser(null)
      },
    }),
    [isBootstrapping, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
