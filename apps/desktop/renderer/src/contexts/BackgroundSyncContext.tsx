import { createContext, useContext, useEffect, useRef, useState, ReactNode, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { startBackgroundSync, stopBackgroundSync, getQueueSize, processQueue } from '../lib/syncQueue';
import { isElectron } from '../utils/isElectron';

interface BackgroundSyncContextType {
  /** Number of items waiting in the offline queue */
  queueSize: number;
  /** Whether the device is currently online */
  isOnline: boolean;
  /** Manually trigger queue processing */
  triggerSync: () => void;
}

const BackgroundSyncContext = createContext<BackgroundSyncContextType | undefined>(undefined);

export function BackgroundSyncProvider({ children }: { children: ReactNode }) {
  const { googleAccessToken } = useAuth();
  const [queueSize, setQueueSize] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const tokenRef = useRef(googleAccessToken);

  // Keep token ref current so the background sync callback always has the latest
  useEffect(() => {
    tokenRef.current = googleAccessToken;
  }, [googleAccessToken]);

  // Start/stop background sync based on auth state
  // In Electron, sync is handled by the main process sync engine.
  useEffect(() => {
    if (isElectron) return;
    if (!googleAccessToken) {
      stopBackgroundSync();
      return;
    }

    startBackgroundSync(() => tokenRef.current);

    return () => {
      stopBackgroundSync();
    };
  }, [googleAccessToken]);

  // Track online/offline status
  useEffect(() => {
    if (isElectron) return;
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Periodically refresh queue size for UI
  useEffect(() => {
    const refresh = async () => {
      try {
        const size = await getQueueSize();
        setQueueSize(size);
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
    }
  }, [googleAccessToken]);

  return (
    <BackgroundSyncContext.Provider value={{ queueSize, isOnline, triggerSync }}>
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
