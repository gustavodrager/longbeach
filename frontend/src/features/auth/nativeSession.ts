import type { AuthUser } from './types'

export const MOBILE_CLIENT_HEADER = 'X-LongBeach-Client'
export const MOBILE_CLIENT_VALUE = 'mobile'

export type NativeAuthResponse = {
  accessToken: string
  accessTokenExpiresAtUtc: string
  refreshToken: string
  refreshTokenExpiresAtUtc: string
  user: AuthUser
}

/**
 * Boundary for the future Keychain/Keystore plugin. It deliberately has no
 * browser-storage fallback: refresh tokens must never enter localStorage or
 * sessionStorage.
 */
export interface NativeRefreshTokenStore {
  read(): Promise<string | null>
  write(refreshToken: string): Promise<void>
  clear(): Promise<void>
}

export function mobileRequestHeaders(headers?: HeadersInit) {
  const result = new Headers(headers)
  result.set(MOBILE_CLIENT_HEADER, MOBILE_CLIENT_VALUE)
  return result
}

export async function mobileRefreshBody(store: NativeRefreshTokenStore) {
  const refreshToken = await store.read()
  if (!refreshToken) throw new Error('Sessão móvel indisponível.')
  return JSON.stringify({ refreshToken })
}
