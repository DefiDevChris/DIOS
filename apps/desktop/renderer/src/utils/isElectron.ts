/**
 * Utility to detect if running in Electron environment.
 * Checks for the presence of window.electronAPI which is injected by the preload script.
 * 
 * This is the canonical check - individual features (fs, db, sync) should be checked
 * separately after confirming we're in Electron.
 */
export const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

/**
 * Type guard to check if a specific Electron API is available
 */
export function hasElectronFeature(
  feature: 'fs' | 'db' | 'sync'
): boolean {
  if (!isElectron) return false;
  return !!window.electronAPI?.[feature];
}
