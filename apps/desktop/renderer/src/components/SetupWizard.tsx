import { useState } from 'react';
import { initializeApp, deleteApp, getApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { configStore, logger } from '@dios/shared';
import type { AppConfig } from '@dios/shared';
import { initializeFirebase } from '@dios/shared/firebase';
import { Check, ArrowRight, ArrowLeft, Database, Map, AlertCircle, FolderOpen, Cloud } from 'lucide-react';
import LeafLogo from './LeafLogo';
import { requestLocalFolder } from '../lib/localFsSync';

export default function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [testing, setTesting] = useState(false);

  // Step 1: local folder
  const [localFolderLinked, setLocalFolderLinked] = useState(false);
  const [localFolderName, setLocalFolderName] = useState('');

  // Step 2: optional cloud
  const [wantsDrive, setWantsDrive] = useState(false);

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

  const handlePickFolder = async () => {
    const handle = await requestLocalFolder();
    if (handle) {
      setLocalFolderLinked(true);
      setLocalFolderName(handle.name);
    }
  };

  const handleFinishLocal = () => {
    // Save placeholder config — Firebase runs in offline/local mode
    const localConfig: AppConfig = {
      firebaseConfig: {
        apiKey: 'local',
        authDomain: 'local',
        projectId: 'local',
        storageBucket: 'local',
        messagingSenderId: 'local',
        appId: 'local'
      },
      googleMapsApiKey: ''
    };
    configStore.saveConfig(localConfig);
    localStorage.setItem('dios_storage_preference', 'local');
    onComplete();
  };

  const testAndFinish = async () => {
    setTesting(true);
    setError('');

    try {
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

      configStore.saveConfig(config);
      const initSuccess = initializeFirebase(config.firebaseConfig);

      if (initSuccess) {
        await deleteApp(tempApp);
        localStorage.setItem('dios_storage_preference', 'both');
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

  const inputClass = 'w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all outline-none';
  const labelClass = 'block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2';

  const totalSteps = wantsDrive ? 3 : 1;

  return (
    <div className="min-h-screen bg-[#F9F8F6] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-3xl overflow-hidden shadow-2xl border border-stone-100 flex flex-col">

        {/* Header */}
        <div className="bg-[#D49A6A] text-white p-6 flex flex-col items-center justify-center text-center">
          <div className="mb-3 drop-shadow-md">
            <LeafLogo size={48} fill="white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">DIOS Studio Setup</h1>
          <p className="text-sm mt-2 opacity-90 max-w-md">
            Your data stays on your machine. Cloud sync is optional.
          </p>
          {/* Step indicator */}
          <div className="flex gap-2 mt-4">
            {Array.from({ length: totalSteps }, (_, i) => i + 1).map(s => (
              <div
                key={s}
                className={`w-8 h-1.5 rounded-full transition-colors ${
                  s <= step ? 'bg-white' : 'bg-white/30'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="p-8 flex-1">
          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl flex items-start gap-3 border border-red-100">
              <AlertCircle size={20} className="shrink-0 mt-0.5" />
              <div className="text-sm">{error}</div>
            </div>
          )}

          {/* Step 1: Local Folder + Drive decision */}
          {step === 1 && (
            <div className="animate-in fade-in duration-300 space-y-6">
              <div className="flex items-start gap-4 p-4 bg-stone-50 rounded-2xl border border-stone-100">
                <FolderOpen className="text-[#D49A6A] shrink-0 mt-1" size={24} />
                <div>
                  <h3 className="font-bold text-stone-900 text-lg">Local Storage</h3>
                  <p className="text-sm text-stone-600 mt-1">
                    Pick a folder on your computer where DIOS Studio will save all documents, invoices, and receipts.
                  </p>
                </div>
              </div>

              {/* Folder picker */}
              <div>
                <label className={labelClass}>Save Files To</label>
                <button
                  onClick={handlePickFolder}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-4 text-sm text-left hover:bg-white hover:border-[#D49A6A] transition-all flex items-center gap-3 group"
                >
                  <FolderOpen size={20} className="text-stone-400 group-hover:text-[#D49A6A] transition-colors shrink-0" />
                  {localFolderLinked ? (
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-stone-900 truncate">{localFolderName}</div>
                      <div className="text-xs text-emerald-600 mt-0.5">Folder linked</div>
                    </div>
                  ) : (
                    <span className="text-stone-500">Choose a folder...</span>
                  )}
                  {localFolderLinked && (
                    <span className="text-xs text-stone-400 shrink-0">Change</span>
                  )}
                </button>
              </div>

              {/* Drive toggle */}
              <div className="border-t border-stone-100 pt-6">
                <button
                  onClick={() => setWantsDrive(!wantsDrive)}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all ${
                    wantsDrive
                      ? 'border-[#D49A6A] bg-[#D49A6A]/5'
                      : 'border-stone-200 hover:border-stone-300'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                    wantsDrive ? 'bg-[#D49A6A] text-white' : 'bg-stone-100 text-stone-400'
                  }`}>
                    <Cloud size={20} />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-stone-900 text-sm">Also sync to Google Drive</div>
                    <div className="text-xs text-stone-500 mt-0.5">
                      Back up files to Drive and enable calendar, email, and routing integrations.
                    </div>
                  </div>
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                    wantsDrive ? 'bg-[#D49A6A] border-[#D49A6A]' : 'border-stone-300'
                  }`}>
                    {wantsDrive && <Check size={14} className="text-white" />}
                  </div>
                </button>
              </div>

              <div className="flex justify-end pt-4 border-t border-stone-100">
                {!wantsDrive ? (
                  <button
                    onClick={handleFinishLocal}
                    disabled={!localFolderLinked}
                    className="bg-[#D49A6A] hover:bg-[#c28a5c] text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
                  >
                    <Check size={18} /> Complete Setup
                  </button>
                ) : (
                  <button
                    onClick={() => setStep(2)}
                    disabled={!localFolderLinked}
                    className="bg-stone-900 hover:bg-stone-800 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    Set Up Drive <ArrowRight size={16} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Firebase (only if wantsDrive) */}
          {step === 2 && (
            <div className="animate-in fade-in duration-300 space-y-6">
              <div className="flex items-start gap-4 p-4 bg-stone-50 rounded-2xl border border-stone-100">
                <Database className="text-[#D49A6A] shrink-0 mt-1" size={24} />
                <div>
                  <h3 className="font-bold text-stone-900 text-lg">Firebase Configuration</h3>
                  <p className="text-sm text-stone-600 mt-1">
                    Your Firebase project powers cloud sync, Google Drive, and authentication. All data is siloed under your account.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>API Key</label>
                  <input type="text" name="apiKey" value={config.firebaseConfig.apiKey} onChange={handleFirebaseChange} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Auth Domain</label>
                  <input type="text" name="authDomain" value={config.firebaseConfig.authDomain} onChange={handleFirebaseChange} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Project ID</label>
                  <input type="text" name="projectId" value={config.firebaseConfig.projectId} onChange={handleFirebaseChange} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Storage Bucket</label>
                  <input type="text" name="storageBucket" value={config.firebaseConfig.storageBucket} onChange={handleFirebaseChange} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Messaging Sender ID</label>
                  <input type="text" name="messagingSenderId" value={config.firebaseConfig.messagingSenderId} onChange={handleFirebaseChange} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>App ID</label>
                  <input type="text" name="appId" value={config.firebaseConfig.appId} onChange={handleFirebaseChange} className={inputClass} />
                </div>
              </div>

              <div className="flex justify-between items-center pt-6 border-t border-stone-100">
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2.5 text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors flex items-center gap-2"
                >
                  <ArrowLeft size={16} /> Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!config.firebaseConfig.apiKey || !config.firebaseConfig.projectId}
                  className="bg-stone-900 hover:bg-stone-800 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  Next <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Maps API + Test (only if wantsDrive) */}
          {step === 3 && (
            <div className="animate-in fade-in duration-300 space-y-6">
              <div className="flex items-start gap-4 p-4 bg-stone-50 rounded-2xl border border-stone-100">
                <Map className="text-[#D49A6A] shrink-0 mt-1" size={24} />
                <div>
                  <h3 className="font-bold text-stone-900 text-lg">Google Maps API</h3>
                  <p className="text-sm text-stone-600 mt-1">
                    Enables routing, trip bundling, and mileage calculation.
                  </p>
                </div>
              </div>

              <div>
                <label className={labelClass}>Google Maps API Key</label>
                <input
                  type="text"
                  value={config.googleMapsApiKey}
                  onChange={handleMapsChange}
                  className={inputClass}
                />
              </div>

              <div className="flex justify-between items-center pt-8 border-t border-stone-100">
                <button
                  onClick={() => setStep(2)}
                  className="px-4 py-2.5 text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors flex items-center gap-2"
                >
                  <ArrowLeft size={16} /> Back
                </button>
                <button
                  onClick={testAndFinish}
                  disabled={testing || !config.googleMapsApiKey}
                  className="bg-[#D49A6A] hover:bg-[#c28a5c] text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center gap-2 shadow-sm disabled:opacity-70"
                >
                  {testing ? (
                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Testing...</>
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
