import { useState, useEffect, useCallback } from 'react';
import { configStore, OAUTH_SCOPES } from '@dios/shared';
import type { AppConfig } from '@dios/shared';
import {
  Check, HardDrive, Cloud, Database, ArrowRight, ArrowLeft,
  ExternalLink, Clipboard, CircleCheck, CircleAlert,
} from 'lucide-react';
import LeafLogo from './LeafLogo';

/* ------------------------------------------------------------------ */
/*  Progress ring (matches OnboardingWizard style)                    */
/* ------------------------------------------------------------------ */

function ProgressRing({ current, total }: { current: number; total: number }) {
  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (current / total) * circumference;
  return (
    <div className="relative">
      <svg width="100" height="100" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.1))' }}>
        <circle className="ring-bg" cx="50" cy="50" r="45" />
        <circle className="ring-progress" cx="50" cy="50" r="45" style={{ strokeDashoffset: offset }} />
      </svg>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-xs font-bold text-white tracking-widest">
        {current}/{total}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Toggle card                                                       */
/* ------------------------------------------------------------------ */

function ToggleCard({
  icon: Icon,
  title,
  description,
  enabled,
  locked,
  onToggle,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
  enabled: boolean;
  locked?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={locked ? undefined : onToggle}
      className={`w-full rounded-[20px] p-5 text-left transition-all duration-200 border-2 ${
        enabled
          ? 'border-[#d4a574] bg-[rgba(212,165,116,0.06)]'
          : 'border-transparent luxury-folder-card'
      } ${locked ? 'opacity-80 cursor-default' : 'cursor-pointer'}`}
    >
      <div className="flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{
          background: enabled
            ? 'linear-gradient(135deg, #d4a574 0%, #c28a5c 100%)'
            : 'linear-gradient(135deg, #fff 0%, #f5f1ed 100%)',
          border: enabled ? 'none' : '1px solid rgba(212,165,116,0.2)',
          boxShadow: enabled ? '0 2px 8px rgba(212,165,116,0.3)' : '0 2px 4px rgba(0,0,0,0.04)',
        }}>
          <Icon size={20} className={enabled ? 'text-white' : 'text-[#d4a574]'} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-[15px] font-bold text-[#2a2420]">{title}</h4>
          <p className="text-[13px] text-[#9b8b7b] font-medium mt-0.5">{description}</p>
        </div>
        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
          enabled ? 'border-[#d4a574] bg-[#d4a574]' : 'border-[#ccc]'
        }`}>
          {enabled && <Check size={14} className="text-white" strokeWidth={3} />}
        </div>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Main wizard                                                       */
/* ------------------------------------------------------------------ */

export default function SetupWizard({ onComplete }: { onComplete: () => void }) {
  // Slide index
  const [step, setStep] = useState(0);

  // Feature toggles
  const [wantGoogle, setWantGoogle] = useState(false);
  const [wantFirebase, setWantFirebase] = useState(false);

  // Google account state
  const [oauthClientId, setOauthClientId] = useState('');
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [googleConnecting, setGoogleConnecting] = useState(false);
  const [googleError, setGoogleError] = useState('');

  // Firebase config state
  const [fbApiKey, setFbApiKey] = useState('');
  const [fbAuthDomain, setFbAuthDomain] = useState('');
  const [fbProjectId, setFbProjectId] = useState('');
  const [fbStorageBucket, setFbStorageBucket] = useState('');
  const [fbMessagingSenderId, setFbMessagingSenderId] = useState('');
  const [fbAppId, setFbAppId] = useState('');
  const [pasteError, setPasteError] = useState('');
  const [pasteSuccess, setPasteSuccess] = useState(false);

  // Build dynamic slide list
  const slides: string[] = ['welcome', 'choose'];
  if (wantGoogle) slides.push('google');
  if (wantFirebase) slides.push('firebase');
  slides.push('done');

  const totalSlides = slides.length;
  const currentSlide = slides[step] ?? 'welcome';

  // Slide navigation
  const canGoNext = (() => {
    if (currentSlide === 'google') return !!oauthClientId.trim();
    if (currentSlide === 'firebase') return !!(fbApiKey && fbProjectId && fbAuthDomain && fbAppId);
    return true;
  })();

  const handleNext = () => setStep((s) => Math.min(s + 1, totalSlides - 1));
  const handleBack = () => setStep((s) => Math.max(s - 1, 0));

  // Recalculate step if toggles change and current step is beyond new total
  useEffect(() => {
    if (step >= totalSlides) setStep(totalSlides - 1);
  }, [step, totalSlides]);

  /* ---- Google sign-in via GIS SDK ---- */
  const connectGoogle = useCallback(() => {
    if (!oauthClientId.trim()) {
      setGoogleError('Enter your OAuth Client ID above first.');
      return;
    }

    const gisOAuth2 = (window.google?.accounts as GisAccounts | undefined)?.oauth2;
    if (!gisOAuth2) {
      setGoogleError('Google sign-in SDK not loaded. Please refresh and try again.');
      return;
    }

    setGoogleConnecting(true);
    setGoogleError('');

    const client = gisOAuth2.initTokenClient({
      client_id: oauthClientId.trim(),
      scope: OAUTH_SCOPES.join(' '),
      callback: async (response: GisTokenResponse) => {
        setGoogleConnecting(false);
        if (response.error || !response.access_token) {
          setGoogleError(response.error_description || response.error || 'Sign-in failed');
          return;
        }
        setGoogleToken(response.access_token);

        // Store token for AuthContext to pick up after reload
        const expiryTs = Date.now() + response.expires_in * 1000 - 60_000;
        localStorage.setItem('googleAccessToken', response.access_token);
        localStorage.setItem('googleAccessTokenExpiry', String(expiryTs));

        // Fetch user profile
        try {
          const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${response.access_token}` },
          });
          if (res.ok) {
            const profile = await res.json();
            setGoogleEmail(profile.email || null);
          }
        } catch {
          // Not critical — just for display
        }
      },
      error_callback: (error: GisTokenClientError) => {
        setGoogleConnecting(false);
        setGoogleError(error.message || error.type || 'Sign-in failed');
      },
    });

    client.requestAccessToken({ prompt: 'consent' });
  }, [oauthClientId]);

  /* ---- Firebase config paste ---- */
  const handlePasteJson = async () => {
    setPasteError('');
    setPasteSuccess(false);
    try {
      const text = await navigator.clipboard.readText();
      const jsonStr = text.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, '$1');
      const parsed = JSON.parse(jsonStr);
      if (!parsed.apiKey || !parsed.projectId) {
        setPasteError('Missing required fields (apiKey, projectId). Check your config.');
        return;
      }
      if (parsed.apiKey) setFbApiKey(parsed.apiKey);
      if (parsed.authDomain) setFbAuthDomain(parsed.authDomain);
      if (parsed.projectId) setFbProjectId(parsed.projectId);
      if (parsed.storageBucket) setFbStorageBucket(parsed.storageBucket);
      if (parsed.messagingSenderId) setFbMessagingSenderId(parsed.messagingSenderId);
      if (parsed.appId) setFbAppId(parsed.appId);
      setPasteSuccess(true);
    } catch {
      setPasteError('Could not parse clipboard contents. Copy the firebaseConfig object and try again.');
    }
  };

  /* ---- Finish ---- */
  const handleFinish = async () => {
    const firebaseConfig = wantFirebase
      ? {
          apiKey: fbApiKey,
          authDomain: fbAuthDomain,
          projectId: fbProjectId,
          storageBucket: fbStorageBucket,
          messagingSenderId: fbMessagingSenderId,
          appId: fbAppId,
        }
      : {
          apiKey: 'local', authDomain: 'local', projectId: 'local',
          storageBucket: 'local', messagingSenderId: 'local', appId: 'local',
        };

    const config: AppConfig = {
      firebaseConfig,
      ...(wantGoogle && oauthClientId.trim() ? { googleOAuthClientId: oauthClientId.trim() } : {}),
    };
    configStore.saveConfig(config);

    // Persist to .env file in Electron userData for next launch
    if (window.electronAPI?.env) {
      const envVars: Record<string, string> = {};
      if (wantGoogle && oauthClientId.trim()) {
        envVars.GOOGLE_OAUTH_CLIENT_ID = oauthClientId.trim();
      }
      if (wantFirebase) {
        envVars.FIREBASE_API_KEY = fbApiKey;
        envVars.FIREBASE_AUTH_DOMAIN = fbAuthDomain;
        envVars.FIREBASE_PROJECT_ID = fbProjectId;
        envVars.FIREBASE_STORAGE_BUCKET = fbStorageBucket;
        envVars.FIREBASE_MESSAGING_SENDER_ID = fbMessagingSenderId;
        envVars.FIREBASE_APP_ID = fbAppId;
      }
      try {
        await window.electronAPI.env.save(envVars);
      } catch {
        // Non-fatal — localStorage still has the config
      }
    }

    if (!wantFirebase) {
      localStorage.setItem('dios_storage_preference', 'local');
    }
    if (wantGoogle) {
      localStorage.setItem('dios_google_connected', 'true');
    }

    onComplete();
  };

  /* ---- Slide titles & descriptions ---- */
  const slideInfo: Record<string, { title: string[]; description: string }> = {
    welcome: {
      title: ['Welcome to', 'DIOS Studio'],
      description: 'Your personal workspace for organic inspections, invoicing, and field operations.',
    },
    choose: {
      title: ['Set up your', 'workspace'],
      description: 'Choose which features to enable. You can change these later in Settings.',
    },
    google: {
      title: ['Connect your', 'Google Account'],
      description: 'Sign in to enable Google Drive, Sheets, Calendar, and Gmail integration.',
    },
    firebase: {
      title: ['Connect', 'Firebase'],
      description: 'Add a Firebase project for cloud database sync and backup.',
    },
    done: {
      title: ['You\'re all', 'set!'],
      description: 'Your workspace is ready. Click Get Started to begin.',
    },
  };

  const info = slideInfo[currentSlide] ?? slideInfo.welcome;
  const inputClass = 'w-full luxury-input rounded-xl px-4 py-2.5 text-sm font-body outline-none';
  const labelClass = 'block text-[11px] font-bold text-[#a89b8c] uppercase tracking-wider mb-1.5';

  return (
    <div className="fixed inset-0 z-50 luxury-modal-backdrop flex items-center justify-center p-4 sm:p-6 font-body">
      <div className="luxury-card rounded-[40px] w-full max-w-[860px] overflow-hidden grid grid-cols-1 md:grid-cols-[260px_1fr] max-h-[92vh]">

        {/* Brand sidebar */}
        <div className="luxury-sidebar px-8 py-12 flex flex-col items-center text-center border-r border-white/30">
          <div className="luxury-logo-orb w-16 h-16 rounded-full flex items-center justify-center mb-6 relative z-10">
            <LeafLogo size={28} fill="white" className="drop-shadow-md" />
          </div>
          <div className="relative z-10">
            <h1 className="font-serif-display text-3xl font-semibold text-white tracking-wide" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
              DIOS
            </h1>
            <span className="text-[10px] tracking-[0.25em] uppercase text-white/85 font-semibold">
              Studio Setup
            </span>
          </div>
          <div className="mt-auto relative z-10 hidden md:block">
            <ProgressRing current={step + 1} total={totalSlides} />
          </div>
        </div>

        {/* Content */}
        <div className="luxury-content relative flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-10 pt-10 pb-4 shrink-0">
            <h2 className="font-serif-display text-[36px] font-semibold text-[#2a2420] leading-tight tracking-tight mb-2">
              {info.title[0]}<br />{info.title[1]}
            </h2>
            <p className="text-[15px] text-[#8b7355] leading-relaxed font-medium max-w-[90%]">
              {info.description}
            </p>
          </div>

          {/* Slide content */}
          <div className="px-10 pb-6 overflow-y-auto flex-1">

            {/* ── WELCOME ── */}
            {currentSlide === 'welcome' && (
              <div className="flex flex-col items-center justify-center py-8 animate-in fade-in duration-300">
                <div className="luxury-check-orb w-20 h-20 rounded-full flex items-center justify-center mb-6" style={{
                  background: 'linear-gradient(135deg, #d4a574 0%, #c28a5c 100%)',
                  boxShadow: '0 4px 16px rgba(212,165,116,0.3)',
                }}>
                  <LeafLogo size={36} fill="white" className="drop-shadow-md" />
                </div>
                <p className="text-sm text-[#7a6b5a] max-w-sm text-center font-medium leading-relaxed">
                  DIOS Studio helps organic inspectors manage operations, inspections, invoices, and expenses — all in one place.
                </p>
              </div>
            )}

            {/* ── CHOOSE FEATURES ── */}
            {currentSlide === 'choose' && (
              <div className="space-y-3 animate-in fade-in duration-300">
                <ToggleCard
                  icon={HardDrive}
                  title="Local Storage"
                  description="Your data is stored on this device. Works offline, no account needed."
                  enabled={true}
                  locked={true}
                  onToggle={() => {}}
                />
                <ToggleCard
                  icon={Cloud}
                  title="Google Account"
                  description="Google Drive, Sheets, Calendar, and Gmail integration."
                  enabled={wantGoogle}
                  onToggle={() => setWantGoogle((g) => !g)}
                />
                <ToggleCard
                  icon={Database}
                  title="Firebase Project"
                  description="Cloud database sync and backup across devices."
                  enabled={wantFirebase}
                  onToggle={() => setWantFirebase((f) => !f)}
                />
              </div>
            )}

            {/* ── GOOGLE SETUP ── */}
            {currentSlide === 'google' && (
              <div className="space-y-5 animate-in fade-in duration-300">
                {/* Step-by-step guide */}
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-[#d4a574] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                    <div>
                      <p className="text-sm font-semibold text-[#2a2420]">Open Google Cloud Console</p>
                      <a
                        href="https://console.cloud.google.com/apis/credentials"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-[#d4a574] hover:text-[#c28a5c] font-semibold mt-1 transition-colors"
                      >
                        Go to APIs &amp; Credentials <ExternalLink size={14} />
                      </a>
                      <p className="text-[12px] text-[#9b8b7b] mt-1">Create a project if you don't have one, or select an existing one.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-[#d4a574] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                    <div>
                      <p className="text-sm font-semibold text-[#2a2420]">Create an OAuth 2.0 Client ID</p>
                      <p className="text-[12px] text-[#9b8b7b] mt-1">
                        Click <strong>Create Credentials</strong> &rarr; <strong>OAuth client ID</strong>. Choose <strong>Web application</strong> as the type.
                        Add <code className="font-mono text-[#5a4a3a] bg-[rgba(212,165,116,0.08)] px-1 py-0.5 rounded text-[11px]">http://localhost</code> to Authorized JavaScript origins.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-[#d4a574] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                    <div>
                      <p className="text-sm font-semibold text-[#2a2420]">Enable the required APIs</p>
                      <p className="text-[12px] text-[#9b8b7b] mt-1">
                        In <strong>APIs &amp; Services</strong> &rarr; <strong>Library</strong>, enable: Google Drive API, Google Sheets API, Google Calendar API, and Gmail API.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-[#d4a574] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">4</span>
                    <div>
                      <p className="text-sm font-semibold text-[#2a2420]">Paste your Client ID below</p>
                      <p className="text-[12px] text-[#9b8b7b] mt-1">Copy the Client ID from the credentials page (ends in <code className="font-mono text-[#5a4a3a] bg-[rgba(212,165,116,0.08)] px-1 py-0.5 rounded text-[11px]">.apps.googleusercontent.com</code>).</p>
                    </div>
                  </div>
                </div>

                {/* Client ID input */}
                <div>
                  <label className={labelClass}>OAuth Client ID</label>
                  <input
                    type="text"
                    value={oauthClientId}
                    onChange={(e) => setOauthClientId(e.target.value)}
                    placeholder="123456789-abc.apps.googleusercontent.com"
                    className={inputClass}
                  />
                </div>

                {/* Sign-in / connected status */}
                {googleToken ? (
                  <div className="luxury-folder-card rounded-[20px] p-5">
                    <div className="flex items-center gap-4">
                      <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{
                        background: 'linear-gradient(135deg, #34a853 0%, #0f9d58 100%)',
                      }}>
                        <Check size={20} className="text-white" strokeWidth={3} />
                      </div>
                      <div>
                        <h4 className="text-[15px] font-bold text-[#2a2420]">Connected</h4>
                        {googleEmail && <p className="text-[13px] text-[#8b7355] font-medium">{googleEmail}</p>}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <button
                      onClick={connectGoogle}
                      disabled={googleConnecting || !oauthClientId.trim()}
                      className="luxury-btn text-white px-8 py-3.5 rounded-2xl text-[15px] font-bold tracking-wide flex items-center gap-3 border-0 cursor-pointer disabled:opacity-50"
                    >
                      {googleConnecting ? (
                        <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Connecting...</>
                      ) : (
                        <>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                          </svg>
                          Sign in with Google
                        </>
                      )}
                    </button>
                    <p className="text-[11px] text-[#9b8b7b] text-center">Optional — you can sign in later from the app.</p>
                  </div>
                )}

                {googleError && (
                  <div className="flex items-center gap-2 text-sm text-red-600">
                    <CircleAlert size={16} /> {googleError}
                  </div>
                )}
              </div>
            )}

            {/* ── FIREBASE CONFIG ── */}
            {currentSlide === 'firebase' && (
              <div className="space-y-5 animate-in fade-in duration-300">
                {/* Step-by-step guide */}
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-[#d4a574] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                    <div>
                      <p className="text-sm font-semibold text-[#2a2420]">Create a Firebase project</p>
                      <a
                        href="https://console.firebase.google.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-[#d4a574] hover:text-[#c28a5c] font-semibold mt-1 transition-colors"
                      >
                        Open Firebase Console <ExternalLink size={14} />
                      </a>
                      <p className="text-[12px] text-[#9b8b7b] mt-1">Free Spark plan works. Create a new project or use an existing one.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-[#d4a574] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                    <div>
                      <p className="text-sm font-semibold text-[#2a2420]">Add a Web app &amp; enable Firestore</p>
                      <p className="text-[12px] text-[#9b8b7b] mt-1">Go to Project Settings &rarr; Your apps &rarr; Add web app. Then enable Firestore Database.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-[#d4a574] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                    <div>
                      <p className="text-sm font-semibold text-[#2a2420]">Copy your config &amp; paste below</p>
                      <p className="text-[12px] text-[#9b8b7b] mt-1">Copy the <code className="font-mono text-[#5a4a3a] bg-[rgba(212,165,116,0.08)] px-1 py-0.5 rounded text-[11px]">firebaseConfig</code> object from your web app settings.</p>
                    </div>
                  </div>
                </div>

                {/* Paste button */}
                <button
                  onClick={handlePasteJson}
                  className="w-full luxury-folder-card rounded-[16px] p-4 cursor-pointer text-center transition-all hover:border-[#d4a574]"
                >
                  <div className="flex items-center justify-center gap-2">
                    {pasteSuccess ? (
                      <><CircleCheck size={18} className="text-emerald-600" /> <span className="text-sm font-semibold text-emerald-700">Config pasted successfully</span></>
                    ) : (
                      <><Clipboard size={18} className="text-[#d4a574]" /> <span className="text-sm font-semibold text-[#5a4a3a]">Paste firebaseConfig from clipboard</span></>
                    )}
                  </div>
                </button>
                {pasteError && <p className="text-xs text-red-500 -mt-2">{pasteError}</p>}

                {/* Manual fields */}
                <details className="group">
                  <summary className="text-xs font-semibold text-[#a89b8c] cursor-pointer hover:text-[#7a6b5a] transition-colors">
                    Or enter fields manually
                  </summary>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                    {[
                      { label: 'API Key', value: fbApiKey, set: setFbApiKey, placeholder: 'AIzaSy...' },
                      { label: 'Auth Domain', value: fbAuthDomain, set: setFbAuthDomain, placeholder: 'project.firebaseapp.com' },
                      { label: 'Project ID', value: fbProjectId, set: setFbProjectId, placeholder: 'my-project' },
                      { label: 'Storage Bucket', value: fbStorageBucket, set: setFbStorageBucket, placeholder: 'project.appspot.com' },
                      { label: 'Messaging Sender ID', value: fbMessagingSenderId, set: setFbMessagingSenderId, placeholder: '123456789' },
                      { label: 'App ID', value: fbAppId, set: setFbAppId, placeholder: '1:123:web:abc' },
                    ].map(({ label, value, set, placeholder }) => (
                      <div key={label}>
                        <label className={labelClass}>{label}</label>
                        <input
                          type="text"
                          value={value}
                          onChange={(e) => set(e.target.value)}
                          placeholder={placeholder}
                          className={inputClass}
                        />
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            )}

            {/* ── DONE ── */}
            {currentSlide === 'done' && (
              <div className="space-y-4 animate-in fade-in duration-300 py-4">
                <div className="flex flex-col items-center mb-6">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{
                    background: 'linear-gradient(135deg, #34a853 0%, #0f9d58 100%)',
                    boxShadow: '0 4px 12px rgba(52,168,83,0.3)',
                  }}>
                    <Check size={28} className="text-white" strokeWidth={3} />
                  </div>
                </div>

                {/* Summary cards */}
                <div className="space-y-2">
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[rgba(212,165,116,0.06)]">
                    <HardDrive size={18} className="text-[#d4a574] shrink-0" />
                    <span className="text-sm font-medium text-[#2a2420]">Local storage</span>
                    <span className="ml-auto text-xs font-semibold text-emerald-600">Enabled</span>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[rgba(212,165,116,0.06)]">
                    <Cloud size={18} className={wantGoogle ? 'text-[#d4a574] shrink-0' : 'text-[#ccc] shrink-0'} />
                    <span className="text-sm font-medium text-[#2a2420]">Google Account</span>
                    <span className={`ml-auto text-xs font-semibold ${wantGoogle ? 'text-emerald-600' : 'text-[#aaa]'}`}>
                      {wantGoogle ? (googleEmail || 'Configured') : 'Skipped'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[rgba(212,165,116,0.06)]">
                    <Database size={18} className={wantFirebase ? 'text-[#d4a574] shrink-0' : 'text-[#ccc] shrink-0'} />
                    <span className="text-sm font-medium text-[#2a2420]">Firebase</span>
                    <span className={`ml-auto text-xs font-semibold ${wantFirebase ? 'text-emerald-600' : 'text-[#aaa]'}`}>
                      {wantFirebase ? fbProjectId : 'Skipped'}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-[#9b8b7b] text-center pt-2">
                  You can change any of these in <strong>Settings</strong> at any time.
                </p>
              </div>
            )}
          </div>

          {/* Footer navigation */}
          <div className="px-10 py-5 flex justify-between items-center shrink-0" style={{
            borderTop: '1px solid rgba(212, 165, 116, 0.15)',
            background: 'linear-gradient(135deg, rgba(250,248,245,0.5) 0%, rgba(255,255,255,0.5) 100%)',
          }}>
            <div>
              {step > 0 && currentSlide !== 'done' && (
                <button onClick={handleBack} className="luxury-btn-secondary flex items-center gap-1.5 text-sm font-semibold text-[#7a6b5a] px-3 py-2 rounded-xl">
                  <ArrowLeft size={16} /> Back
                </button>
              )}
            </div>
            <div>
              {currentSlide === 'done' ? (
                <button
                  onClick={handleFinish}
                  className="luxury-btn text-white px-8 py-4 rounded-2xl text-[15px] font-bold tracking-wide flex items-center gap-3 border-0 cursor-pointer"
                >
                  <Check size={18} strokeWidth={2.5} />
                  Get Started
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  disabled={!canGoNext}
                  className="luxury-btn text-white px-8 py-4 rounded-2xl text-[15px] font-bold tracking-wide flex items-center gap-3 border-0 cursor-pointer disabled:opacity-50"
                >
                  {currentSlide === 'welcome' ? 'Get Started' : 'Next'} <ArrowRight size={18} strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
