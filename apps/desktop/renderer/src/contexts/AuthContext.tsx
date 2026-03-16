import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from 'react';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { auth, isInitialized } from '@dios/shared/firebase';
import { configStore, registerTokenRefresher, OAUTH_SCOPES, logger } from '@dios/shared';
import { isElectron } from '../utils/isElectron';
/// <reference path="../types/google-gis.d.ts" />

declare global {
  interface Window {
    electronAPI?: {
      platform: string
      getVersion: () => Promise<string>
      isOnline: () => Promise<boolean>
      openOAuthWindow?: (url: string) => Promise<string>
      db?: {
        findAll: (table: string, filters?: Record<string, unknown>) => Promise<unknown[]>
        findById: (table: string, id: string) => Promise<unknown | undefined>
        upsert: (table: string, record: Record<string, unknown>) => Promise<{ success: boolean }>
        remove: (table: string, id: string) => Promise<{ success: boolean }>
      }
      env?: {
        load: () => Promise<Record<string, string>>
        save: (vars: Record<string, string>) => Promise<{ success: boolean }>
        getPath: () => Promise<string>
      }
      fs?: {
        saveFile: (pathSegments: string[], fileName: string, data: ArrayBuffer) => Promise<string>
        readFile: (filePath: string) => Promise<ArrayBuffer | null>
        deleteFile: (filePath: string) => Promise<boolean>
        listFiles: (pathSegments: string[]) => Promise<string[]>
        getBaseDir: () => Promise<string>
        selectFolder: () => Promise<string | null>
      }
      sync?: {
        start: (config?: { firestoreToken: string; driveToken: string; userId: string; projectId: string }) => Promise<{ success: boolean }>
        stop: () => Promise<{ success: boolean }>
        getState: () => Promise<string>
        getPendingCount: () => Promise<number>
      }
      config?: {
        setSyncConfig: (config: { firestoreToken: string; driveToken: string; userId: string; projectId: string; refreshToken?: string; apiKey?: string }) => Promise<{ success: boolean }>
        getSyncConfig: () => Promise<{ firestoreToken: string; driveToken: string; userId: string; projectId: string; refreshToken?: string; apiKey?: string } | null>
        clearSyncConfig: () => Promise<{ success: boolean }>
      }
    }
  }
}

const TOKEN_STORAGE_KEY = 'googleAccessToken';
const TOKEN_EXPIRY_KEY = 'googleAccessTokenExpiry';

const SCOPE_STRING = OAUTH_SCOPES.join(' ');

interface AuthContextType {
  user: User | null;
  googleAccessToken: string | null;
  loading: boolean;
  isLocalUser: boolean;
  gisLoadError: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshGoogleToken: () => Promise<string>;
  _getValidToken?: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Access Firebase internal refresh token (not in public User type) */
function getFirebaseRefreshToken(user: User): string | undefined {
  const u = user as unknown as Record<string, unknown>
  const mgr = u.stsTokenManager as Record<string, unknown> | undefined
  const delegateMgr = (u._delegate as Record<string, unknown> | undefined)?.stsTokenManager as Record<string, unknown> | undefined
  return (mgr?.refreshToken as string | undefined) ?? (delegateMgr?.refreshToken as string | undefined)
}

/**
 * AuthProvider wraps the application and provides global state for the
 * current Firebase user and Google OAuth access token. It also manages
 * the lifecycle of the token (refreshing via GIS) and provides methods
 * for signing in and out.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(
    () => sessionStorage.getItem(TOKEN_STORAGE_KEY)
  );
  const [loading, setLoading] = useState(true);
  const [isLocalUser, setIsLocalUser] = useState(false);
  const [gisLoadError, setGisLoadError] = useState(false);

  // Holds the GIS TokenClient instance once initialized
  const tokenClientRef = useRef<GisTokenClient | null>(null);

  // Pending refresh resolvers – multiple callers waiting for the same refresh share one request
  const pendingRefreshRef = useRef<{
    resolve: (token: string) => void;
    reject: (err: Error) => void;
  }[] | null>(null);

  /** Persist a new access token (and its expiry) to both React state and sessionStorage */
  const storeToken = useCallback((token: string, expiresInSeconds = 3600) => {
    const expiryTs = Date.now() + expiresInSeconds * 1000 - 60_000; // 60 s safety buffer
    sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    sessionStorage.setItem(TOKEN_EXPIRY_KEY, String(expiryTs));
    setGoogleAccessToken(token);
  }, []);

