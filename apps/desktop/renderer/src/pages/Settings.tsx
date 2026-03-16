import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useDatabase } from '../hooks/useDatabase';
import { db } from '@dios/shared/firebase';
import { onSnapshot, doc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { Plus, Shield, FolderSync, Download, Mail, Trash, ChevronDown, HelpCircle, Database, Key, ToggleLeft, ToggleRight, Check } from 'lucide-react';
import { configStore, logger } from '@dios/shared';
import type { Agency } from '@dios/shared';
import { requestLocalFolder, getStoredLocalFolder } from '../lib/localFsSync';
import Swal from 'sweetalert2';
import BusinessProfileTab from '../components/BusinessProfileTab';
import AgencySettingsTab from '../components/AgencySettingsTab';

function GuideAccordion({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-[rgba(212,165,116,0.25)] overflow-hidden" style={{
      background: 'linear-gradient(135deg, rgba(250,248,245,0.9) 0%, rgba(245,241,237,0.9) 100%)',
    }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 px-5 py-3.5 text-left cursor-pointer">
        <HelpCircle size={16} className="text-[#d4a574] shrink-0" />
        <span className="text-sm font-bold text-[#4a4038] tracking-tight flex-1">{title}</span>
        <ChevronDown size={16} className={`text-[#a89b8c] shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`grid transition-all duration-300 ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="px-5 pb-5 pt-1 flex flex-col gap-4 text-sm text-[#5a4e42] leading-relaxed">{children}</div>
        </div>
      </div>
    </div>
  );
}

function GuideStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[11px] font-extrabold text-white mt-0.5" style={{
        background: 'linear-gradient(135deg, #d4a574 0%, #c4915e 100%)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}>{n}</div>
      <div className="flex-1 font-medium">{children}</div>
    </div>
  );
}

function GuideTip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 px-4 py-3 rounded-xl border border-amber-200/60 text-[13px] font-medium text-amber-800" style={{
      background: 'linear-gradient(135deg, rgba(251,191,36,0.08) 0%, rgba(245,158,11,0.05) 100%)',
    }}>
      <span className="shrink-0 mt-px">💡</span>
      <span>{children}</span>
    </div>
  );
}

const NEW_AGENCY_TEMPLATE: Agency = {
  id: 'new',
  name: '',
  billingAddress: '',
  isFlatRate: true,
  flatRateAmount: 0,
  flatRateIncludedHours: 0,
  flatRateOverageRate: 0,
  hourlyRate: 0,
  driveTimeHourlyRate: 0,
  mileageReimbursed: false,
  mileageRate: 0,
  perDiemRate: 0,
  perTypeRatesEnabled: false,
  ratesByType: '{}',
  operationTypes: '["crop","handler"]',
  billingEmail: '',
  billingContactName: '',
  emailTemplateSubject: '{operatorName} Invoice',
  emailTemplateBody: '',
  prepChecklistEnabled: true,
  prepChecklistItems: JSON.stringify([
    'Review previous inspection report',
    'Check organic system plan updates',
    'Verify input materials',
    'Review complaint history',
    'Prepare inspection forms',
    'Confirm appointment',
    'Map route',
    'Charge device',
  ]),
  reportChecklistEnabled: true,
  reportChecklistItems: JSON.stringify([
    'Review organic system plan',
    'Verify buffer zones',
    'Check input materials',
    'Inspect storage areas',
    'Review records & documentation',
    'Photograph key areas',
    'Complete field observations',
    'Verify pest management plan',
    'Check water sources',
    'Sign off with operator',
  ]),
  defaultLineItems: '[]',
  updatedAt: new Date().toISOString(),
  syncStatus: 'pending',
};

