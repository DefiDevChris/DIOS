import { app, BrowserWindow, dialog, ipcMain, net, shell } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import http from 'http'
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
let localServer: http.Server | null = null

/** Serve the production renderer from a local HTTP server so Firebase OAuth
 *  works (signInWithPopup requires an http:// origin, not file://). */
function startLocalServer(staticDir: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.map': 'application/json',
    }

    const server = http.createServer((req, res) => {
      const urlPath = (req.url ?? '/').split('?')[0]
      let filePath = path.join(staticDir, urlPath === '/' ? 'index.html' : urlPath)

      // SPA fallback — serve index.html for any route that isn't a real file
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(staticDir, 'index.html')
      }

      const ext = path.extname(filePath)
      const contentType = mimeTypes[ext] || 'application/octet-stream'

      try {
        const content = fs.readFileSync(filePath)
        res.writeHead(200, { 'Content-Type': contentType })
        res.end(content)
      } catch {
        res.writeHead(404)
        res.end('Not Found')
      }
    })

    server.listen(17839, '127.0.0.1', () => {
      const addr = server.address()
      if (addr && typeof addr === 'object') {
        resolve(addr.port)
      } else {
        reject(new Error('Failed to start local server'))
      }
    })

    server.on('error', reject)
    localServer = server
  })
}

// Stored sync config loaded from persistent storage
let storedSyncConfig: { firestoreToken: string; driveToken: string; userId: string; projectId: string; refreshToken?: string; apiKey?: string } | null = null

/** Refresh the Firestore ID token by asking Firebase REST API to exchange the stored refresh token.
 *  We store the Firebase refresh token alongside the sync config so the main process can refresh independently. */
