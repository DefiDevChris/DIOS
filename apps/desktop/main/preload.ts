import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  // App info
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  isOnline: (): Promise<boolean> => ipcRenderer.invoke('app:isOnline'),

  // Auth
  openOAuthWindow: (url: string): Promise<string> =>
    ipcRenderer.invoke('auth:openOAuthWindow', url),

  // Database
  db: {
    findAll: (table: string, filters?: Record<string, unknown>): Promise<unknown[]> =>
      ipcRenderer.invoke('db:findAll', table, filters),
    findById: (table: string, id: string): Promise<unknown | undefined> =>
      ipcRenderer.invoke('db:findById', table, id),
    upsert: (table: string, record: Record<string, unknown>): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('db:upsert', table, record),
    remove: (table: string, id: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('db:remove', table, id),
  },

  // File storage
  fs: {
    saveFile: (pathSegments: string[], fileName: string, data: ArrayBuffer): Promise<string> =>
      ipcRenderer.invoke('fs:saveFile', pathSegments, fileName, data),
    readFile: (filePath: string): Promise<ArrayBuffer | null> =>
      ipcRenderer.invoke('fs:readFile', filePath),
    deleteFile: (filePath: string): Promise<boolean> =>
      ipcRenderer.invoke('fs:deleteFile', filePath),
    listFiles: (pathSegments: string[]): Promise<string[]> =>
      ipcRenderer.invoke('fs:listFiles', pathSegments),
    getBaseDir: (): Promise<string> =>
      ipcRenderer.invoke('fs:getBaseDir'),
  },

  // Sync engine
  sync: {
    start: (config?: { firestoreToken: string; driveToken: string; userId: string; projectId: string }): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('sync:start', config),
    stop: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('sync:stop'),
    getState: (): Promise<string> =>
      ipcRenderer.invoke('sync:state'),
    getPendingCount: (): Promise<number> =>
      ipcRenderer.invoke('sync:pendingCount'),
  },

  // Config bridge (renderer -> main)
  config: {
    setSyncConfig: (config: { firestoreToken: string; driveToken: string; userId: string; projectId: string }): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('config:setSyncConfig', config),
    getSyncConfig: (): Promise<{ firestoreToken: string; driveToken: string; userId: string; projectId: string } | null> =>
      ipcRenderer.invoke('config:getSyncConfig'),
    clearSyncConfig: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('config:clearSyncConfig'),
  },
})
