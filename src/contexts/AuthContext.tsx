import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut as firebaseSignOut, 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { auth, isInitialized } from '../firebase';

interface AuthContextType {
  user: User | null;
  googleAccessToken: string | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isInitialized || !auth) {
      // If Firebase fails to initialize, check if it's the dummy local demo
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
      // Add scopes for Drive, Calendar, and Gmail
      provider.addScope('https://www.googleapis.com/auth/drive.file');
      provider.addScope('https://www.googleapis.com/auth/calendar.events');
      provider.addScope('https://www.googleapis.com/auth/gmail.modify');
      
      const result = await signInWithPopup(auth, provider);
      
      // This gives you a Google Access Token. You can use it to access the Google API.
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;
      
      if (token) {
        setGoogleAccessToken(token);
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
      setGoogleAccessToken(null);
    } catch (error) {
      console.error("Error signing out", error);
      throw error;
    }
  };

  const value = {
    user,
    googleAccessToken,
    loading,
    signInWithGoogle,
    signOut
  };

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
