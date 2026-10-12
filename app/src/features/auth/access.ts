import type { AuthUser } from './types'
export const isManagement = (user: AuthUser | null | undefined) => Boolean(user?.roles.some(r => ['Owner','Administrator','Manager'].includes(r)))
const barRoles = ['BarOperator','BarSupervisor','StockManager','BarFinance']
const otherStaff = ['Operations','Viewer','Auditor']
export function hasPermission(user: AuthUser | null | undefined, permission: string): boolean {
  if (!user || user.requiresFirstAccess) return false
  if (isManagement(user)) return true
  if (!user.permissions.includes(permission)) return false
  if (user.roles.some(r => otherStaff.includes(r))) return true
  if (permission.startsWith('bar:') && user.roles.some(r => barRoles.includes(r))) {
    if (user.roles.every(r => ['Student','Teacher','BarOperator'].includes(r))) return ['bar:catalog:read','bar:cash:operate','bar:sales:read','bar:sales:operate'].includes(permission)
    return true
  }
  return user.roles.length === 0
}
export const hasWorkArea = (user: AuthUser | null | undefined) => Boolean(user && (isManagement(user) || user.roles.some(r => r === 'Teacher' || barRoles.includes(r) || otherStaff.includes(r))))
export function workHome(user: AuthUser | null | undefined) {
  if (isManagement(user)) return '/'
  if (user?.roles.includes('Teacher')) return '/professor'
  if (hasPermission(user,'bar:sales:operate')) return '/atendimento/vender'
  if (hasPermission(user,'bar:finance:read')) return '/bar/indicadores'
  if (hasPermission(user,'bar:stock:manage')) return '/bar/estoque'
  return hasWorkArea(user) ? '/' : '/minha-area'
}

export function barHome(user: AuthUser | null | undefined): string | null {
  const destinations = [
    ['bar:finance:read', '/bar/indicadores'], ['bar:sales:operate', '/atendimento/vender'],
    ['bar:stock:read', '/bar/estoque'], ['bar:supervise', '/bar/caixa'],
    ['bar:catalog:write', '/bar/produtos'], ['bar:sales:read', '/atendimento/comandas'],
    ['bar:cash:operate', '/atendimento/caixa'], ['bar:purchases:manage', '/bar/compras'],
    ['bar:payments:reconcile', '/bar/conciliacao'],
  ]
  return destinations.find(([permission]) => hasPermission(user, permission))?.[1] ?? null
}
