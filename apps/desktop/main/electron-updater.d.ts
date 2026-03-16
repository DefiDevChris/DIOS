// Minimal type shim for electron-updater so tsc doesn't error when the package
// hasn't been installed yet. The actual module is loaded dynamically at runtime.
declare module 'electron-updater' {
  export const autoUpdater: {
    checkForUpdatesAndNotify(): Promise<unknown>
  }
}
