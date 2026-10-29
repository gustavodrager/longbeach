import { loginDestination } from './loginDestination'
import type { AuthUser } from './types'

const user = (role: AuthUser['roles'][number]): AuthUser => ({ id: 'person', name: 'Pessoa', email: 'person@example.invalid', roles: [role], permissions: ['bar:sales:operate'] })
it.each([
  ['Manager', '/'], ['Operations', '/atendimento/vender'], ['Teacher', '/professor'], ['Student', '/minha-area'],
] as const)('mantém a entrada de %s após login vindo do visitante', (role, home) => {
  expect(loginDestination(user(role), undefined)).toBe(home)
  expect(loginDestination(user(role), { pathname: '/' })).toBe(home)
})
it('preserva o contexto de retorno e o fragmento de um QR', () => {
  expect(loginDestination(user('Student'), { pathname: '/cliente', search: '?origem=arena', hash: '#token=synthetic-qr' })).toBe('/cliente?origem=arena#token=synthetic-qr')
  expect(loginDestination(user('Manager'), { pathname: '/agenda', search: '?date=2026-10-29', hash: '#reserva' })).toBe('/agenda?date=2026-10-29#reserva')
})
it.each(['/login', '/visitante', '/primeiro-acesso', '//example.invalid', 'https://example.invalid', '/\\example.invalid'])('ignora retorno inseguro ou circular: %s', pathname => {
  expect(loginDestination(user('Student'), { pathname })).toBe('/minha-area')
})
it('mantém a conclusão do primeiro acesso antes do destino solicitado', () => {
  expect(loginDestination({ ...user('Teacher'), requiresFirstAccess: true }, { pathname: '/professor' })).toBe('/primeiro-acesso')
})
