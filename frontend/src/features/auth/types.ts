export type UserRole = 'Manager' | 'Teacher' | 'Operations' | 'Student'

export type AuthUser = {
  id: string
  name: string
  email: string
  roles: UserRole[]
  permissions: string[]
  googleLinked?: boolean
  requiresFirstAccess?: boolean
  username?: string | null
}

export type LoginCredentials = {
  email: string
  password: string
}

export type PasswordChange = {
  currentPassword: string
  newPassword: string
}

export type LoginResponse = {
  accessToken: string
  accessTokenExpiresAtUtc: string
  csrfToken: string
  user: AuthUser
}

export type PasswordChangeResponse = {
  message: string
  requiresReauthentication: boolean
}
