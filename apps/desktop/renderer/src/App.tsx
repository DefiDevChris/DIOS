import { HashRouter, Routes, Route, Navigate } from 'react-router'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { BackgroundSyncProvider } from './contexts/BackgroundSyncContext'
import Layout from './components/Layout'
import { configStore } from '@dios/shared'
import { useState, useEffect, Suspense, lazy } from 'react'
import SetupWizard from './components/SetupWizard'
import ErrorBoundary, { useGlobalErrorHandler } from './components/ErrorBoundary'
import OnboardingWizard from './components/OnboardingWizard'

// Route-level code splitting
const Login = lazy(() => import('./pages/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Settings = lazy(() => import('./pages/Settings'))
const Operations = lazy(() => import('./pages/Operations'))
const OperationProfile = lazy(() => import('./pages/OperationProfile'))
const Inspections = lazy(() => import('./pages/Inspections'))
const InspectionProfile = lazy(() => import('./pages/InspectionProfile'))
const Routing = lazy(() => import('./pages/Routing'))
const NotesTasks = lazy(() => import('./pages/NotesTasks'))
const Schedule = lazy(() => import('./pages/Schedule'))
const Invoices = lazy(() => import('./pages/Invoices'))
const Reports = lazy(() => import('./pages/Reports'))
const Expenses = lazy(() => import('./pages/Expenses'))
const Email = lazy(() => import('./pages/Email'))
const Insights = lazy(() => import('./pages/Insights'))
const Drive = lazy(() => import('./pages/Drive'))
const Sheets = lazy(() => import('./pages/Sheets'))

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [onboardingChecked, setOnboardingChecked] = useState(false)

  useEffect(() => {
    if (!user) return

    // Check localStorage first to avoid repeated Firestore lookups
    if (localStorage.getItem('dios_onboarding_completed') === 'true') {
      setOnboardingChecked(true)
      return
    }

    import('@dios/shared/firebase').then(({ db }) => {
      if (!db) {
        setShowOnboarding(true)
        setOnboardingChecked(true)
        return
      }
      import('firebase/firestore').then(({ doc, getDoc }) => {
        getDoc(doc(db, `users/${user.uid}/system_settings/config`)).then((snap) => {
          if (snap.exists() && snap.data().onboardingCompleted === true) {
            localStorage.setItem('dios_onboarding_completed', 'true')
          } else {
            setShowOnboarding(true)
          }
          setOnboardingChecked(true)
        }).catch(() => {
          setShowOnboarding(true)
          setOnboardingChecked(true)
        })
      })
    }).catch(() => {
      setShowOnboarding(true)
      setOnboardingChecked(true)
    })
  }, [user])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9F8F6]">
        Loading...
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!onboardingChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9F8F6]">
        Loading...
      </div>
    )
  }

  return (
    <>
      {showOnboarding && (
        <OnboardingWizard isOpen={showOnboarding} onComplete={() => setShowOnboarding(false)} />
      )}
      {children}
    </>
  )
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64 text-stone-400">
      Loading...
    </div>
  )
}

export default function App() {
  const [hasConfig, setHasConfig] = useState(configStore.hasConfig())
  const [setupError, setSetupError] = useState(false)
  useGlobalErrorHandler()

  // Bootstrap from .env file if localStorage has no config (fresh launch)
  useEffect(() => {
    if (configStore.hasConfig()) return
    if (!window.electronAPI?.env) return

    window.electronAPI.env.load().then((envVars) => {
      if (!envVars.FIREBASE_API_KEY && !envVars.GOOGLE_OAUTH_CLIENT_ID) return

      const config: import('@dios/shared').AppConfig = {
        firebaseConfig: envVars.FIREBASE_API_KEY
          ? {
              apiKey: envVars.FIREBASE_API_KEY,
              authDomain: envVars.FIREBASE_AUTH_DOMAIN || '',
              projectId: envVars.FIREBASE_PROJECT_ID || '',
              storageBucket: envVars.FIREBASE_STORAGE_BUCKET || '',
              messagingSenderId: envVars.FIREBASE_MESSAGING_SENDER_ID || '',
              appId: envVars.FIREBASE_APP_ID || '',
            }
          : { apiKey: 'local', authDomain: 'local', projectId: 'local', storageBucket: 'local', messagingSenderId: 'local', appId: 'local' },
        ...(envVars.GOOGLE_OAUTH_CLIENT_ID ? { googleOAuthClientId: envVars.GOOGLE_OAUTH_CLIENT_ID } : {}),
      }
      configStore.saveConfig(config)
      setHasConfig(true)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const handleStorageChange = () => {
      setHasConfig(configStore.hasConfig())
    }
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  if (!hasConfig) {
    return (
      <ErrorBoundary>
        <SetupWizard onComplete={() => {
          if (configStore.hasConfig()) {
            window.location.reload()
          } else {
            setSetupError(true)
          }
        }} />
        {setupError && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-red-50 border border-red-200 rounded-2xl px-6 py-4 shadow-lg z-50 flex items-center gap-4 max-w-md">
            <p className="text-sm text-red-700">Setup did not complete. Please try again or check your configuration.</p>
            <button
              onClick={() => { setSetupError(false); window.location.reload() }}
              className="text-sm font-bold text-red-600 hover:text-red-800 whitespace-nowrap"
            >
              Retry
            </button>
          </div>
        )}
      </ErrorBoundary>
    )
  }

  return (
    <AuthProvider>
      <BackgroundSyncProvider>
        <HashRouter>
          <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="operations" element={<Operations />} />
                <Route path="operations/:id" element={<OperationProfile />} />
                <Route path="inspections" element={<Inspections />} />
                <Route path="inspections/:id" element={<InspectionProfile />} />
                <Route path="invoices" element={<Invoices />} />
                <Route path="expenses" element={<Expenses />} />
                <Route path="schedule" element={<Schedule />} />
                <Route path="notes" element={<NotesTasks />} />
                <Route path="email" element={<Email />} />
                <Route path="routing" element={<Routing />} />
                <Route path="reports" element={<Reports />} />
                <Route path="insights" element={<Insights />} />
                <Route path="drive" element={<Drive />} />
                <Route path="sheets" element={<Sheets />} />

                <Route path="settings" element={<Settings />} />
              </Route>
            </Routes>
          </Suspense>
          </ErrorBoundary>
        </HashRouter>
      </BackgroundSyncProvider>
    </AuthProvider>
  )
}
