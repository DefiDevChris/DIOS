/**
 * Manages a .env file in the Electron userData directory for persistent
 * app configuration (OAuth client ID, Firebase config, etc.).
 *
 * File location: {userData}/.env
 *   - macOS: ~/Library/Application Support/DIOS Studio/.env
 *   - Linux: ~/.config/DIOS Studio/.env
 *   - Windows: %APPDATA%/DIOS Studio/.env
 */

import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { logger } from '@dios/shared'

function getEnvPath(): string {
  return path.join(app.getPath('userData'), '.env')
}

/** Parse a .env file into a key-value record. */
function parseEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    result[key] = value
  }
  return result
}

/** Serialize a key-value record into .env format. */
function serializeEnv(vars: Record<string, string>): string {
  const lines = ['# DIOS Studio configuration', '# This file is auto-generated. You can edit it manually if needed.', '']
  for (const [key, value] of Object.entries(vars)) {
    if (value.includes(' ') || value.includes('#') || value.includes('"')) {
      lines.push(`${key}="${value}"`)
    } else {
      lines.push(`${key}=${value}`)
    }
  }
  lines.push('') // trailing newline
  return lines.join('\n')
}

/** Read all variables from the .env file. */
export function loadEnv(): Record<string, string> {
  try {
    const envPath = getEnvPath()
    if (!fs.existsSync(envPath)) return {}
    const content = fs.readFileSync(envPath, 'utf-8')
    return parseEnv(content)
  } catch (error) {
    logger.error('Failed to load .env:', error)
    return {}
  }
}

/** Write variables to the .env file (merges with existing). */
export function saveEnv(vars: Record<string, string>): void {
  try {
    const envPath = getEnvPath()
    const existing = loadEnv()
    const merged = { ...existing, ...vars }
    // Remove keys with empty values
    for (const key of Object.keys(merged)) {
      if (!merged[key]) delete merged[key]
    }
    fs.writeFileSync(envPath, serializeEnv(merged), 'utf-8')
    logger.info('Saved .env to', envPath)
  } catch (error) {
    logger.error('Failed to save .env:', error)
    throw error
  }
}

/** Get a single value from the .env file. */
export function getEnvVar(key: string): string | null {
  const vars = loadEnv()
  return vars[key] ?? null
}

/** Get the path to the .env file (for display to user). */
export function getEnvFilePath(): string {
  return getEnvPath()
}
