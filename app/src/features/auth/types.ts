export type UserRole =
  | 'BarOperator'
  | 'BarSupervisor'
  | 'StockManager'
  | 'BarFinance'
  | 'Owner'
  | 'Administrator'
  | 'Manager'
  | 'Teacher'
  | 'Operations'
  | 'Student'
  | 'Viewer'
  | 'Auditor'

export type AuthUser = {
  id: string
  name: string
  email: string
  roles: UserRole[]
  permissions: string[]
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
