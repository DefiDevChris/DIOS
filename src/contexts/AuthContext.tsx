import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from 'react';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { auth, isInitialized } from '../firebase';
import { configStore } from '../lib/configStore';
import { registerTokenRefresher } from '../utils/googleApiClient';
/// <reference path="../types/google-gis.d.ts" />

const TOKEN_STORAGE_KEY = 'googleAccessToken';
const TOKEN_EXPIRY_KEY = 'googleAccessTokenExpiry';

// Google API scopes required by the application
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.modify',
].join(' ');

interface AuthContextType {
  user: User | null;
  googleAccessToken: string | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshGoogleToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * AuthProvider wraps the application and provides global state for the
 * current Firebase user and Google OAuth access token. It also manages
 * the lifecycle of the token (refreshing via GIS) and provides methods
 * for signing in and out.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(
    () => localStorage.getItem(TOKEN_STORAGE_KEY)
  );
  const [loading, setLoading] = useState(true);

  // Holds the GIS TokenClient instance once initialized
  const tokenClientRef = useRef<GisTokenClient | null>(null);

  // Pending refresh resolvers – multiple callers waiting for the same refresh share one request
  const pendingRefreshRef = useRef<{
    resolve: (token: string) => void;
    reject: (err: Error) => void;
  }[] | null>(null);

  /** Persist a new access token (and its expiry) to both React state and localStorage */
  const storeToken = useCallback((token: string, expiresInSeconds = 3600) => {
    const expiryTs = Date.now() + expiresInSeconds * 1000 - 60_000; // 60 s safety buffer
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    localStorage.setItem(TOKEN_EXPIRY_KEY, String(expiryTs));
    setGoogleAccessToken(token);
  }, []);

  /** Returns true if the stored token is still valid */
  const isTokenValid = useCallback((): boolean => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    const expiry = Number(localStorage.getItem(TOKEN_EXPIRY_KEY) ?? 0);
    return !!token && Date.now() < expiry;
  }, []);

  /** Initialise (or re-use) the GIS TokenClient for a given OAuth client ID */
  const initTokenClient = useCallback((clientId: string) => {
    const gisOAuth2 = (window.google?.accounts as GisAccounts | undefined)?.oauth2;
    if (!gisOAuth2) return;
    if (tokenClientRef.current) return; // already initialised

    tokenClientRef.current = gisOAuth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_SCOPES,
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
      const clientId = configStore.getConfig()?.googleOAuthClientId;
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
      const interval = setInterval(() => {
        const ready = (window.google?.accounts as GisAccounts | undefined)?.oauth2;
        if (ready) {
          clearInterval(interval);
          tryInit();
        }
      }, 500);
      return () => clearInterval(interval);
    }
  }, [initTokenClient]);

  useEffect(() => {
    if (!isInitialized || !auth) {
      const savedConfig = localStorage.getItem('dois_studio_config');
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        if (parsed.firebaseConfig?.apiKey === 'dummy') {
          console.warn("Local Demo Mode: Bypassing Auth");
          setUser({ uid: 'local-demo-user', email: 'demo@example.com', displayName: 'Demo User' } as User);
          setLoading(false);
          return;
        }
      }
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
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
        provider.addScope('https://www.googleapis.com/auth/drive.file');
        provider.addScope('https://www.googleapis.com/auth/calendar.events');
        provider.addScope('https://www.googleapis.com/auth/gmail.modify');

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
      return localStorage.getItem(TOKEN_STORAGE_KEY);
    }
    try {
      return await refreshGoogleToken();
    } catch {
      return null;
    }
  }, [isTokenValid, refreshGoogleToken]);

  const signInWithGoogle = async () => {
    if (!auth) {
      const savedConfig = localStorage.getItem('dois_studio_config');
      if (savedConfig && JSON.parse(savedConfig).firebaseConfig?.apiKey === 'dummy') {
        setUser({ uid: 'local-demo-user', email: 'demo@example.com', displayName: 'Demo User' } as User);
        return;
      }
      throw new Error('Firebase Auth not initialized');
    }
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/drive.file');
      provider.addScope('https://www.googleapis.com/auth/calendar.events');
      provider.addScope('https://www.googleapis.com/auth/gmail.modify');

      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;

      if (token) {
        storeToken(token);
        // Initialise GIS token client now that we have the user's hint for silent refreshes
        const clientId = configStore.getConfig()?.googleOAuthClientId;
        if (clientId) initTokenClient(clientId);
      }
    } catch (error) {
      console.error("Error signing in with Google", error);
      throw error;
    }
  };

  const signOut = async () => {
    if (!auth) return;
    try {
      await firebaseSignOut(auth);
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(TOKEN_EXPIRY_KEY);
      setGoogleAccessToken(null);
    } catch (error) {
      console.error("Error signing out", error);
      throw error;
    }
  };

  // Register the refresh function with the googleApiClient utility
  useEffect(() => {
    registerTokenRefresher(refreshGoogleToken);
  }, [refreshGoogleToken]);

  // Keep React state in sync with localStorage token (set on load above)
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (storedToken && storedToken !== googleAccessToken) {
      setGoogleAccessToken(storedToken);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const value: AuthContextType = {
    user,
    googleAccessToken,
    loading,
    signInWithGoogle,
    signOut,
    refreshGoogleToken,
  };

  // Expose getValidToken on context for use by googleApiClient
  (value as any)._getValidToken = getValidToken;

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
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
