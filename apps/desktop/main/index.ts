import { app, BrowserWindow, ipcMain, net } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { findAll, findById, upsert, remove, closeDatabase } from './database'
import { saveFile, readFile, deleteFile, listFiles, getBaseDir } from './fileStorage'
import { startSync, stopSync, getSyncState, getPendingCount } from './syncEngine'
import { logger } from '@dios/shared'
import { loadSyncConfig, saveSyncConfig, deleteSyncConfig } from './configStore'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null

// Stored sync config loaded from persistent storage
let storedSyncConfig: { firestoreToken: string; driveToken: string; userId: string; projectId: string } | null = null

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
    mainWindow.webContents.openDevTools()
  } else {
    // In production, load the built index.html
    // Try multiple paths for different build scenarios
    const possiblePaths = [
      path.join(__dirname, '../dist/index.html'),       // Current: dist-electron/dist/index.html
      path.join(__dirname, '../../dist/index.html'),    // One level up from dist-electron/main/
      path.join(__dirname, '../../../dist/index.html'), // Two levels up
      path.join(app.getAppPath(), 'dist/index.html'),   // App root
    ]

    let loaded = false
    for (const htmlPath of possiblePaths) {
      try {
        if (fs.existsSync(htmlPath)) {
          mainWindow.loadFile(htmlPath)
          loaded = true
          break
        }
      } catch {
        // Continue to next path
      }
    }

    if (!loaded) {
      console.error('Could not find index.html in any expected location')
      console.error('Tried:', possiblePaths)
      console.error('__dirname:', __dirname)
      console.error('App path:', app.getAppPath())
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
  return data ? data.buffer : null
})
ipcMain.handle('fs:deleteFile', (_event, filePath: string) => deleteFile(filePath))
ipcMain.handle('fs:listFiles', (_event, pathSegments: string[]) =>
  listFiles(pathSegments)
)
ipcMain.handle('fs:getBaseDir', () => getBaseDir())

// Sync IPC handlers
ipcMain.handle('sync:start', async (_event, config) => {
  // Use passed config or fall back to stored config from renderer
  const syncConfig = config ?? storedSyncConfig
  if (!syncConfig) {
    throw new Error('No sync config available. Call setSyncConfig first.')
  }
  await startSync(syncConfig)
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
