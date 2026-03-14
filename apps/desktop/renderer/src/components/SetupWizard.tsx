import { useState } from 'react';
import { initializeApp, deleteApp, getApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { configStore, logger } from '@dios/shared';
import type { AppConfig } from '@dios/shared';
import { initializeFirebase } from '@dios/shared/firebase';
import { Check, ArrowRight, Database, Map, AlertCircle } from 'lucide-react';
import LeafLogo from './LeafLogo';

export default function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [testing, setTesting] = useState(false);

  const [config, setConfig] = useState<AppConfig>({
    firebaseConfig: {
      apiKey: '',
      authDomain: '',
      projectId: '',
      storageBucket: '',
      messagingSenderId: '',
      appId: ''
    },
    googleMapsApiKey: ''
  });

  const handleFirebaseChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfig({
      ...config,
      firebaseConfig: {
        ...config.firebaseConfig,
        [e.target.name]: e.target.value
      }
    });
  };

  const handleMapsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfig({
      ...config,
      googleMapsApiKey: e.target.value
    });
  };

  const testConnection = async () => {
    setTesting(true);
    setError('');

    try {
      // Create a temporary app instance to test
      let tempApp;
      try {
        tempApp = initializeApp(config.firebaseConfig, 'test-app');
      } catch (e: any) {
        if (e.code === 'app/duplicate-app') {
           tempApp = getApp('test-app');
        } else {
           throw e;
        }
      }

      const tempAuth = getAuth(tempApp);
      await signInAnonymously(tempAuth);

      // If successful, save config and initialize the main app
      configStore.saveConfig(config);
      const initSuccess = initializeFirebase(config.firebaseConfig);

      if (initSuccess) {
        await deleteApp(tempApp);
        onComplete();
      } else {
        throw new Error('Failed to initialize main application instance.');
      }

    } catch (err: any) {
      logger.error('Connection test failed:', err);
      setError(err.message || 'Failed to connect. Please check your credentials and make sure Anonymous Authentication is enabled in Firebase.');
    } finally {
      setTesting(false);
    }
  };

  const skipSetup = () => {
    // Generate some dummy config to bypass the setup block and let the UI load for local dev / testing
    const dummyConfig: AppConfig = {
      firebaseConfig: {
        apiKey: "dummy",
        authDomain: "dummy",
        projectId: "dummy",
        storageBucket: "dummy",
        messagingSenderId: "dummy",
        appId: "dummy"
      },
      googleMapsApiKey: "dummy"
    };
    configStore.saveConfig(dummyConfig);
    onComplete();
  };

  return (
    <div className="min-h-screen bg-[#F9F8F6] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-3xl overflow-hidden shadow-2xl border border-stone-100 flex flex-col">

        {/* Header */}
        <div className="bg-[#D49A6A] text-white p-6 flex flex-col items-center justify-center text-center">
          <div className="mb-3 drop-shadow-md">
            <LeafLogo size={48} fill="white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">DOIS Studio Setup</h1>
          <p className="text-sm mt-2 opacity-90 max-w-md">
            Bring Your Own Backend (BYOB). Configure your private cloud environment to secure your data.
          </p>
        </div>

        {/* Content Area */}
        <div className="p-8 flex-1">
          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl flex items-start gap-3 border border-red-100">
              <AlertCircle size={20} className="shrink-0 mt-0.5" />
              <div className="text-sm">{error}</div>
            </div>
          )}

          {step === 1 && (
            <div className="animate-in fade-in duration-300 space-y-6">
              <div className="flex items-start gap-4 p-4 bg-stone-50 rounded-2xl border border-stone-100">
                <Database className="text-[#D49A6A] shrink-0 mt-1" size={24} />
                <div>
                  <h3 className="font-bold text-stone-900 text-lg">1. Firebase Configuration</h3>
                  <p className="text-sm text-stone-600 mt-1">
                    DOIS Studio is a local-first application. You need to provide your own Firebase project credentials to store your operation data securely. All data will be siloed under your account.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">API Key</label>
                    <input type="text" name="apiKey" value={config.firebaseConfig.apiKey} onChange={handleFirebaseChange} className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Auth Domain</label>
                    <input type="text" name="authDomain" value={config.firebaseConfig.authDomain} onChange={handleFirebaseChange} className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Project ID</label>
                    <input type="text" name="projectId" value={config.firebaseConfig.projectId} onChange={handleFirebaseChange} className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Storage Bucket</label>
                    <input type="text" name="storageBucket" value={config.firebaseConfig.storageBucket} onChange={handleFirebaseChange} className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Messaging Sender ID</label>
                    <input type="text" name="messagingSenderId" value={config.firebaseConfig.messagingSenderId} onChange={handleFirebaseChange} className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">App ID</label>
                    <input type="text" name="appId" value={config.firebaseConfig.appId} onChange={handleFirebaseChange} className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all" />
                  </div>
                </div>
              </div>

              <div className="flex justify-between pt-4 border-t border-stone-100">
                <button
                  onClick={skipSetup}
                  className="px-4 py-2.5 text-sm font-medium text-stone-500 hover:text-stone-700 transition-colors"
                >
                  Skip for Now (Local Demo)
                </button>
                <button
                  onClick={() => setStep(2)}
                  disabled={!config.firebaseConfig.apiKey || !config.firebaseConfig.projectId}
                  className="bg-stone-900 hover:bg-stone-800 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  Next Step <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="animate-in fade-in duration-300 space-y-6">
              <div className="flex items-start gap-4 p-4 bg-stone-50 rounded-2xl border border-stone-100">
                <Map className="text-[#D49A6A] shrink-0 mt-1" size={24} />
                <div>
                  <h3 className="font-bold text-stone-900 text-lg">2. Google Maps API</h3>
                  <p className="text-sm text-stone-600 mt-1">
                    Required for dynamic routing, trip bundling, and mileage calculation. Ensure your key has access to the Maps JavaScript API and Directions API.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Google Maps API Key</label>
                <input
                  type="text"
                  value={config.googleMapsApiKey}
                  onChange={handleMapsChange}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                />
              </div>

              <div className="flex justify-between items-center pt-8 border-t border-stone-100">
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2.5 text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={testConnection}
                  disabled={testing || !config.googleMapsApiKey}
                  className="bg-[#D49A6A] hover:bg-[#c28a5c] text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center gap-2 shadow-sm disabled:opacity-70"
                >
                  {testing ? (
                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Testing Connection...</>
                  ) : (
                    <><Check size={18} /> Test & Complete Setup</>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
