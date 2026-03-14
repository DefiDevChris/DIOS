import { initializeApp, getApps, FirebaseApp } from 'firebase/app'
import { getAuth, Auth } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  Firestore,
} from 'firebase/firestore'
import { getStorage, FirebaseStorage } from 'firebase/storage'
import { configStore } from './configStore'
import { logger } from './logger'
import type { FirebaseConfig } from './types'

export let app: FirebaseApp | null = null
export let db: Firestore | null = null
export let auth: Auth | null = null
export let storage: FirebaseStorage | null = null
export let isInitialized = false

export function initializeFirebase(config?: FirebaseConfig): boolean {
  const firebaseConfig = config ?? configStore.getConfig()?.firebaseConfig

  if (!firebaseConfig) {
    logger.warn('Cannot initialize Firebase: No config found.')
    return false
  }

  try {
    const apps = getApps()
    const existingApp = apps.find((a) => a.name === '[DEFAULT]')

    app = existingApp ?? initializeApp(firebaseConfig)
    auth = getAuth(app)
    storage = getStorage(app)

    // Use modern persistent cache API (replaces deprecated enableIndexedDbPersistence)
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    })

    isInitialized = true
    return true
  } catch (error) {
    logger.error('Failed to initialize Firebase:', error)
    isInitialized = false
    return false
  }
}

// Auto-initialize if config exists
if (configStore.hasConfig()) {
  initializeFirebase()
}
