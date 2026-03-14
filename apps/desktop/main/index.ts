import { app, BrowserWindow, ipcMain, net } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { findAll, findById, upsert, remove, closeDatabase } from './database'
import { saveFile, readFile, deleteFile, listFiles, getBaseDir } from './fileStorage'
import { startSync, stopSync, getSyncState, getPendingCount } from './syncEngine'
import { logger } from '@dios/shared'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null

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
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
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
  try {
    await startSync(config)
    return { success: true }
  } catch (error) {
    logger.error('Sync failed:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
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

app.whenReady().then(createWindow)

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
