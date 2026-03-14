import { HashRouter, Routes, Route, Navigate } from 'react-router'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { BackgroundSyncProvider } from './contexts/BackgroundSyncContext'
import Layout from './components/Layout'
import { configStore } from '@dios/shared'
import { useState, useEffect, Suspense, lazy } from 'react'
import SetupWizard from './components/SetupWizard'
import ErrorBoundary from './components/ErrorBoundary'

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

  return <>{children}</>
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

  useEffect(() => {
    const handleStorageChange = () => {
      setHasConfig(configStore.hasConfig())
    }
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  if (!hasConfig) {
    return <SetupWizard onComplete={() => window.location.reload()} />
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
