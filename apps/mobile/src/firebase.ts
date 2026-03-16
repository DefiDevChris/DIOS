import { initializeApp, getApps, FirebaseApp } from 'firebase/app'
import { getAuth, Auth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const hasConfig = !!firebaseConfig.apiKey

let app: FirebaseApp | null = null
let auth: Auth | null = null

if (hasConfig) {
  const apps = getApps()
  app = apps.find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig)
  auth = getAuth(app)
}

export { app, auth }
