import { initializeApp, getApps, FirebaseApp } from 'firebase/app'
import { getAuth, Auth } from 'firebase/auth'
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  disableNetwork,
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

  if (!firebaseConfig || !firebaseConfig.apiKey || !firebaseConfig.projectId) {
    logger.info('Firebase not configured — running in local-only mode.')
    return false
  }

  try {
    const apps = getApps()
    const existingApp = apps.find((a) => a.name === '[DEFAULT]')

    app = existingApp ?? initializeApp(firebaseConfig)
    auth = getAuth(app)
    storage = getStorage(app)

    // Try persistent cache first, fall back to memory cache, then getFirestore
    try {
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      })
    } catch {
      try {
        db = initializeFirestore(app, {
          localCache: memoryLocalCache(),
        })
      } catch {
        db = getFirestore(app)
      }
    }

    // If using placeholder credentials, disable network so Firestore
    // operates from local cache only (listeners fire immediately with empty data)
    const placeholderKeys = new Set(['dummy', 'local', 'test'])
    if (placeholderKeys.has(firebaseConfig.apiKey) || placeholderKeys.has(firebaseConfig.projectId)) {
      disableNetwork(db).catch(() => {})
    }

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
