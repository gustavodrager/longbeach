import type { AuthUser, UserRole } from './types'
import { canManageStaff, hasStaffScope, staffPathAllowed } from './staffScope'
export { canManageStaff, hasStaffAction, hasStaffMenu, hasStaffScope, staffPathAllowed } from './staffScope'

const roles: UserRole[] = ['Manager', 'Teacher', 'Operations', 'Student']
const labels: Record<UserRole, string> = { Manager: 'Gestor', Teacher: 'Professor', Operations: 'Atendente', Student: 'Cliente' }
const attendantPermissions = new Set([
  'messaging:read', 'messaging:operate',
  'customers:read', 'customers:write',
  'bar:catalog:read', 'bar:stock:output', 'bar:stock:read', 'bar:cash:operate', 'bar:sales:read', 'bar:sales:operate',
  'students:read', 'students:write', 'employees:read',
  'inventory:read', 'inventory:write', 'projects:read', 'projects:write',
])

/** Exactly one current profile is required, including for old or malformed sessions. */
export function profileRole(user: AuthUser | null | undefined): UserRole | null {
  return user && !user.requiresFirstAccess && Array.isArray(user.roles) && user.roles.length === 1 && roles.includes(user.roles[0]) ? user.roles[0] : null
}
export const profileLabel = (user: AuthUser | null | undefined) => { const role = profileRole(user); return role ? labels[role] : 'Acesso pendente' }
export const isManagement = (user: AuthUser | null | undefined) => profileRole(user) === 'Manager'
export function hasPermission(user: AuthUser | null | undefined, permission: string): boolean {
  const role = profileRole(user)
  if (permission === 'employees:read' && canManageStaff(user)) return true
  if (permission === 'employees:write') return canManageStaff(user)
  if (role === 'Manager') return !hasStaffScope(user) || Boolean(user?.permissions.includes(permission))
  return role === 'Operations' && attendantPermissions.has(permission) && Boolean(Array.isArray(user?.permissions) && user.permissions.includes(permission))
}
export const hasWorkArea = (user: AuthUser | null | undefined) => { const role = profileRole(user); return role === 'Manager' || role === 'Operations' || role === 'Teacher' }
export function workHome(user: AuthUser | null | undefined) {
  const role = profileRole(user)
  if (hasStaffScope(user)) {
    const path = user?.staffAccess?.homePath
    return path && path.startsWith('/') && !path.startsWith('//') && !/[\\\u0000-\u001f?#]/.test(path) && staffPathAllowed(user, path) ? path : '/conta'
  }
  if (role === 'Manager') return '/'
  if (role === 'Teacher') return '/professor'
  if (hasPermission(user, 'bar:sales:operate')) return '/atendimento/vender'
  return role === 'Operations' ? '/' : '/minha-area'
}

export function barHome(user: AuthUser | null | undefined): string | null {
  if (hasStaffScope(user)) {
    return ['/atendimento/vender','/atendimento/comandas','/atendimento/pedidos','/atendimento/receber','/bar/caixa','/bar/indicadores','/bar/produtos'].find(path => staffPathAllowed(user,path)) ?? null
  }
  const destinations = [
    ['bar:sales:operate', '/atendimento/vender'], ['bar:finance:read', '/bar/indicadores'],
    ['bar:stock:read', '/bar/produtos'], ['bar:supervise', '/bar/caixa'],
    ['bar:catalog:write', '/bar/produtos'], ['bar:sales:read', '/atendimento/comandas'],
    ['bar:cash:operate', '/bar/caixa'], ['bar:purchases:manage', '/bar/compras'],
  ]
  return destinations.find(([permission]) => hasPermission(user, permission))?.[1] ?? null
}
