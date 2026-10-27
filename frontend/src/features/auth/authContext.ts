import { createContext, useContext } from 'react'
import type { AuthUser, LoginCredentials, PasswordChange } from './types'

export type AuthContextValue = {
  user: AuthUser | null
  isBootstrapping: boolean
  signIn: (credentials: LoginCredentials) => Promise<void>
  signInWithGoogle: (credential: string) => Promise<void>
  signOut: () => Promise<void>
  changePassword: (passwords: PasswordChange) => Promise<void>
  completeFirstAccessWithGoogle: (credential: string) => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return context
}
