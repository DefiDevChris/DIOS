import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Operations from './pages/Operations';
import OperationProfile from './pages/OperationProfile';
import InspectionProfile from './pages/InspectionProfile';
import Routing from './pages/Routing';
import NotesTasks from './pages/NotesTasks';
import MobileHub from './pages/MobileHub';
import Schedule from './pages/Schedule';
import Invoices from './pages/Invoices';
import Reports from './pages/Reports';
import Expenses from './pages/Expenses';
import Email from './pages/Email';
import SetupWizard from './components/SetupWizard';
import ReceiptScanner from './components/ReceiptScanner';
import { configStore } from './lib/configStore';
import { useState, useEffect } from 'react';

// Placeholder components for new routes
const Placeholder = ({ title }: { title: string }) => (
  <div className="animate-in fade-in duration-500">
    <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight">{title}</h1>
    <p className="mt-2 text-stone-500 text-sm">This page is under construction.</p>
  </div>
);

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#F9F8F6]">Loading...</div>;
  }
  
  // MOCK FOR DEVELOPMENT
  if (!user && window.location.hostname !== 'localhost') {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

export default function App() {
  const [hasConfig, setHasConfig] = useState(configStore.hasConfig());

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
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/test-scanner"
            element={
              <div className="p-4 bg-stone-100 min-h-screen">
                <ReceiptScanner />
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
            <Route path="inspections" element={<Placeholder title="Inspections" />} />
            <Route path="inspections/:id" element={<InspectionProfile />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="invoices" element={<Placeholder title="Invoices" />} />
            <Route path="expenses" element={<Expenses />} />
            <Route path="schedule" element={<Schedule />} />
            
            <Route path="notes" element={<NotesTasks />} />
            <Route path="email" element={<Email />} />
            <Route path="routing" element={<Routing />} />
            <Route path="reports" element={<Reports />} />
            
            <Route path="insights" element={<Placeholder title="Insights" />} />
            
            <Route path="drive" element={<Placeholder title="Google Drive" />} />
            <Route path="sheets" element={<Placeholder title="Google Sheets" />} />
            
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