async function refreshFirestoreToken(refreshToken: string, apiKey: string): Promise<string> {
  const MAX_ATTEMPTS = 3
  const BACKOFF_MS = [1000, 3000]
  let lastError: Error | null = null

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(
        `https://securetoken.googleapis.com/v1/token?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
        }
      )
      if (!res.ok) {
        // Don't retry client errors (except 429 rate limit)
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          throw new Error(`Token refresh failed: ${res.status}`)
        }
        lastError = new Error(`Token refresh failed: ${res.status}`)
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise(r => setTimeout(r, BACKOFF_MS[attempt]))
          continue
        }
        throw lastError
      }
      const data = await res.json()
      if (!data.id_token) {
        throw new Error(data.error_description || data.error || 'Token refresh failed — no id_token in response')
      }
      return data.id_token as string
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      // Non-retryable errors (4xx) are already thrown above; only retry on network errors
      if (attempt < MAX_ATTEMPTS - 1) {
        logger.warn(`Token refresh attempt ${attempt + 1} failed, retrying:`, lastError.message)
        await new Promise(r => setTimeout(r, BACKOFF_MS[attempt]))
      }
    }
  }
  throw lastError ?? new Error('Token refresh failed after retries')
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

async function createWindow(): Promise<void> {
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
    // In production, serve via local HTTP server so Firebase OAuth works
    // (signInWithPopup requires http:// origin, file:// is rejected by Google)
    let distDir = path.join(app.getAppPath(), 'dist')
    if (!fs.existsSync(path.join(distDir, 'index.html'))) {
      // Fallback: walk up from __dirname until we find dist/index.html
      let dir = __dirname
      for (let i = 0; i < 5; i++) {
        if (fs.existsSync(path.join(dir, 'dist', 'index.html'))) {
          distDir = path.join(dir, 'dist')
          break
        }
        dir = path.dirname(dir)
      }
    }

    if (fs.existsSync(path.join(distDir, 'index.html'))) {
      try {
        const port = await startLocalServer(distDir)
        mainWindow.loadURL(`http://localhost:${port}`)
      } catch (error) {
        logger.error('Local server failed, falling back to file://', error)
        mainWindow.loadFile(path.join(distDir, 'index.html'))
      }
    } else {
      logger.error('Could not find dist/index.html. App path:', app.getAppPath(), '__dirname:', __dirname)
      mainWindow.loadURL(`data:text/html,<html><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#F9F8F6"><div style="text-align:center"><h1 style="color:#2a2420">DIOS Studio</h1><p style="color:#8b7355">Could not find application files. Please reinstall.</p></div></body></html>`)
    }
  }

  // Open external URLs (window.open / target="_blank") in the system browser,
  // but allow Firebase/Google auth popups to open as Electron windows
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (
      url.startsWith('http://localhost') ||
      url.includes('accounts.google.com') ||
      url.includes('firebaseapp.com/__/auth') ||
      url.includes('googleapis.com/identitytoolkit')
    ) {
      return { action: 'allow' }
    }
    shell.openExternal(url)
    return { action: 'deny' }
  })

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
    let resolved = false

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

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        authWindow.close()
        reject(new Error('OAuth timed out after 5 minutes'))
      }
    }, 5 * 60 * 1000)

    const tryResolve = (url: string): void => {
      if (resolved) return
      if (url.startsWith('http://localhost') || url.includes('/__/auth/handler')) {
        resolved = true
        clearTimeout(timeout)
        resolve(url)
        authWindow.close()
      }
    }

    authWindow.loadURL(authUrl)

    authWindow.webContents.on('will-redirect', (_event, url) => {
      tryResolve(url)
    })

    authWindow.webContents.on('will-navigate', (_event, url) => {
      tryResolve(url)
    })

    authWindow.on('closed', () => {
      clearTimeout(timeout)
      if (!resolved) {
        resolved = true
        reject(new Error('Auth window was closed'))
      }
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

// Google Places Autocomplete IPC handlers (proxied through main to avoid CORS)
ipcMain.handle('places:autocomplete', async (_event, input: string) => {
  const env = loadEnv()
  const apiKey = env.GOOGLE_MAPS_API_KEY
  if (!apiKey || !input.trim()) return []
  try {
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&types=address|establishment&components=country:us&key=${apiKey}`
    const resp = await net.fetch(url)
    const data = await resp.json()
    if (data.status === 'OK' && data.predictions) {
      return data.predictions.map((p: any) => ({
        placeId: p.place_id,
        description: p.description,
      }))
    }
    return []
  } catch (err) {
    logger.error('Places autocomplete error:', err)
    return []
  }
})

ipcMain.handle('places:details', async (_event, placeId: string) => {
  const env = loadEnv()
  const apiKey = env.GOOGLE_MAPS_API_KEY
  if (!apiKey || !placeId) return null
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=formatted_address,geometry,address_components&key=${apiKey}`
    const resp = await net.fetch(url)
    const data = await resp.json()
    if (data.status === 'OK' && data.result) {
      const components = data.result.address_components || []
      const get = (type: string) => components.find((c: any) => c.types.includes(type))
      const streetNumber = get('street_number')?.long_name || ''
      const route = get('route')?.long_name || ''
      const streetAddress = [streetNumber, route].filter(Boolean).join(' ')
      return {
        address: streetAddress || data.result.formatted_address,
        city: get('locality')?.long_name || get('sublocality')?.long_name || get('administrative_area_level_2')?.long_name || '',
        state: get('administrative_area_level_1')?.short_name || '',
        zipCode: get('postal_code')?.long_name || '',
        lat: data.result.geometry?.location?.lat,
        lng: data.result.geometry?.location?.lng,
      }
    }
    return null
  } catch (err) {
    logger.error('Places details error:', err)
    return null
  }
})

app.on('before-quit', () => {
  closeDatabase()
  localServer?.close()
})

// Initialize config before creating window
app.whenReady().then(async () => {
  await initializeStoredConfig()
  createWindow()

  // Check for updates in production (silently, notify when available)
  if (process.env.NODE_ENV !== 'development') {
    import('electron-updater').then((mod) => {
      const updater = mod.autoUpdater as any
      updater.autoDownload = false
      updater.on('update-available', (info: { version: string }) => {
        mainWindow?.webContents.send('updater:status', { status: 'available', version: info.version })
      })
      updater.on('update-downloaded', (info: { version: string }) => {
        mainWindow?.webContents.send('updater:status', { status: 'downloaded', version: info.version })
      })
      updater.checkForUpdates().catch((err: Error) => {
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
