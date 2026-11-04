export type UserRole = 'Manager' | 'Teacher' | 'Operations' | 'Student'

export type StaffAccessSummary = {
  typeId: string
  name: string
  role: UserRole
  menus: string[]
  actions: string[]
  homePath: string
}

export type AuthUser = {
  id: string
  name: string
  email: string
  roles: UserRole[]
  permissions: string[]
  googleLinked?: boolean
  localPasswordEnabled?: boolean
  requiresFirstAccess?: boolean
  needsCustomerProfile?: boolean
  username?: string | null
  phoneLogin?: string | null
  canManageStaff?: boolean
  requiresLocalPasswordChange?: boolean
  staffAccess?: StaffAccessSummary | null
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
