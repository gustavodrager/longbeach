import { hasPermission } from '../auth/access'
import type { AuthUser } from '../auth/types'
import { canUseCustomerScope } from './api'
const operator: AuthUser = { id: 'fixture', name: 'Teste', email: 'test@example.invalid', roles: ['Operations'], permissions: ['bar:sales:operate'] }
it('picker do Bar não exige leitura escolar e não concede diretório nem unificação', () => {
  expect(canUseCustomerScope(operator, 'bar')).toBe(true)
  expect(canUseCustomerScope(operator, 'students')).toBe(false)
  expect(hasPermission(operator, 'customers:read')).toBe(false)
  expect(hasPermission({ ...operator, permissions: ['customers:read', 'customers:write', 'customers:merge'] }, 'customers:read')).toBe(true)
  expect(hasPermission({ ...operator, permissions: ['customers:merge'] }, 'customers:merge')).toBe(false)
  expect(hasPermission({ ...operator, roles: ['Student'], permissions: ['customers:read'] }, 'customers:read')).toBe(false)
})
