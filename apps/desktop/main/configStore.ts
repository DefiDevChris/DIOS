/**
 * Persistent config storage for Electron main process.
 * Uses a JSON file in the userData directory for simplicity.
 */

import { app } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { logger } from '@dios/shared'

interface SyncConfig {
  firestoreToken: string
  driveToken: string
  userId: string
  projectId: string
  refreshToken?: string
  apiKey?: string
}

const CONFIG_FILE_NAME = 'sync-config.json'

function getConfigPath(): string {
  return path.join(app.getPath('userData'), CONFIG_FILE_NAME)
}

export async function loadSyncConfig(): Promise<SyncConfig | null> {
  try {
    const configPath = getConfigPath()
    const data = await fs.readFile(configPath, 'utf-8')
    try {
      const config = JSON.parse(data) as SyncConfig
      logger.info('Sync config loaded from disk for user:', config.userId)
      return config
    } catch (parseError) {
      logger.error('Corrupted sync config file, resetting:', parseError)
      return null
    }
  } catch (error) {
    // File doesn't exist or is invalid - return null
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.error('Failed to load sync config:', error)
    }
    return null
  }
}

export async function saveSyncConfig(config: SyncConfig): Promise<void> {
  try {
    const configPath = getConfigPath()
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
    logger.info('Sync config saved to disk for user:', config.userId)
  } catch (error) {
    logger.error('Failed to save sync config:', error)
    throw error
  }
}

export async function deleteSyncConfig(): Promise<void> {
  try {
    const configPath = getConfigPath()
    await fs.unlink(configPath)
    logger.info('Sync config deleted from disk')
  } catch (error) {
    // File doesn't exist - that's fine
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.error('Failed to delete sync config:', error)
      throw error
    }
  }
}
