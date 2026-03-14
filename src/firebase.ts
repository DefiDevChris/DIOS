import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { configStore, AppConfig } from './lib/configStore';

export let app: FirebaseApp | null = null;
export let db: Firestore | null = null;
export let auth: Auth | null = null;
export let storage: FirebaseStorage | null = null;
export let isInitialized = false;

export const initializeFirebase = (config?: AppConfig['firebaseConfig']): boolean => {
  const firebaseConfig = config || configStore.getConfig()?.firebaseConfig;

  if (!firebaseConfig) {
    console.warn('Cannot initialize Firebase: No config found.');
    return false;
  }

  try {
    const apps = getApps();
    const defaultApp = apps.find((a) => a.name === '[DEFAULT]');

    if (!defaultApp) {
      app = initializeApp(firebaseConfig);
    } else {
      app = defaultApp;
    }

    db = getFirestore(app);
    auth = getAuth(app);
    storage = getStorage(app);

    // Attempt to enable offline persistence
    enableIndexedDbPersistence(db).catch((err) => {
      if (err.code === 'failed-precondition') {
        console.warn('Multiple tabs open, persistence can only be enabled in one tab at a time.');
      } else if (err.code === 'unimplemented') {
        console.warn('The current browser does not support all of the features required to enable persistence');
      }
    });

    isInitialized = true;
    return true;
  } catch (error) {
    console.error('Failed to initialize Firebase:', error);
    isInitialized = false;
    return false;
  }
};

// Auto-initialize if config exists
if (configStore.hasConfig()) {
  initializeFirebase();
}
