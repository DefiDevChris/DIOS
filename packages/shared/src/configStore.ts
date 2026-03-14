import type { AppConfig } from './types'
import { CONFIG_KEY } from './constants'

export const configStore = {
  getConfig(): AppConfig | null {
    const data = localStorage.getItem(CONFIG_KEY)
    return data ? JSON.parse(data) as AppConfig : null
  },

  saveConfig(config: AppConfig): void {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
  },

  clearConfig(): void {
    localStorage.removeItem(CONFIG_KEY)
  },

  hasConfig(): boolean {
    return !!localStorage.getItem(CONFIG_KEY)
  },
}
