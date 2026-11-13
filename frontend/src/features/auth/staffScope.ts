import type { AuthUser } from './types'

export const hasStaffScope = (user: AuthUser | null | undefined) => Boolean(user?.staffAccess)
export const canManageStaff = (user: AuthUser | null | undefined) => Boolean(user && !user.requiresFirstAccess && user.roles.length === 1 && user.roles[0] === 'Manager' && user.canManageStaff === true)
const validScope = (user: AuthUser | null | undefined) => Boolean(user && user.staffAccess && !user.requiresFirstAccess && Array.isArray(user.roles) && user.roles.length === 1 && user.staffAccess.role === user.roles[0] && Array.isArray(user.staffAccess.menus) && Array.isArray(user.staffAccess.actions))
export function hasStaffMenu(user: AuthUser | null | undefined, menu: string) {
  return !hasStaffScope(user) || validScope(user) && user!.staffAccess!.menus.includes(menu)
}
export function hasStaffAction(user: AuthUser | null | undefined, action: string) {
  return !hasStaffScope(user) || validScope(user) && user!.staffAccess!.actions.includes(action)
}

// Most specific routes come first. Unknown internal routes are closed for managed staff.
const paths: [string, string][] = [
  ['/atendimento/vender', 'bar.sell'], ['/atendimento/pedidos', 'bar.orders'],
  ['/atendimento/receber', 'bar.receive'], ['/atendimento/pagamento-online', 'bar.receive'],
  ['/atendimento/comprovante', 'bar.receive'], ['/atendimento/comandas', 'bar.tabs'],
  ['/atendimento/caixa', 'bar.cash'], ['/bar/caixa', 'bar.cash'],
  ['/bar/indicadores', 'reports'], ['/bar/registros', 'reports'], ['/bar/conciliacao', 'finance'],
  ['/bar/vendas', 'bar.tabs'], ['/bar/notas-recebidas', 'stock'], ['/bar', 'stock'],
  ['/professor/presencas', 'teaching.attendance'], ['/professor/turmas', 'teaching.classes'], ['/professor', 'teaching.today'],
  ['/whatsapp/automacao', 'messaging.automation'], ['/whatsapp/envios', 'messaging.sends'], ['/whatsapp', 'messaging'],
  ['/solicitacoes-clientes', 'agenda.requests'], ['/agenda/funcionamento', 'agenda.settings'], ['/quadras', 'agenda.settings'], ['/agenda', 'agenda'],
  ['/clientes', 'customers'], ['/mensalistas', 'recurring'], ['/escola/matriculas', 'enrollments'], ['/escola/presencas', 'presences'], ['/escola', 'classes'], ['/alunos', 'students'],
  ['/administracao/materiais', 'materials'], ['/estoque', 'materials'], ['/projetos', 'projects'], ['/manutencao', 'maintenance'],
  ['/financeiro/historico', 'reports'], ['/financeiro', 'finance'], ['/recebimentos', 'finance'], ['/notas-recebidas', 'stock'],
  ['/importacoes', 'administration'], ['/equipe', 'administration'], ['/', 'overview'],
]
const matches = (path: string, prefix: string) => path === prefix || prefix !== '/' && path.startsWith(prefix + '/')
export function staffMenuForPath(pathname: string): string | null {
  return paths.find(([prefix]) => matches(pathname, prefix))?.[1] ?? null
}
export function staffPathAllowed(user: AuthUser | null | undefined, pathname: string): boolean {
  if (matches(pathname, '/administracao/professores')) return canManageStaff(user)
  if (!hasStaffScope(user)) return true
  if (!validScope(user)) return false
  if (pathname === '/conta' || pathname === '/professor/conta') return true
  if (canManageStaff(user) && matches(pathname, '/equipe')) return true
  if (matches(pathname,'/notas-recebidas') || matches(pathname,'/bar/notas-recebidas')) return hasStaffMenu(user,'stock') && hasStaffAction(user,'stock.fiscal')
  if (pathname === '/bar') return user!.staffAccess!.menus.some(menu => menu.startsWith('bar.') || menu === 'stock' || menu === 'reports')
  if (matches(pathname, '/atendimento/comprovante')) return hasStaffMenu(user,'bar.tabs') || hasStaffMenu(user,'bar.receive')
  if (/^\/professor\/turmas\/[^/]+\/?$/.test(pathname)) return hasStaffMenu(user,'teaching.classes') || hasStaffMenu(user,'teaching.attendance')
  const menu = staffMenuForPath(pathname)
  if (!menu || !hasStaffMenu(user, menu)) return false
  // These pages perform an operation rather than offering a separate read-only view.
  return !['bar.sell', 'bar.orders', 'bar.receive', 'bar.cash'].includes(menu) || hasStaffAction(user, menu)
}

const kinds: Record<string, string> = { students:'students',team:'administration',inventory:'materials',projects:'projects',courts:'agenda.settings',reservations:'agenda',classes:'classes',enrollments:'enrollments',presences:'presences',financeEntries:'finance',rentalGroups:'recurring',rentalMonths:'recurring',rentalAttendances:'recurring',maintenance:'maintenance' }
const dependencies: Record<string, string[]> = {
  team:['classes','enrollments','presences','agenda','recurring'], students:['classes','enrollments','presences'],
  classes:['enrollments','presences','agenda'], courts:['classes','enrollments','agenda','recurring'], enrollments:['classes','presences'], reservations:['classes','recurring'],
}
export function staffKindAllowed(user: AuthUser | null | undefined, kind: string, write = false) {
  if (kind === 'team' && write) return canManageStaff(user)
  if (!hasStaffScope(user)) return true
  if (kind === 'team' && canManageStaff(user)) return true
  if (['students','enrollments','presences'].includes(kind) && hasStaffMenu(user, 'classes') && (!write || hasStaffAction(user, 'classes.operate'))) return true
  const menu = kinds[kind]
  return Boolean(menu && hasStaffMenu(user, menu) && (!write || hasStaffAction(user, menu + '.operate')))
}
export function staffKindCanLoad(user: AuthUser | null | undefined, kind: string) {
  return staffKindAllowed(user, kind) || Boolean(dependencies[kind]?.some(menu => hasStaffMenu(user, menu)))
}
export function staffScopeKey(user: AuthUser | null | undefined) {
  return user ? JSON.stringify([user.id, [...user.roles].sort(), [...user.permissions].sort(), Boolean(user.requiresFirstAccess), Boolean(user.canManageStaff), user.staffAccess ? [user.staffAccess.typeId, user.staffAccess.role, [...user.staffAccess.menus].sort(), [...user.staffAccess.actions].sort(), user.staffAccess.homePath] : null]) : 'signed-out'
}