export default function Settings() {
  const { user } = useAuth();
  const { findAll, save, remove } = useDatabase<Agency>({ table: 'agencies' });
  const { findAll: findAllOperations } = useDatabase<{ id: string }>({ table: 'operations' });
  const { findAll: findAllInspections } = useDatabase<{ id: string }>({ table: 'inspections' });
  const { findAll: findAllInvoices } = useDatabase<{ id: string }>({ table: 'invoices' });
  const { findAll: findAllExpenses } = useDatabase<{ id: string }>({ table: 'expenses' });
  const { findAll: findAllTasks } = useDatabase<{ id: string }>({ table: 'tasks' });
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('business');

  // Data & Integrations state
  const [localFolderLinked, setLocalFolderLinked] = useState(false);
  const [whitelistedEmails, setWhitelistedEmails] = useState<string[]>([]);
  const [newEmailInput, setNewEmailInput] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);

  useEffect(() => {
    getStoredLocalFolder().then(handle => {
      if (handle) setLocalFolderLinked(true);
    });
  }, []);

  // Keep raw Firestore for whitelistedEmails (user doc, not agencies)
  useEffect(() => {
    if (!user) return;
    const userDocRef = doc(db, `users/${user.uid}`);
    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setWhitelistedEmails(docSnap.data().whitelistedEmails || []);
      } else {
        setWhitelistedEmails([]);
      }
    });
    return () => unsubscribe();
  }, [user]);

  // Use useDatabase hook for agencies
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    findAll()
      .then((data) => {
        setAgencies(data);
        setLoading(false);
      })
      .catch((error) => {
        handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/agencies`);
        setLoading(false);
      });
  }, [user, findAll]);

  const refreshAgencies = async () => {
    try {
      const data = await findAll();
      setAgencies(data);
    } catch {
      // ignore refresh errors
    }
  };

  const handleSaveAgency = async (agency: Agency) => {
    if (!user) return;
    try {
      await save(agency);
      await refreshAgencies();
      Swal.fire({ text: 'Agency saved!', icon: 'success', timer: 1500, showConfirmButton: false });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/agencies/${agency.id}`);
    }
  };

  const handleCreateAgency = async (agency: Agency) => {
    if (!user) return;
    const newId = crypto.randomUUID();
    const newAgency = { ...agency, id: newId };
    try {
      await save(newAgency);
      await refreshAgencies();
      setActiveTab(newId);
      Swal.fire({ text: 'Agency created!', icon: 'success', timer: 1500, showConfirmButton: false });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/agencies/${newId}`);
    }
  };

  const handleDeleteAgency = async (agencyId: string) => {
    if (!user) return;
    try {
      await remove(agencyId);
      await refreshAgencies();
      setActiveTab('business');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/agencies/${agencyId}`);
    }
  };

  const handleLinkLocalFolder = async () => {
    const handle = await requestLocalFolder();
    if (handle) setLocalFolderLinked(true);
  };

  const handleAddWhitelistedEmail = async () => {
    const email = newEmailInput.trim().toLowerCase();
    if (!user || !email || whitelistedEmails.includes(email)) return;
    const userDocRef = doc(db, `users/${user.uid}`);
    try {
      const { setDoc } = await import('firebase/firestore');
      await setDoc(userDocRef, { whitelistedEmails: [...whitelistedEmails, email] }, { merge: true });
      setNewEmailInput('');
    } catch (error) {
      logger.error('Failed to add whitelisted email:', error);
    }
  };

  const handleDeleteWhitelistedEmail = async (email: string) => {
    if (!user) return;
    const userDocRef = doc(db, `users/${user.uid}`);
    try {
      const { setDoc } = await import('firebase/firestore');
      await setDoc(userDocRef, { whitelistedEmails: whitelistedEmails.filter(e => e !== email) }, { merge: true });
    } catch (error) {
      logger.error('Failed to remove whitelisted email:', error);
    }
  };

  const handleDownloadBackup = async () => {
    if (!user) return;
    try {
      setIsBackingUp(true);
      const [agenciesData, operationsData, inspectionsData, invoicesData, expensesData, tasksData] =
        await Promise.all([findAll(), findAllOperations(), findAllInspections(), findAllInvoices(), findAllExpenses(), findAllTasks()]);

      const backupData = {
        agencies: agenciesData,
        operations: operationsData,
        inspections: inspectionsData,
        invoices: invoicesData,
        expenses: expensesData,
        tasks: tasksData,
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `dios_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      logger.error('Failed to download backup:', error);
      Swal.fire({ text: 'Failed to generate backup.', icon: 'error' });
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleClearIntegrations = () => {
    configStore.clearConfig();
    window.location.reload();
  };

  const tabs = [
    { id: 'business', label: 'My Business' },
    ...agencies.map((a) => ({ id: a.id, label: a.name || 'Unnamed Agency' })),
    { id: 'add-agency', label: '+ Add Agency' },
    { id: 'data', label: 'Data & Integrations' },
  ];

  const renderTabContent = () => {
    if (activeTab === 'business') {
      return <BusinessProfileTab />;
    }

    if (activeTab === 'add-agency') {
      return (
        <AgencySettingsTab
          agency={{ ...NEW_AGENCY_TEMPLATE, updatedAt: new Date().toISOString() }}
          onSave={handleCreateAgency}
          onDelete={() => {}}
          isNew
        />
      );
    }

    if (activeTab === 'data') {
      return <DataIntegrationsTab
        localFolderLinked={localFolderLinked}
        onLinkFolder={handleLinkLocalFolder}
        whitelistedEmails={whitelistedEmails}
        newEmailInput={newEmailInput}
        onNewEmailChange={setNewEmailInput}
        onAddEmail={handleAddWhitelistedEmail}
        onDeleteEmail={handleDeleteWhitelistedEmail}
        isBackingUp={isBackingUp}
        onDownloadBackup={handleDownloadBackup}
        showClearConfirm={showClearConfirm}
        onShowClearConfirm={setShowClearConfirm}
        onClearIntegrations={handleClearIntegrations}
      />;
    }

    const agency = agencies.find((a) => a.id === activeTab);
    if (agency) {
      return (
        <AgencySettingsTab
          agency={agency}
          onSave={handleSaveAgency}
          onDelete={handleDeleteAgency}
        />
      );
    }

    return null;
  };

  if (loading) {
    return (
      <div className="animate-in fade-in duration-500 p-8 text-center text-[#8b7355]">
        Loading settings...
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500">
      <div className="mb-6">
        <h1 className="font-serif-display text-[36px] font-semibold text-[#2a2420]">Settings</h1>
        <p className="mt-2 text-[#8b7355] text-sm font-medium">Manage your business profile, agencies, and integrations.</p>
      </div>

      <div className="flex gap-1 border-b border-[rgba(212,165,116,0.15)] mb-6 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap rounded-t-xl transition-colors ${
              activeTab === tab.id
                ? 'bg-gradient-to-r from-[#d4a574] to-[#c9956b] text-white shadow-sm'
                : 'text-[#7a6b5a] hover:text-[#2a2420] hover:bg-[rgba(212,165,116,0.04)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {renderTabContent()}
    </div>
  );
}

interface DataIntegrationsTabProps {
  localFolderLinked: boolean;
  onLinkFolder: () => void;
  whitelistedEmails: string[];
  newEmailInput: string;
  onNewEmailChange: (v: string) => void;
  onAddEmail: () => void;
  onDeleteEmail: (email: string) => void;
  isBackingUp: boolean;
  onDownloadBackup: () => void;
  showClearConfirm: boolean;
  onShowClearConfirm: (v: boolean) => void;
  onClearIntegrations: () => void;
}

function DataIntegrationsTab({
  localFolderLinked,
  onLinkFolder,
  whitelistedEmails,
  newEmailInput,
  onNewEmailChange,
  onAddEmail,
  onDeleteEmail,
  isBackingUp,
  onDownloadBackup,
  showClearConfirm,
  onShowClearConfirm,
  onClearIntegrations,
}: DataIntegrationsTabProps) {
  const existingConfig = configStore.getConfig();

  // Firebase state
  const [firebaseEnabled, setFirebaseEnabled] = useState(
    () => !!(existingConfig?.firebaseConfig?.apiKey && existingConfig.firebaseConfig.apiKey !== 'local')
  );
  const [fbApiKey, setFbApiKey] = useState(() => existingConfig?.firebaseConfig?.apiKey === 'local' ? '' : (existingConfig?.firebaseConfig?.apiKey ?? ''));
  const [fbAuthDomain, setFbAuthDomain] = useState(() => existingConfig?.firebaseConfig?.authDomain ?? '');
  const [fbProjectId, setFbProjectId] = useState(() => existingConfig?.firebaseConfig?.projectId ?? '');
  const [fbStorageBucket, setFbStorageBucket] = useState(() => existingConfig?.firebaseConfig?.storageBucket ?? '');
  const [fbMessagingSenderId, setFbMessagingSenderId] = useState(() => existingConfig?.firebaseConfig?.messagingSenderId ?? '');
  const [fbAppId, setFbAppId] = useState(() => existingConfig?.firebaseConfig?.appId ?? '');

  // OAuth state (override only — built-in default is always available)
  const [oauthClientId, setOauthClientId] = useState(() => existingConfig?.googleOAuthClientId ?? '');

  const handleSaveFirebase = () => {
    const current = configStore.getConfig();
    const updated = {
      ...current,
      firebaseConfig: firebaseEnabled
        ? { apiKey: fbApiKey, authDomain: fbAuthDomain, projectId: fbProjectId, storageBucket: fbStorageBucket, messagingSenderId: fbMessagingSenderId, appId: fbAppId }
        : { apiKey: 'local', authDomain: '', projectId: '', storageBucket: '', messagingSenderId: '', appId: '' },
      googleOAuthClientId: current?.googleOAuthClientId ?? '',
    };
    configStore.saveConfig(updated);
    window.location.reload();
  };

  const handleSaveOAuth = () => {
    const current = configStore.getConfig();
    const updated = {
      ...current,
      firebaseConfig: current?.firebaseConfig ?? { apiKey: 'local', authDomain: '', projectId: '', storageBucket: '', messagingSenderId: '', appId: '' },
      googleOAuthClientId: oauthClientId || '',
    };
    configStore.saveConfig(updated);
    window.location.reload();
  };

  return (
    <div className="space-y-8">
      {/* Cloud Sync (Firebase) */}
      <div className="luxury-card rounded-[24px] overflow-hidden">
        <div className="px-6 py-5 border-b border-[rgba(212,165,116,0.12)] flex items-center gap-3 bg-[rgba(212,165,116,0.04)]">
          <Database className="text-[#d4a574]" size={20} />
          <h2 className="font-serif-display text-xl font-semibold text-[#2a2420] flex-1">Cloud Sync (Firebase)</h2>
          <button
            onClick={() => setFirebaseEnabled(prev => !prev)}
            className="shrink-0 transition-colors"
            title={firebaseEnabled ? 'Disable Cloud Sync' : 'Enable Cloud Sync'}
          >
            {firebaseEnabled
              ? <ToggleRight size={28} className="text-[#d4a574]" />
              : <ToggleLeft size={28} className="text-[#a89b8c]" />}
          </button>
        </div>
        <div className="p-6 space-y-5">
          <p className="text-sm text-[#7a6b5a]">
            Enable cloud backup and real-time sync across devices. Requires your own Firebase project (free tier is plenty).
          </p>

          {firebaseEnabled && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#8b7355] uppercase tracking-wider mb-2 font-body">API Key</label>
                <input value={fbApiKey} onChange={e => setFbApiKey(e.target.value)} placeholder="AIzaSy..." className="w-full luxury-input rounded-2xl px-4 py-3 text-sm font-body outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#8b7355] uppercase tracking-wider mb-2 font-body">Auth Domain</label>
                <input value={fbAuthDomain} onChange={e => setFbAuthDomain(e.target.value)} placeholder="your-project.firebaseapp.com" className="w-full luxury-input rounded-2xl px-4 py-3 text-sm font-body outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#8b7355] uppercase tracking-wider mb-2 font-body">Project ID</label>
                <input value={fbProjectId} onChange={e => setFbProjectId(e.target.value)} placeholder="your-project-id" className="w-full luxury-input rounded-2xl px-4 py-3 text-sm font-body outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#8b7355] uppercase tracking-wider mb-2 font-body">Storage Bucket</label>
                <input value={fbStorageBucket} onChange={e => setFbStorageBucket(e.target.value)} placeholder="your-project.appspot.com" className="w-full luxury-input rounded-2xl px-4 py-3 text-sm font-body outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#8b7355] uppercase tracking-wider mb-2 font-body">Messaging Sender ID</label>
                <input value={fbMessagingSenderId} onChange={e => setFbMessagingSenderId(e.target.value)} placeholder="123456789012" className="w-full luxury-input rounded-2xl px-4 py-3 text-sm font-body outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#8b7355] uppercase tracking-wider mb-2 font-body">App ID</label>
                <input value={fbAppId} onChange={e => setFbAppId(e.target.value)} placeholder="1:123456789012:web:abc123" className="w-full luxury-input rounded-2xl px-4 py-3 text-sm font-body outline-none" />
              </div>
            </div>
          )}

          <GuideAccordion title="Step-by-step: Create a Firebase project (free)">
            <GuideStep n={1}>Go to <strong>console.firebase.google.com</strong> and click &quot;Create a project&quot;</GuideStep>
            <GuideStep n={2}>Name it anything (e.g. <strong>dios-studio</strong>). Disable Google Analytics.</GuideStep>
            <GuideStep n={3}>Click gear icon &rarr; &quot;Project Settings&quot;</GuideStep>
            <GuideStep n={4}>Scroll to &quot;Your apps&quot; &rarr; click web icon (<code>&lt;/&gt;</code>) to register a web app</GuideStep>
            <GuideStep n={5}>Copy the <code>firebaseConfig</code> values into the fields above</GuideStep>
            <GuideStep n={6}>In sidebar: &quot;Build&quot; &rarr; &quot;Authentication&quot; &rarr; &quot;Get started&quot;</GuideStep>
            <GuideStep n={7}>Enable &quot;Anonymous&quot; sign-in (toggle on &rarr; Save)</GuideStep>
            <GuideStep n={8}>Also enable &quot;Google&quot; as a sign-in provider</GuideStep>
            <GuideStep n={9}>&quot;Build&quot; &rarr; &quot;Firestore Database&quot; &rarr; &quot;Create database&quot; &rarr; test mode</GuideStep>
            <GuideStep n={10}>&quot;Build&quot; &rarr; &quot;Storage&quot; &rarr; &quot;Get started&quot; &rarr; test mode</GuideStep>
            <GuideTip>The free Spark plan includes 1 GB Firestore, 5 GB Storage, and 50K daily reads.</GuideTip>
          </GuideAccordion>

          {firebaseEnabled && (
            <button onClick={handleSaveFirebase} className="luxury-btn text-white rounded-xl text-sm font-bold border-0 cursor-pointer px-6 py-2.5">
              Save Firebase Config
            </button>
          )}
        </div>
      </div>

      {/* Google Workspace (OAuth) */}
      <div className="luxury-card rounded-[24px] overflow-hidden">
        <div className="px-6 py-5 border-b border-[rgba(212,165,116,0.12)] flex items-center gap-3 bg-[rgba(212,165,116,0.04)]">
          <Key className="text-[#d4a574]" size={20} />
          <h2 className="font-serif-display text-xl font-semibold text-[#2a2420] flex-1">Google Workspace (OAuth)</h2>
          <span className="text-xs font-bold text-emerald-600 px-2.5 py-1 bg-emerald-50 rounded-full border border-emerald-100">Built-in</span>
        </div>
        <div className="p-6 space-y-5">
          <p className="text-sm text-[#7a6b5a]">
            Gmail, Calendar, Drive, and Sheets work out of the box. Just click &quot;Sign in with Google&quot; to connect your account.
          </p>

          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-emerald-100 text-[13px] font-medium text-emerald-700" style={{
            background: 'linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(5,150,105,0.03) 100%)',
          }}>
            <Check size={16} className="shrink-0" />
            <span>Using built-in DIOS Studio OAuth credentials. No setup needed.</span>
          </div>

          <GuideAccordion title="Advanced: Use your own OAuth Client ID instead">
            <p className="font-medium text-[#5a4e42]">
              If you want to use your own Google Cloud project for OAuth (e.g. for custom branding on the consent screen), you can override the built-in credentials here.
            </p>
            <div>
              <label className="block text-xs font-bold text-[#8b7355] uppercase tracking-wider mb-2 font-body">Custom OAuth Client ID</label>
              <input value={oauthClientId} onChange={e => setOauthClientId(e.target.value)} placeholder="Leave blank to use built-in default" className="w-full luxury-input rounded-2xl px-4 py-3 text-sm font-body outline-none" />
            </div>
            <button onClick={handleSaveOAuth} className="luxury-btn text-white rounded-xl text-sm font-bold border-0 cursor-pointer px-6 py-2.5">
              Save Custom OAuth
            </button>
            <GuideTip>Most users don&apos;t need this. The built-in credentials handle Drive, Gmail, Calendar, and Sheets for all users.</GuideTip>
          </GuideAccordion>
        </div>
      </div>

      {/* Local File Mirroring */}
      <div className="luxury-card rounded-[24px] overflow-hidden">
        <div className="px-6 py-5 border-b border-[rgba(212,165,116,0.12)] flex items-center gap-3 bg-[rgba(212,165,116,0.04)]">
          <FolderSync className="text-[#d4a574]" size={20} />
          <h2 className="font-serif-display text-xl font-semibold text-[#2a2420]">Local File Mirroring</h2>
        </div>
        <div className="p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-[#2a2420]">Link Local Folder</h3>
              <p className="text-sm text-[#7a6b5a] mt-1 max-w-xl">
                Select a folder on your computer to automatically save a copy of all uploaded documents.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {localFolderLinked && (
                <span className="text-sm text-emerald-600 font-medium px-3 py-1 bg-emerald-50 rounded-full border border-emerald-100">
                  Linked Successfully
                </span>
              )}
              <button
                onClick={onLinkFolder}
                className="px-4 py-2 bg-white border border-[rgba(212,165,116,0.15)] text-[#4a4038] rounded-xl text-sm font-medium hover:bg-[rgba(212,165,116,0.04)] transition-colors shrink-0"
              >
                {localFolderLinked ? 'Change Local Folder' : 'Link Local Folder'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Email Settings */}
      <div className="luxury-card rounded-[24px] overflow-hidden">
        <div className="px-6 py-5 border-b border-[rgba(212,165,116,0.12)] flex items-center gap-3 bg-[rgba(212,165,116,0.04)]">
          <Mail className="text-[#d4a574]" size={20} />
          <h2 className="font-serif-display text-xl font-semibold text-[#2a2420]">Email Settings</h2>
        </div>
        <div className="p-6">
          <div className="mb-4">
            <h3 className="text-base font-bold text-[#2a2420]">Whitelisted Email Addresses</h3>
            <p className="text-sm text-[#7a6b5a] mt-1 max-w-xl">
              Add custom email addresses to always include in your Gmail inbox view.
            </p>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <input
              type="email"
              value={newEmailInput}
              onChange={(e) => onNewEmailChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAddEmail(); } }}
              placeholder="contact@example.com"
              className="flex-1 luxury-input rounded-2xl px-4 py-3 text-sm outline-none"
            />
            <button
              onClick={onAddEmail}
              disabled={!newEmailInput.trim()}
              className="luxury-btn text-white rounded-xl text-sm font-bold border-0 cursor-pointer px-4 py-2.5 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={16} /> Add
            </button>
          </div>
          {whitelistedEmails.length === 0 ? (
            <div className="text-sm text-[#a89b8c] py-4 text-center border border-dashed border-[rgba(212,165,116,0.15)] rounded-xl">
              No custom emails added yet.
            </div>
          ) : (
            <div className="space-y-2">
              {whitelistedEmails.map((email) => (
                <div key={email} className="flex items-center justify-between px-4 py-2.5 bg-[rgba(212,165,116,0.04)] border border-[rgba(212,165,116,0.12)] rounded-xl">
                  <span className="text-sm text-[#4a4038] font-medium">{email}</span>
                  <button
                    onClick={() => onDeleteEmail(email)}
                    className="p-1.5 text-[#a89b8c] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Remove"
                  >
                    <Trash size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Data & Integrations */}
      <div className="luxury-card rounded-[24px] overflow-hidden">
        <div className="px-6 py-5 border-b border-[rgba(212,165,116,0.12)] flex items-center gap-3 bg-[rgba(212,165,116,0.04)]">
          <Shield className="text-[#d4a574]" size={20} />
          <h2 className="font-serif-display text-xl font-semibold text-[#2a2420]">Data & Integrations</h2>
        </div>
        <div className="p-6 divide-y divide-[rgba(212,165,116,0.12)]">
          <div className="pb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-[#2a2420]">Local Database Backup</h3>
              <p className="text-sm text-[#7a6b5a] mt-1 max-w-xl">
                Download a complete JSON backup of all your data.
              </p>
            </div>
            <button
              onClick={onDownloadBackup}
              disabled={isBackingUp}
              className="px-4 py-2 bg-[rgba(212,165,116,0.04)] border border-[rgba(212,165,116,0.15)] text-[#4a4038] rounded-xl text-sm font-medium hover:bg-[rgba(212,165,116,0.06)] transition-colors shrink-0 flex items-center gap-2 disabled:opacity-50"
            >
              <Download size={16} />
              {isBackingUp ? 'Generating...' : 'Download JSON Backup'}
            </button>
          </div>

          <div className="pt-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-[#2a2420]">Bring Your Own Backend (BYOB)</h3>
              <p className="text-sm text-[#7a6b5a] mt-1 max-w-xl">
                You are currently connected to your own private Firebase project. Reset here to change API keys.
              </p>
            </div>
            <button
              onClick={() => onShowClearConfirm(true)}
              className="px-4 py-2 bg-white border border-red-200 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50 transition-colors shrink-0"
            >
              Reset Integration Keys
            </button>
          </div>

          {showClearConfirm && (
            <div className="mt-4 p-4 bg-red-50 rounded-xl border border-red-100 animate-in fade-in">
              <p className="text-sm text-red-800 font-medium mb-3">
                Are you sure? This will remove your API keys and return you to the Setup Wizard.
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={onClearIntegrations}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                >
                  Yes, Reset Keys
                </button>
                <button
                  onClick={() => onShowClearConfirm(false)}
                  className="px-4 py-2 bg-white border border-[rgba(212,165,116,0.15)] text-[#7a6b5a] rounded-lg text-sm font-medium hover:bg-[rgba(212,165,116,0.04)] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
