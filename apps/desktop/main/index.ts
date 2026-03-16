import { app, BrowserWindow, dialog, ipcMain, net } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { findAll, findById, upsert, remove, closeDatabase } from './database.js'
import { saveFile, readFile, deleteFile, listFiles, getBaseDir } from './fileStorage.js'
import { startSync, stopSync, getSyncState, getPendingCount } from './syncEngine.js'
import { logger } from '@dios/shared'
import { loadSyncConfig, saveSyncConfig, deleteSyncConfig } from './configStore.js'
import { loadEnv, saveEnv, getEnvFilePath } from './envStore.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Prevent EPIPE crashes when stdout/stderr pipe breaks (e.g. terminal closed)
process.stdout?.on?.('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') return
  throw err
})
process.stderr?.on?.('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') return
  throw err
})
process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') return
  console.error('Uncaught exception:', err)
})

let mainWindow: BrowserWindow | null = null

// Stored sync config loaded from persistent storage
let storedSyncConfig: { firestoreToken: string; driveToken: string; userId: string; projectId: string; refreshToken?: string; apiKey?: string } | null = null

/** Refresh the Firestore ID token by asking Firebase REST API to exchange the stored refresh token.
 *  We store the Firebase refresh token alongside the sync config so the main process can refresh independently. */
async function refreshFirestoreToken(refreshToken: string, apiKey: string): Promise<string> {
  const res = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
    }
  )
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`)
  const data = await res.json()
  if (!data.id_token) {
    throw new Error(data.error_description || data.error || 'Token refresh failed — no id_token in response')
  }
  return data.id_token as string
}

// Load config on startup
async function initializeStoredConfig(): Promise<void> {
  try {
    storedSyncConfig = await loadSyncConfig()
  } catch (error) {
    logger.error('Failed to initialize stored config:', error)
    storedSyncConfig = null
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'DIOS Studio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // In development, load from Vite dev server
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000')
  } else {
    // In production, dist/ is always at the app root (electron-builder copies it there)
    const htmlPath = path.join(app.getAppPath(), 'dist', 'index.html')
    if (fs.existsSync(htmlPath)) {
      mainWindow.loadFile(htmlPath)
    } else {
      // Fallback: walk up from __dirname until we find dist/index.html
      let dir = __dirname
      let found = false
      for (let i = 0; i < 5; i++) {
        const candidate = path.join(dir, 'dist', 'index.html')
        if (fs.existsSync(candidate)) {
          mainWindow.loadFile(candidate)
          found = true
          break
        }
        dir = path.dirname(dir)
      }
      if (!found) {
        logger.error('Could not find dist/index.html. App path:', app.getAppPath(), '__dirname:', __dirname)
        mainWindow.loadURL(`data:text/html,<html><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#F9F8F6"><div style="text-align:center"><h1 style="color:#2a2420">DIOS Studio</h1><p style="color:#8b7355">Could not find application files. Please reinstall.</p></div></body></html>`)
      }
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// IPC handlers
ipcMain.handle('app:version', () => app.getVersion())
ipcMain.handle('app:isOnline', () => {
  return net.isOnline()
})

// OAuth popup window for desktop
ipcMain.handle('auth:openOAuthWindow', async (_event: Electron.IpcMainInvokeEvent, authUrl: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const authWindow = new BrowserWindow({
      width: 600,
      height: 700,
      parent: mainWindow ?? undefined,
      modal: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    authWindow.loadURL(authUrl)

    authWindow.webContents.on('will-redirect', (_event, url) => {
      if (url.startsWith('http://localhost') || url.includes('/__/auth/handler')) {
        resolve(url)
        authWindow.close()
      }
    })

    authWindow.on('closed', () => {
      reject(new Error('Auth window was closed'))
    })
  })
})

