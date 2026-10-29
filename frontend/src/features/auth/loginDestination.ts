import { workHome } from './access'
import type { AuthUser } from './types'

/** Return only to an internal destination, keeping reservation and QR context. */
export function loginDestination(user: AuthUser, from: unknown): string {
  if (user.requiresFirstAccess) return '/primeiro-acesso'
  const home = workHome(user)
  if (!from || typeof from !== 'object') return home
  const { pathname, search, hash } = from as { pathname?: unknown; search?: unknown; hash?: unknown }
  if (typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.startsWith('//') || /[\\\u0000-\u001f]/.test(pathname) || ['/login', '/primeiro-acesso', '/visitante'].includes(pathname)) return home
  if (pathname === '/' && home !== '/') return home
  return pathname + (typeof search === 'string' && search.startsWith('?') ? search : '') + (typeof hash === 'string' && hash.startsWith('#') ? hash : '')
}
