import { logger } from './logger'
import { TOKEN_KEY } from './constants'

type TokenRefresher = () => Promise<string>
let _refreshToken: TokenRefresher | null = null

export function registerTokenRefresher(fn: TokenRefresher): void {
  _refreshToken = fn
}

export async function googleApiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const token = localStorage.getItem(TOKEN_KEY)
  const headers = new Headers(init?.headers)
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(input, { ...init, headers })

  if (response.status === 401 && _refreshToken) {
    try {
      const newToken = await _refreshToken()
      localStorage.setItem(TOKEN_KEY, newToken)
      headers.set('Authorization', `Bearer ${newToken}`)
      return fetch(input, { ...init, headers })
    } catch (err) {
      logger.error('Token refresh failed during 401 retry', err)
    }
  } else if (response.status === 401) {
    logger.warn('401 received but no token refresher registered')
  }

  return response
}

export async function googleApiJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const res = await googleApiFetch(input, init)
  if (!res.ok) {
    throw new Error(`Google API error: ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}
