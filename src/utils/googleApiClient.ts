/**
 * googleApiClient – resilient fetch wrapper for all Google API calls.
 *
 * Features:
 *  • Automatically injects the current Authorization: Bearer <token> header.
 *  • On a 401 Unauthorized response, triggers a silent GIS token refresh
 *    (via AuthContext.refreshGoogleToken) and retries the original request once.
 *  • Keeps localStorage and AuthContext state in sync after every refresh.
 *
 * Usage:
 *   import { googleApiFetch } from '../utils/googleApiClient';
 *   const data = await googleApiFetch('https://gmail.googleapis.com/...', { method: 'GET' });
 */

const TOKEN_STORAGE_KEY = 'googleAccessToken';

// Module-level reference to the refresh function injected by AuthContext.
// This avoids circular imports while still allowing the utility to trigger a token refresh.
let _refreshToken: (() => Promise<string>) | null = null;

/** Called once by AuthProvider to register the refresh callback. */
export function registerTokenRefresher(fn: () => Promise<string>) {
  _refreshToken = fn;
}

/** Read the current token from localStorage (set by AuthContext). */
function getCurrentToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

/**
 * Drop-in replacement for `fetch` when calling Google APIs.
 * Automatically adds Authorization header and handles 401 with silent token refresh + retry.
 */
export async function googleApiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const token = getCurrentToken();

  const headersWithAuth = new Headers(init.headers);
  if (token) {
    headersWithAuth.set('Authorization', `Bearer ${token}`);
  }

  const firstResponse = await fetch(input, { ...init, headers: headersWithAuth });

  // If the response is not 401, return it directly
  if (firstResponse.status !== 401) {
    return firstResponse;
  }

  // 401 – attempt token refresh
  if (!_refreshToken) {
    console.warn('[googleApiClient] 401 received but no token refresher is registered.');
    return firstResponse;
  }

  let freshToken: string;
  try {
    freshToken = await _refreshToken();
  } catch (err) {
    console.error('[googleApiClient] Token refresh failed after 401:', err);
    return firstResponse; // Return the original 401 so callers can handle it
  }

  // Retry with the new token
  const retryHeaders = new Headers(init.headers);
  retryHeaders.set('Authorization', `Bearer ${freshToken}`);
  return fetch(input, { ...init, headers: retryHeaders });
}

/**
 * Convenience helper that calls googleApiFetch and parses JSON.
 * Throws on non-ok responses after the 401-retry logic.
 */
export async function googleApiJson<T = unknown>(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<T> {
  const response = await googleApiFetch(input, init);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Google API error ${response.status}: ${body}`);
  }
  return response.json() as Promise<T>;
}
