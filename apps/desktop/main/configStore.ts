/**
 * Persistent config storage for Electron main process.
 * Sensitive tokens are encrypted via Electron's safeStorage API.
 * Falls back to plaintext if safeStorage is unavailable.
 */

import { app, safeStorage } from 'electron'
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

/** Fields that contain sensitive tokens and should be encrypted at rest. */
const SENSITIVE_FIELDS: (keyof SyncConfig)[] = ['firestoreToken', 'driveToken', 'refreshToken']

const CONFIG_FILE_NAME = 'sync-config.json'

function getConfigPath(): string {
  return path.join(app.getPath('userData'), CONFIG_FILE_NAME)
}

function canEncrypt(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function encryptValue(value: string): string {
  if (!canEncrypt()) return value
  const encrypted = safeStorage.encryptString(value)
  return `enc:${encrypted.toString('base64')}`
}

function decryptValue(value: string): string {
  if (!value.startsWith('enc:')) return value
  if (!canEncrypt()) {
    logger.warn('Encrypted token found but safeStorage unavailable; token cannot be decrypted')
    return ''
  }
  const buf = Buffer.from(value.slice(4), 'base64')
  return safeStorage.decryptString(buf)
}

export async function loadSyncConfig(): Promise<SyncConfig | null> {
  try {
    const configPath = getConfigPath()
    const data = await fs.readFile(configPath, 'utf-8')
    try {
      const raw = JSON.parse(data) as Record<string, string | undefined>

      // Decrypt sensitive fields
      const config: SyncConfig = {
        firestoreToken: decryptValue(raw.firestoreToken || ''),
        driveToken: decryptValue(raw.driveToken || ''),
        userId: raw.userId || '',
        projectId: raw.projectId || '',
        ...(raw.refreshToken ? { refreshToken: decryptValue(raw.refreshToken) } : {}),
        ...(raw.apiKey ? { apiKey: raw.apiKey } : {}),
      }

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

    // Encrypt sensitive fields before writing to disk
    const serializable: Record<string, string | undefined> = {
      userId: config.userId,
      projectId: config.projectId,
      apiKey: config.apiKey,
    }

    for (const field of SENSITIVE_FIELDS) {
      const value = config[field]
      if (value) {
        serializable[field] = encryptValue(value)
      }
    }

    await fs.writeFile(configPath, JSON.stringify(serializable, null, 2), 'utf-8')
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
