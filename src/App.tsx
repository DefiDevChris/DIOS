/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

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
import Reports from './pages/Reports';

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
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
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
            <Route path="inspections" element={<Placeholder title="Inspections" />} />
            <Route path="inspections/:id" element={<InspectionProfile />} />
            <Route path="invoices" element={<Placeholder title="Invoices" />} />
            <Route path="schedule" element={<Placeholder title="Schedule" />} />
            
            <Route path="notes" element={<NotesTasks />} />
            <Route path="email" element={<Placeholder title="Email" />} />
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
