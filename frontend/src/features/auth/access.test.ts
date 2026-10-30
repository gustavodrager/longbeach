import { barHome, hasPermission, hasWorkArea, isManagement, profileLabel, profileRole, workHome } from './access'
import type { AuthUser } from './types'

const identity = (roles: string[], permissions: string[] = []): AuthUser => ({ id: 'profile-test', name: 'Pessoa de teste', email: 'profile@example.invalid', roles: roles as AuthUser['roles'], permissions })

it('apresenta os quatro perfis e suas entradas de trabalho', () => {
  for (const [role, label, home] of [['Manager', 'Gestor', '/'], ['Teacher', 'Professor', '/professor'], ['Operations', 'Atendente', '/atendimento/vender'], ['Student', 'Cliente', '/minha-area']]) {
    const user = identity([role], ['bar:sales:operate'])
    expect(profileLabel(user)).toBe(label)
    expect(workHome(user)).toBe(home)
    expect(hasWorkArea(user)).toBe(role !== 'Student')
  }
})

it('gestor acessa todas as funções e atendente fica dentro do teto operacional', () => {
  const operational = ['customers:read', 'customers:write', 'students:read', 'students:write', 'employees:read', 'inventory:read', 'inventory:write', 'projects:read', 'projects:write', 'bar:catalog:read', 'bar:stock:read', 'bar:stock:output', 'bar:cash:operate', 'bar:sales:read', 'bar:sales:operate']
  const protectedPermissions = ['finance:read', 'finance:write', 'users:manage', 'audit:read', 'customers:merge', 'inventory:adjust', 'employees:write', 'bar:finance:read', 'bar:catalog:write', 'bar:purchases:manage', 'bar:stock:manage', 'bar:supervise', 'bar:refund:approve', 'fiscal:invoices:manage']
  const attendant = identity(['Operations'], [...operational, ...protectedPermissions])
  for (const permission of operational) expect(hasPermission(attendant, permission)).toBe(true)
  for (const permission of protectedPermissions) expect(hasPermission(attendant, permission)).toBe(false)
  for (const permission of [...operational, ...protectedPermissions]) expect(hasPermission(identity(['Manager']), permission)).toBe(true)
  expect(hasPermission(identity(['Operations']), 'students:write')).toBe(false)
})

it.each(['Teacher', 'Student'])('%s não recupera funções internas com claims antigas', role => {
  const user = identity([role], ['students:write', 'finance:read', 'bar:sales:operate', 'users:manage'])
  expect(user.permissions.some(permission => hasPermission(user, permission))).toBe(false)
  expect(barHome(user)).toBeNull()
})

it.each([[], ['Owner'], ['Administrator'], ['BarOperator'], ['BarSupervisor'], ['StockManager'], ['BarFinance'], ['Viewer'], ['Auditor'], ['Custom'], ['Manager', 'Teacher'], ['Operations', 'Student'], ['Manager', 'Manager']].map(roles => ({ roles })))('bloqueia perfil inválido ou acumulado: $roles', ({ roles }) => {
  const user = identity(roles, ['users:manage', 'bar:sales:operate'])
  expect(profileRole(user)).toBeNull()
  expect(isManagement(user)).toBe(false)
  expect(hasWorkArea(user)).toBe(false)
  expect(hasPermission(user, 'users:manage')).toBe(false)
  expect(hasPermission(user, 'bar:sales:operate')).toBe(false)
  expect(barHome(user)).toBeNull()
})

it('não libera funções antes do primeiro acesso', () => {
  const user = { ...identity(['Manager']), requiresFirstAccess: true }
  expect(profileRole(user)).toBeNull()
  expect(hasPermission(user, 'users:manage')).toBe(false)
})