  /** Returns true if the stored token is still valid */
  const isTokenValid = useCallback((): boolean => {
    const token = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    const expiry = Number(sessionStorage.getItem(TOKEN_EXPIRY_KEY) ?? 0);
    return !!token && Date.now() < expiry;
  }, []);

  /** Initialise (or re-use) the GIS TokenClient for a given OAuth client ID */
  const initTokenClient = useCallback((clientId: string) => {
    const gisOAuth2 = (window.google?.accounts as GisAccounts | undefined)?.oauth2;
    if (!gisOAuth2) return;
    if (tokenClientRef.current) return; // already initialised

    tokenClientRef.current = gisOAuth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE_STRING,
      prompt: '', // silent when possible; browser will show picker only if needed
      callback: (response: GisTokenResponse) => {
        const pending = pendingRefreshRef.current;
        pendingRefreshRef.current = null;

        if (response.error || !response.access_token) {
          const err = new Error(response.error_description || response.error || 'Token refresh failed');
          pending?.forEach(({ reject }) => reject(err));
          return;
        }

        storeToken(response.access_token, response.expires_in);
        pending?.forEach(({ resolve }) => resolve(response.access_token));
      },
      error_callback: (error: GisTokenClientError) => {
        const pending = pendingRefreshRef.current;
        pendingRefreshRef.current = null;
        const err = new Error(error.message || error.type || 'GIS token error');
        pending?.forEach(({ reject }) => reject(err));
      },
    });
  }, [storeToken]);

  // Attempt to initialise the token client once the GIS SDK is ready
  useEffect(() => {
    const tryInit = () => {
      const clientId = configStore.getOAuthClientId();
      const gisOAuth2 = (window.google?.accounts as GisAccounts | undefined)?.oauth2;
      if (clientId && gisOAuth2) {
        initTokenClient(clientId);
      }
    };

    // GIS SDK may load asynchronously; poll until it's ready
    const gisOAuth2 = (window.google?.accounts as GisAccounts | undefined)?.oauth2;
    if (gisOAuth2) {
      tryInit();
    } else {
      let attempts = 0;
      const maxAttempts = 20; // 10 seconds timeout (20 * 500ms)
      const interval = setInterval(() => {
        attempts++;
        const ready = (window.google?.accounts as GisAccounts | undefined)?.oauth2;
        if (ready) {
          clearInterval(interval);
          tryInit();
        } else if (attempts >= maxAttempts) {
          // Timeout: stop polling to prevent infinite loop
          clearInterval(interval);
          setGisLoadError(true);
          logger.warn('GIS SDK failed to load within timeout period');
        }
      }, 500);
      return () => clearInterval(interval);
    }
  }, [initTokenClient]);

  useEffect(() => {
    const localUser = { uid: 'local-user', email: 'local@dios.studio', displayName: 'Local User' } as User;

    if (!isInitialized || !auth) {
      setUser(localUser);
      setIsLocalUser(true);
      setLoading(false);
      return;
    }

    let resolved = false;

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      resolved = true;
      const effectiveUser = currentUser ?? localUser;
      setUser(effectiveUser);
      setIsLocalUser(!currentUser);
      setLoading(false);
    });

    // If onAuthStateChanged doesn't fire within 2s (e.g. unreachable auth server),
    // fall back to local user so the app doesn't hang
    const timeout = setTimeout(() => {
      if (!resolved) {
        setUser(localUser);
        setIsLocalUser(true);
        setLoading(false);
      }
    }, 2000);

    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  /**
   * Trigger the GIS TokenClient to obtain a fresh Google OAuth access token.
   * Multiple concurrent callers share a single underlying GIS request.
   * Falls back to a silent Firebase re-sign-in if GIS is unavailable.
   */
  const refreshGoogleToken = useCallback((): Promise<string> => {
    return new Promise<string>((resolve, reject) => {
      // If a refresh is already in-flight, queue behind it
      if (pendingRefreshRef.current) {
        pendingRefreshRef.current.push({ resolve, reject });
        return;
      }

      if (tokenClientRef.current) {
        // Start a new GIS refresh
        pendingRefreshRef.current = [{ resolve, reject }];
        tokenClientRef.current.requestAccessToken({ prompt: '' });
      } else {
        // GIS client not available – fall back to Firebase popup re-auth
        if (!auth) {
          reject(new Error('Auth not initialized'));
          return;
        }
        const provider = new GoogleAuthProvider();
        for (const scope of OAUTH_SCOPES) { provider.addScope(scope) }

        signInWithPopup(auth, provider)
          .then((result) => {
            const credential = GoogleAuthProvider.credentialFromResult(result);
            const token = credential?.accessToken;
            if (token) {
              storeToken(token);
              resolve(token);
            } else {
              reject(new Error('No access token in credential'));
            }
          })
          .catch(reject);
      }
    });
  }, [storeToken]);

  /** Return a valid token, refreshing silently if it has expired */
  const getValidToken = useCallback(async (): Promise<string | null> => {
    if (isTokenValid()) {
      return sessionStorage.getItem(TOKEN_STORAGE_KEY);
    }
    try {
      return await refreshGoogleToken();
    } catch {
      return null;
    }
  }, [isTokenValid, refreshGoogleToken]);

  const signInWithGoogle = async () => {
    if (!auth) {
      // Firebase not available — set local user
      setUser({ uid: 'local-user', email: 'local@dios.studio', displayName: 'Local User' } as User);
      setIsLocalUser(true);
      return;
    }
    try {
      const provider = new GoogleAuthProvider();
      for (const scope of OAUTH_SCOPES) { provider.addScope(scope) }

      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;
      const user = result.user;

      if (token) {
        storeToken(token);
        // Initialise GIS token client now that we have the user's hint for silent refreshes
        const clientId = configStore.getOAuthClientId();
        if (clientId) initTokenClient(clientId);

        // Push config to Electron main process for sync engine
        if (isElectron() && window.electronAPI?.config) {
          try {
            const firestoreToken = await user.getIdToken();
            const appConfig = configStore.getConfig();
            const projectId = appConfig?.firebaseConfig?.projectId;
            const apiKey = appConfig?.firebaseConfig?.apiKey;
            if (projectId) {
              // stsTokenManager is internal Firebase SDK — access refresh token for main process
              const refreshToken = getFirebaseRefreshToken(user);
              await window.electronAPI.config.setSyncConfig({
                firestoreToken,
                driveToken: token,
                userId: user.uid,
                projectId,
                ...(refreshToken && apiKey ? { refreshToken, apiKey } : {}),
              });
              logger.info('Sync config pushed to main process for user:', user.uid);
            }
          } catch (error) {
            logger.error('Failed to set sync config:', error);
          }
        }
      }
    } catch (error) {
      logger.error("Error signing in with Google", error);
      throw error;
    }
  };

  const signOut = async () => {
    if (!auth) return;
    try {
      await firebaseSignOut(auth);
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      sessionStorage.removeItem(TOKEN_EXPIRY_KEY);
      setGoogleAccessToken(null);
      // Clear sync config in Electron main process
      if (isElectron() && window.electronAPI?.config) {
        try {
          await window.electronAPI.config.clearSyncConfig();
        } catch (error) {
          logger.error('Failed to clear sync config:', error);
        }
      }
    } catch (error) {
      logger.error("Error signing out", error);
      throw error;
    }
  };

  // Register the refresh function with the googleApiClient utility
  useEffect(() => {
    registerTokenRefresher(refreshGoogleToken);
  }, [refreshGoogleToken]);

  // Keep React state in sync with sessionStorage token (set on load above)
  useEffect(() => {
    const storedToken = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (storedToken && storedToken !== googleAccessToken) {
      setGoogleAccessToken(storedToken);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const value: AuthContextType = {
    user,
    googleAccessToken,
    loading,
    isLocalUser,
    gisLoadError,
    signInWithGoogle,
    signOut,
    refreshGoogleToken,
    _getValidToken: getValidToken,
  };

  return (
    <AuthContext.Provider value={value}>
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#faf8f5' }}>
          <div style={{ width: 32, height: 32, border: '3px solid rgba(212,165,116,0.2)', borderTopColor: '#d4a574', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      ) : children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
