import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { BackgroundSyncProvider } from './contexts/BackgroundSyncContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Operations from './pages/Operations';
import OperationProfile from './pages/OperationProfile';
import Inspections from './pages/Inspections';
import InspectionProfile from './pages/InspectionProfile';
import Routing from './pages/Routing';
import NotesTasks from './pages/NotesTasks';
import MobileHub from './pages/MobileHub';
import Schedule from './pages/Schedule';
import Invoices from './pages/Invoices';
import Reports from './pages/Reports';
import Expenses from './pages/Expenses';
import Email from './pages/Email';
import Insights from './pages/Insights';
import Drive from './pages/Drive';
import Sheets from './pages/Sheets';
import SetupWizard from './components/SetupWizard';
import ReceiptScanner from './components/ReceiptScanner';
import { configStore } from './lib/configStore';
import { useState, useEffect } from 'react';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#F9F8F6]">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

/** Banner shown when a new service worker version is waiting to activate. */
function UpdateBanner({ onUpdate }: { onUpdate: () => void }) {
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-stone-900 text-white px-5 py-3 rounded-2xl shadow-xl text-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
      <span>A new version of DIOS Studio is available.</span>
      <button
        onClick={onUpdate}
        className="px-3 py-1.5 bg-[#D49A6A] hover:bg-[#c28a5c] text-white rounded-xl font-medium transition-colors text-xs"
      >
        Update now
      </button>
    </div>
  );
}

export default function App() {
  const [hasConfig, setHasConfig] = useState(configStore.hasConfig());
  const [updateAvailable, setUpdateAvailable] = useState(false);

  // Detect incoming service worker updates
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.ready.then((registration) => {
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setUpdateAvailable(true);
          }
        });
      });
    }).catch(() => {
      // Service worker not available or blocked – ignore
    });
  }, []);

  const handleUpdate = () => {
    navigator.serviceWorker.ready.then((registration) => {
      registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
    });
    window.location.reload();
  };

  useEffect(() => {
    const handleStorageChange = () => {
      setHasConfig(configStore.hasConfig());
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  if (!hasConfig) {
    return <SetupWizard onComplete={() => window.location.reload()} />;
  }

  return (
    <AuthProvider>
      <BackgroundSyncProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/test-scanner"
              element={
                <div className="p-4 bg-stone-100 min-h-screen">
                  <ReceiptScanner onClose={() => {}} onSuccess={() => {}} />
                </div>
              }
            />
            <Route
              path="/mobile-hub"
              element={
                <ProtectedRoute>
                  <MobileHub />
                </ProtectedRoute>
              }
            />
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
        </BrowserRouter>
      </BackgroundSyncProvider>
      {updateAvailable && <UpdateBanner onUpdate={handleUpdate} />}
    </AuthProvider>
  );
}
