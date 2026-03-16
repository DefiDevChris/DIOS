import type { AppConfig } from './types'
import { CONFIG_KEY, DEFAULT_OAUTH_CLIENT_ID } from './constants'

const hasLocalStorage = typeof localStorage !== 'undefined'

export const configStore = {
  getConfig(): AppConfig | null {
    if (!hasLocalStorage) return null
    const data = localStorage.getItem(CONFIG_KEY)
    return data ? JSON.parse(data) as AppConfig : null
  },

  saveConfig(config: AppConfig): void {
    if (!hasLocalStorage) return
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
  },

  clearConfig(): void {
    if (!hasLocalStorage) return
    localStorage.removeItem(CONFIG_KEY)
  },

  hasConfig(): boolean {
    if (!hasLocalStorage) return false
    return !!localStorage.getItem(CONFIG_KEY)
  },

  getOAuthClientId(): string {
    const userOverride = this.getConfig()?.googleOAuthClientId
    return userOverride || DEFAULT_OAUTH_CLIENT_ID
  },
}