// Database IPC handlers with error propagation
ipcMain.handle('db:findAll', async (_event, table: string, filters?: Record<string, unknown>) => {
  try {
    return await findAll(table, filters)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Database findAll failed: ${message}`)
  }
})
ipcMain.handle('db:findById', async (_event, table: string, id: string) => {
  try {
    return await findById(table, id)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Database findById failed: ${message}`)
  }
})
ipcMain.handle('db:upsert', async (_event, table: string, record: Record<string, unknown>) => {
  try {
    await upsert(table, record)
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Database upsert failed: ${message}`)
  }
})
ipcMain.handle('db:remove', async (_event, table: string, id: string) => {
  try {
    await remove(table, id)
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Database remove failed: ${message}`)
  }
})

// File storage IPC handlers
ipcMain.handle('fs:saveFile', (_event, pathSegments: string[], fileName: string, data: ArrayBuffer) => {
  const filePath = saveFile(pathSegments, fileName, Buffer.from(data))
  return filePath
})
ipcMain.handle('fs:readFile', (_event, filePath: string) => {
  const data = readFile(filePath)
  if (!data) return null
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
})
ipcMain.handle('fs:deleteFile', (_event, filePath: string) => deleteFile(filePath))
ipcMain.handle('fs:listFiles', (_event, pathSegments: string[]) =>
  listFiles(pathSegments)
)
ipcMain.handle('fs:getBaseDir', () => getBaseDir())
ipcMain.handle('fs:selectFolder', async () => {
  const baseDir = getBaseDir()
  // Ensure the default directory exists so the dialog can navigate to it
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true })
  }
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: 'Choose a folder for DIOS Studio files',
    defaultPath: baseDir,
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

// Sync IPC handlers
ipcMain.handle('sync:start', async (_event, config) => {
  // Use passed config or fall back to stored config from renderer
  const syncConfig = config ?? storedSyncConfig
  if (!syncConfig) {
    throw new Error('No sync config available. Call setSyncConfig first.')
  }
  // Update stored config with the latest tokens from the renderer
  if (config) storedSyncConfig = config

  const refreshToken: string | undefined = (syncConfig as any).refreshToken
  const apiKey: string | undefined = (syncConfig as any).apiKey

  await startSync({
    ...syncConfig,
    getFirestoreToken: (refreshToken && apiKey)
      ? () => refreshFirestoreToken(refreshToken, apiKey)
      : undefined,
  })
  return { success: true }
})

// Config bridge IPC handlers (renderer -> main)
ipcMain.handle('config:setSyncConfig', async (_event, config) => {
  try {
    storedSyncConfig = config
    await saveSyncConfig(config)
    logger.info('Sync config stored for user:', config.userId)
    return { success: true }
  } catch (error) {
    logger.error('Failed to store sync config:', error)
    throw new Error(`Failed to store sync config: ${error instanceof Error ? error.message : String(error)}`)
  }
})

ipcMain.handle('config:getSyncConfig', () => {
  return storedSyncConfig
})

ipcMain.handle('config:clearSyncConfig', async () => {
  try {
    storedSyncConfig = null
    await deleteSyncConfig()
    logger.info('Sync config cleared')
    return { success: true }
  } catch (error) {
    logger.error('Failed to clear sync config:', error)
    throw new Error(`Failed to clear sync config: ${error instanceof Error ? error.message : String(error)}`)
  }
})
// Environment file IPC handlers (.env in userData)
ipcMain.handle('env:load', () => loadEnv())
ipcMain.handle('env:save', (_event, vars: Record<string, string>) => {
  saveEnv(vars)
  return { success: true }
})
ipcMain.handle('env:path', () => getEnvFilePath())

ipcMain.handle('sync:stop', () => {
  stopSync()
  return { success: true }
})
ipcMain.handle('sync:state', () => getSyncState())
ipcMain.handle('sync:pendingCount', () => getPendingCount())

app.on('before-quit', () => {
  closeDatabase()
})

// Initialize config before creating window
app.whenReady().then(async () => {
  await initializeStoredConfig()
  createWindow()

  // Check for updates in production (silently, notify when available)
  if (process.env.NODE_ENV !== 'development') {
    import('electron-updater').then(({ autoUpdater }) => {
      autoUpdater.checkForUpdatesAndNotify().catch((err: Error) => {
        logger.warn('Auto-updater check failed:', err)
      })
    }).catch(() => { /* electron-updater not installed */ })
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
