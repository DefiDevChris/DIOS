import { createContext, useContext, useEffect, useRef, useState, ReactNode, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { startBackgroundSync, stopBackgroundSync, getQueueSize, processQueue } from '../lib/syncQueue';
import { processSheetQueue, getSheetQueueSize } from '../lib/sheetsSyncQueue';
import { isElectron } from '../utils/isElectron';
import { logger } from '@dios/shared';

interface BackgroundSyncContextType {
  /** Number of items waiting in the offline queue */
  queueSize: number;
  /** Number of sheet writes pending */
  sheetQueueSize: number;
  /** Whether the device is currently online */
  isOnline: boolean;
  /** Manually trigger queue processing */
  triggerSync: () => void;
}

const BackgroundSyncContext = createContext<BackgroundSyncContextType | undefined>(undefined);

export function BackgroundSyncProvider({ children }: { children: ReactNode }) {
  const { googleAccessToken } = useAuth();
  const [queueSize, setQueueSize] = useState(0);
  const [sheetQueueSize, setSheetQueueSize] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const tokenRef = useRef(googleAccessToken);

  // Keep token ref current so the background sync callback always has the latest
  useEffect(() => {
    tokenRef.current = googleAccessToken;
  }, [googleAccessToken]);

  // Start/stop background sync based on auth state
  // In Electron, sync is handled by the main process sync engine.
  useEffect(() => {
    if (isElectron()) {
      if (googleAccessToken && window.electronAPI?.sync) {
        // Config is set by AuthContext.signInWithGoogle before this fires.
        // On app restart, config is loaded from disk in main process initializeStoredConfig.
        // Add a small delay to ensure setSyncConfig IPC has completed before starting.
        const timer = setTimeout(() => {
          window.electronAPI!.sync!.start().catch((err: Error) => {
            logger.error('Failed to start Electron sync:', err);
          });
        }, 500);
        return () => clearTimeout(timer);
      } else if (!googleAccessToken && window.electronAPI?.sync) {
        window.electronAPI.sync.stop().catch((err: Error) => {
          logger.error('Failed to stop Electron sync:', err);
        });
      }
      return;
    }
    if (!googleAccessToken) {
      stopBackgroundSync();
      return;
    }

    startBackgroundSync(() => tokenRef.current);

    return () => {
      stopBackgroundSync();
    };
  }, [googleAccessToken]);

  // Track online/offline status (works in both Electron and browser)
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // In Electron, also poll via IPC as a fallback
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    if (isElectron() && window.electronAPI?.isOnline) {
      pollTimer = setInterval(() => {
        window.electronAPI!.isOnline().then(setIsOnline).catch(() => {});
      }, 30_000);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (pollTimer) clearInterval(pollTimer);
    };
  }, []);

  // Periodically refresh queue size for UI
  useEffect(() => {
    const refresh = async () => {
      try {
        const size = await getQueueSize();
        setQueueSize(size);
        const sheetsSize = await getSheetQueueSize();
        setSheetQueueSize(sheetsSize);
      } catch {
        // IndexedDB may not be available in some contexts
      }
    };

    refresh();
    const timer = setInterval(refresh, 5_000);
    return () => clearInterval(timer);
  }, []);

  const triggerSync = useCallback(() => {
    if (googleAccessToken) {
      processQueue(googleAccessToken);
      processSheetQueue().catch((err) => {
        logger.error('Sheet queue processing failed:', err);
      });
    }
  }, [googleAccessToken]);

  return (
    <BackgroundSyncContext.Provider value={{ queueSize, sheetQueueSize, isOnline, triggerSync }}>
      {children}
    </BackgroundSyncContext.Provider>
  );
}

export function useBackgroundSync() {
  const context = useContext(BackgroundSyncContext);
  if (context === undefined) {
    throw new Error('useBackgroundSync must be used within a BackgroundSyncProvider');
  }
  return context;
}
