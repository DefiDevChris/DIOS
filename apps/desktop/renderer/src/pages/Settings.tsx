import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '@dios/shared/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { Plus, Shield, FolderSync, Download, Mail, Trash } from 'lucide-react';
import { configStore, logger } from '@dios/shared';
import type { Agency } from '@dios/shared';
import { requestLocalFolder, getStoredLocalFolder } from '../lib/localFsSync';
import Swal from 'sweetalert2';
import BusinessProfileTab from '../components/BusinessProfileTab';
import AgencySettingsTab from '../components/AgencySettingsTab';

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
  prepChecklistItems: '["Prep complete"]',
  reportChecklistEnabled: true,
  reportChecklistItems: '["Report complete"]',
  defaultLineItems: '[]',
  updatedAt: new Date().toISOString(),
  syncStatus: 'pending',
};

export default function Settings() {
  const { user } = useAuth();
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

  useEffect(() => {
    if (!user) return;
    const path = `users/${user.uid}/agencies`;
    const unsubscribe = onSnapshot(
      collection(db, path),
      (snapshot) => {
        const agenciesData: Agency[] = [];
        snapshot.forEach((d) => {
          agenciesData.push(d.data() as Agency);
        });
        setAgencies(agenciesData);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );
    return () => unsubscribe();
  }, [user]);

  const handleSaveAgency = async (agency: Agency) => {
    if (!user) return;
    const path = `users/${user.uid}/agencies/${agency.id}`;
    try {
      await setDoc(doc(db, path), agency);
      Swal.fire({ text: 'Agency saved!', icon: 'success', timer: 1500, showConfirmButton: false });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleCreateAgency = async (agency: Agency) => {
    if (!user) return;
    const newId = doc(collection(db, `users/${user.uid}/agencies`)).id;
    const newAgency = { ...agency, id: newId };
    const path = `users/${user.uid}/agencies/${newId}`;
    try {
      await setDoc(doc(db, path), newAgency);
      setActiveTab(newId);
      Swal.fire({ text: 'Agency created!', icon: 'success', timer: 1500, showConfirmButton: false });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const handleDeleteAgency = async (agencyId: string) => {
    if (!user) return;
    const path = `users/${user.uid}/agencies/${agencyId}`;
    try {
      await deleteDoc(doc(db, path));
      setActiveTab('business');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
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
      await setDoc(userDocRef, { whitelistedEmails: whitelistedEmails.filter(e => e !== email) }, { merge: true });
    } catch (error) {
      logger.error('Failed to remove whitelisted email:', error);
    }
  };

  const handleDownloadBackup = async () => {
    if (!user) return;
    try {
      setIsBackingUp(true);
      const collectionsToBackup = ['agencies', 'operations', 'inspections', 'invoices', 'expenses', 'tasks'];
      const backupData: Record<string, unknown[]> = {};

      for (const colName of collectionsToBackup) {
        const querySnapshot = await getDocs(collection(db, `users/${user.uid}/${colName}`));
        backupData[colName] = [];
        querySnapshot.forEach((d) => {
          backupData[colName].push({ id: d.id, ...d.data() });
        });
      }

      const jsonString = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `dois_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();

      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      logger.error('Failed to download backup:', error);
      Swal.fire({ text: 'Failed to generate backup. Check console for details.', icon: 'error' });
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
      <div className="animate-in fade-in duration-500 p-8 text-center text-stone-500">
        Loading settings...
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500">
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight">Settings</h1>
        <p className="mt-2 text-stone-500 text-sm">Manage your business profile, agencies, and integrations.</p>
      </div>

      <div className="flex gap-1 border-b border-stone-200 mb-6 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap rounded-t-xl transition-colors ${
              activeTab === tab.id
                ? 'bg-white border border-b-0 border-stone-200 text-stone-900'
                : 'text-stone-500 hover:text-stone-700 hover:bg-stone-50'
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
  return (
    <div className="space-y-8">
      {/* Local File Mirroring */}
      <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-stone-100 flex items-center gap-3 bg-stone-50/50">
          <FolderSync className="text-[#D49A6A]" size={20} />
          <h2 className="text-lg font-bold text-stone-900">Local File Mirroring</h2>
        </div>
        <div className="p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-stone-900">Link Local Folder</h3>
              <p className="text-sm text-stone-600 mt-1 max-w-xl">
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
                className="px-4 py-2 bg-white border border-stone-200 text-stone-700 rounded-xl text-sm font-medium hover:bg-stone-50 transition-colors shrink-0"
              >
                {localFolderLinked ? 'Change Local Folder' : 'Link Local Folder'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Email Settings */}
      <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-stone-100 flex items-center gap-3 bg-stone-50/50">
          <Mail className="text-[#D49A6A]" size={20} />
          <h2 className="text-lg font-bold text-stone-900">Email Settings</h2>
        </div>
        <div className="p-6">
          <div className="mb-4">
            <h3 className="text-base font-bold text-stone-900">Whitelisted Email Addresses</h3>
            <p className="text-sm text-stone-600 mt-1 max-w-xl">
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
              className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all outline-none"
            />
            <button
              onClick={onAddEmail}
              disabled={!newEmailInput.trim()}
              className="px-4 py-2.5 bg-[#D49A6A] hover:bg-[#c28a5c] text-white rounded-xl text-sm font-medium flex items-center gap-2 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={16} /> Add
            </button>
          </div>
          {whitelistedEmails.length === 0 ? (
            <div className="text-sm text-stone-400 py-4 text-center border border-dashed border-stone-200 rounded-xl">
              No custom emails added yet.
            </div>
          ) : (
            <div className="space-y-2">
              {whitelistedEmails.map((email) => (
                <div key={email} className="flex items-center justify-between px-4 py-2.5 bg-stone-50 border border-stone-100 rounded-xl">
                  <span className="text-sm text-stone-700 font-medium">{email}</span>
                  <button
                    onClick={() => onDeleteEmail(email)}
                    className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
      <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-stone-100 flex items-center gap-3 bg-stone-50/50">
          <Shield className="text-[#D49A6A]" size={20} />
          <h2 className="text-lg font-bold text-stone-900">Data & Integrations</h2>
        </div>
        <div className="p-6 divide-y divide-stone-100">
          <div className="pb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-stone-900">Local Database Backup</h3>
              <p className="text-sm text-stone-600 mt-1 max-w-xl">
                Download a complete JSON backup of all your data.
              </p>
            </div>
            <button
              onClick={onDownloadBackup}
              disabled={isBackingUp}
              className="px-4 py-2 bg-stone-100 border border-stone-200 text-stone-700 rounded-xl text-sm font-medium hover:bg-stone-200 transition-colors shrink-0 flex items-center gap-2 disabled:opacity-50"
            >
              <Download size={16} />
              {isBackingUp ? 'Generating...' : 'Download JSON Backup'}
            </button>
          </div>

          <div className="pt-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-stone-900">Bring Your Own Backend (BYOB)</h3>
              <p className="text-sm text-stone-600 mt-1 max-w-xl">
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
                  className="px-4 py-2 bg-white border border-stone-200 text-stone-600 rounded-lg text-sm font-medium hover:bg-stone-50 transition-colors"
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
