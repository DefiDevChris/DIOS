import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { db } from '@dios/shared/firebase';
import { doc, onSnapshot, updateDoc, collection, getDocs, setDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { configStore, logger } from '@dios/shared';
import type { Agency, Inspection, ChecklistItem } from '@dios/shared';
import { uploadToDrive } from '../lib/driveSync';
import { googleApiJson } from '@dios/shared';
import { getStoredLocalFolder, writeLocalFile } from '../lib/localFsSync';
import { calculateDistance, formatDistance, formatDriveTime } from '../utils/distanceUtils';
import {
  ArrowLeft, MapPin, Phone, Mail, Building2, Calendar,
  CloudUpload, Plus, FileText, MoreVertical, Map as MapIcon,
  ExternalLink, X, Navigation
} from 'lucide-react';
import TasksWidget from '../components/TasksWidget';
import Swal from 'sweetalert2';
import InspectionProgressBar from '../components/InspectionProgressBar';
import StepModal from '../components/StepModal';
import StickyNote from '../components/StickyNote';
import UnifiedActivityFeed from '../components/UnifiedActivityFeed';
import NearbyOperatorsModal from '../components/NearbyOperatorsModal';

interface LocalOperation {
  id: string;
  name: string;
  address: string;
  contactName: string;
  phone: string;
  email: string;
  agencyId: string;
  status: 'active' | 'inactive';
  notes: string;
  quickNote?: string;
  operationType?: string;
  clientId?: string;
  lat?: number;
  lng?: number;
  cachedDistanceMiles?: number;
  cachedDriveTimeMinutes?: number;
}

interface Document {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
  url?: string;
}

type TabId = 'overview' | 'inspections' | 'documents' | 'activity';

export default function OperationProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, googleAccessToken } = useAuth();

  const [operation, setOperation] = useState<LocalOperation | null>(null);
  const [agency, setAgency] = useState<Agency | null>(null);
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [allOperations, setAllOperations] = useState<LocalOperation[]>([]);
  const [allAgencies, setAllAgencies] = useState<Agency[]>([]);

  // Year & inspection
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const currentInspection = inspections.find((i) => {
    const yr = new Date(i.date).getFullYear();
    return yr === selectedYear;
  });

  // Tabs
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Schedule modal
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleEndDate, setScheduleEndDate] = useState('');

  // Step modal
  const [activeStep, setActiveStep] = useState<'Prep' | 'Inspected' | 'Report' | null>(null);

  // Nearby modal
  const [showNearbyModal, setShowNearbyModal] = useState(false);

  // Gmail CRM state
  const [showGmailPanel, setShowGmailPanel] = useState(false);
  const [gmailThreads, setGmailThreads] = useState<{ id: string; snippet: string }[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

  // Load operation, agency, documents, inspections
  useEffect(() => {
    if (!user || !id) return;

    const opPath = `users/${user.uid}/operations/${id}`;
    const unsubOp = onSnapshot(
      doc(db, opPath),
      async (docSnapshot) => {
        if (docSnapshot.exists()) {
          const opData = { id: docSnapshot.id, ...docSnapshot.data() } as LocalOperation;
          setOperation(opData);

          if (opData.agencyId) {
            try {
              const agencyDocs = await getDocs(collection(db, `users/${user.uid}/agencies`));
              const agencyDoc = agencyDocs.docs.find((d) => d.id === opData.agencyId);
              if (agencyDoc) setAgency({ id: agencyDoc.id, ...agencyDoc.data() } as Agency);
            } catch (error) {
              logger.error('Error fetching agency:', error);
            }
          }
        } else {
          navigate('/operations');
        }
        setLoading(false);
      },
      (error) => handleFirestoreError(error, OperationType.GET, opPath)
    );

    const docsPath = `users/${user.uid}/operations/${id}/documents`;
    const unsubDocs = onSnapshot(
      collection(db, docsPath),
      (snapshot) => {
        const docsData = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Document)
          .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
        setDocuments(docsData);
      },
      (error) => handleFirestoreError(error, OperationType.GET, docsPath)
    );

    const inspPath = `users/${user.uid}/inspections`;
    const unsubInsp = onSnapshot(
      collection(db, inspPath),
      (snapshot) => {
        const data = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Inspection)
          .filter((i) => i.operationId === id)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setInspections(data);
      },
      (error) => handleFirestoreError(error, OperationType.GET, inspPath)
    );

    // Load all operations + agencies for nearby modal
    const unsubAllOps = onSnapshot(collection(db, `users/${user.uid}/operations`), (snap) => {
      setAllOperations(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as LocalOperation));
    });
    const unsubAllAgencies = onSnapshot(collection(db, `users/${user.uid}/agencies`), (snap) => {
      setAllAgencies(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Agency));
    });

    return () => {
      unsubOp();
      unsubDocs();
      unsubInsp();
      unsubAllOps();
      unsubAllAgencies();
    };
  }, [user, id, navigate]);

  // Distance calculation on load
  useEffect(() => {
    if (!user || !operation || !id) return;
    if (operation.cachedDistanceMiles != null) return;
    if (!operation.lat || !operation.lng) return;

    const fetchDistance = async () => {
      try {
        const config = configStore.getConfig();
        if (!config?.googleMapsApiKey) return;

        // Load homebase from system_settings
        const settingsDoc = await getDocs(collection(db, `users/${user.uid}/system_settings`));
        const configDoc = settingsDoc.docs.find((d) => d.id === 'config');
        if (!configDoc) return;
        const settings = configDoc.data();
        const homebaseLat = settings.homebaseLat as number | undefined;
        const homebaseLng = settings.homebaseLng as number | undefined;
        if (!homebaseLat || !homebaseLng) return;

        const result = await calculateDistance(
          homebaseLat,
          homebaseLng,
          operation.lat!,
          operation.lng!,
          config.googleMapsApiKey
        );
        if (!result) return;

        const opPath = `users/${user.uid}/operations/${id}`;
        await updateDoc(doc(db, opPath), {
          cachedDistanceMiles: result.distanceMiles,
          cachedDriveTimeMinutes: result.durationMinutes,
        });
      } catch (error) {
        logger.error('Distance calculation failed:', error);
      }
    };

    fetchDistance();
  }, [user, operation, id]);

  const logActivity = useCallback(
    async (type: string, description: string) => {
      if (!user || !id) return;
      const path = `users/${user.uid}/operation_activities`;
      try {
        const newRef = doc(collection(db, path));
        await setDoc(newRef, {
          id: newRef.id,
          operationId: id,
          type,
          description,
          timestamp: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          syncStatus: 'pending',
        });
      } catch (error) {
        logger.error('Failed to log activity:', error);
      }
    },
    [user, id]
  );

  // Gmail CRM
  useEffect(() => {
    if (showGmailPanel && operation?.email && googleAccessToken) {
      loadGmailThreads();
    }
  }, [showGmailPanel, operation?.email, googleAccessToken]);

  const loadGmailThreads = async () => {
    const email = operation?.email;
    if (!googleAccessToken || !email) return;
    setLoadingThreads(true);
    try {
      const q = `from:${email} OR to:${email}`;
      const data = await googleApiJson<{ threads?: { id: string; snippet: string }[] }>(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads?q=${encodeURIComponent(q)}&maxResults=10`
      );
      setGmailThreads(data.threads || []);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to fetch Gmail threads:', error);
      Swal.fire({ text: `Failed to fetch email threads: ${message}`, icon: 'error' });
    } finally {
      setLoadingThreads(false);
    }
  };

  const sendTemplatedEmail = async () => {
    const token = googleAccessToken || localStorage.getItem('googleAccessToken');
    if (!token || token === 'dummy') {
      Swal.fire({ text: 'Please sign in with Google to send emails.', icon: 'info' });
      return;
    }
    if (!operation?.email) {
      Swal.fire({ text: 'No contact email set for this operation.', icon: 'info' });
      return;
    }
    setSendingEmail(true);
    try {
      const to = operation.email;
      const subject = emailSubject || `Inspection Follow-up: ${operation.name}`;
      const body =
        emailBody ||
        `Dear ${operation.contactName || 'Sir/Madam'},\n\nThis is a follow-up regarding the inspection at ${operation.name}.\n\nBest regards`;

      const message = [
        `To: ${to}`,
        `Subject: ${subject}`,
        'Content-Type: text/plain; charset=UTF-8',
        'MIME-Version: 1.0',
        '',
        body,
      ].join('\r\n');

      const encoded = btoa(unescape(encodeURIComponent(message)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const res = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: encoded }),
      });

      if (!res.ok) throw new Error(`Gmail send error: ${res.status} ${await res.text()}`);

      await logActivity('email', `Email sent to ${to}: "${subject}"`);
      setComposeOpen(false);
      setEmailSubject('');
      setEmailBody('');
      Swal.fire({ text: 'Email sent successfully!', icon: 'success' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to send email:', error);
      Swal.fire({ text: `Failed to send email: ${message}`, icon: 'error' });
    } finally {
      setSendingEmail(false);
    }
  };

  // Scheduling
  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !id || !scheduleDate) return;

    try {
      const inspectionsPath = `users/${user.uid}/inspections`;
      const newRef = doc(collection(db, inspectionsPath));
      await setDoc(newRef, {
        id: newRef.id,
        operationId: id,
        date: scheduleDate,
        ...(scheduleEndDate && scheduleEndDate !== scheduleDate ? { endDate: scheduleEndDate } : {}),
        status: 'Scheduled',
        baseHoursLog: 0,
        additionalHoursLog: 0,
        milesDriven: 0,
        prepHours: 0,
        onsiteHours: 0,
        reportHours: 0,
        prepChecklistData: '[]',
        reportChecklistData: '[]',
        calculatedMileage: 0,
        calculatedDriveTime: 0,
        updatedAt: new Date().toISOString(),
        syncStatus: 'pending',
      });

      await logActivity('schedule', `Inspection scheduled for ${formatDate(scheduleDate)}`);
      setIsScheduleModalOpen(false);
      setScheduleDate('');
      setScheduleEndDate('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/inspections`);
    }
  };

  // Step completion
  const handleStepComplete = async (data: { hours: number; checklist: ChecklistItem[] }) => {
    if (!user || !currentInspection || !activeStep) return;

    const inspPath = `users/${user.uid}/inspections/${currentInspection.id}`;
    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };

    if (activeStep === 'Prep') {
      updates.prepHours = data.hours;
      updates.prepChecklistData = JSON.stringify(data.checklist);
      updates.status = 'Prep';
    } else if (activeStep === 'Inspected') {
      updates.onsiteHours = data.hours;
      updates.status = 'Inspected';
    } else if (activeStep === 'Report') {
      updates.reportHours = data.hours;
      updates.reportChecklistData = JSON.stringify(data.checklist);
      updates.status = 'Report';
    }

    try {
      await updateDoc(doc(db, inspPath), updates);
      await logActivity('step_complete', `${activeStep} step completed (${data.hours} hours)`);
      setActiveStep(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, inspPath);
    }
  };

  const handleProgressStepClick = (step: string) => {
    if (step === 'Scheduled') {
      setIsScheduleModalOpen(true);
    } else if (step === 'Prep' || step === 'Inspected' || step === 'Report') {
      setActiveStep(step);
    } else if (step === 'Invoiced') {
      if (currentInspection) {
        navigate(`/inspections/${currentInspection.id}`);
      }
    } else if (step === 'Paid') {
      // Mark paid handled in invoice flow
    }
  };

  // Auto-calculate mileage for current inspection
  useEffect(() => {
    if (!user || !currentInspection || !operation) return;
    if (currentInspection.calculatedMileage > 0) return;
    if (!operation.cachedDistanceMiles) return;

    const inspPath = `users/${user.uid}/inspections/${currentInspection.id}`;
    updateDoc(doc(db, inspPath), {
      calculatedMileage: operation.cachedDistanceMiles,
      calculatedDriveTime: operation.cachedDriveTimeMinutes || 0,
    }).catch((err) => logger.error('Failed to set inspection mileage:', err));
  }, [user, currentInspection, operation]);

  // File upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !id || !operation) return;

    if (!googleAccessToken) {
      Swal.fire({ text: 'Please sign in with Google to upload files to Drive.', icon: 'info' });
      return;
    }

    setUploadingDoc(true);
    const docsPath = `users/${user.uid}/operations/${id}/documents`;

    try {
      const year = new Date().getFullYear().toString();
      const opName = operation.name || 'Unknown Operation';
      const agName = agency?.name || 'Unknown Agency';

      const driveUpload = await uploadToDrive(googleAccessToken, user.uid, file, agName, opName, year);

      try {
        const localHandle = await getStoredLocalFolder(true);
        if (localHandle) {
          await writeLocalFile(localHandle, [agName, opName, year], file);
        }
      } catch (localError) {
        logger.error('Failed to mirror file locally:', localError);
      }

      const newDocRef = doc(collection(db, docsPath));
      await setDoc(newDocRef, {
        name: file.name,
        size: file.size,
        type: file.type,
        uploadedAt: new Date().toISOString(),
        url: driveUpload.webViewLink,
      });

      await logActivity('document_upload', `${file.name} uploaded`);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, docsPath);
    } finally {
      setUploadingDoc(false);
      e.target.value = '';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return <div className="p-8 text-center text-stone-500">Loading operation details...</div>;
  }

  if (!operation) return null;

  const currentYear = new Date().getFullYear();
  const availableYears = Array.from({ length: 5 }, (_, i) => 2026 + i).filter((y) => y <= currentYear + 1);

  const prepChecklist: ChecklistItem[] = agency?.prepChecklistEnabled
    ? JSON.parse(agency.prepChecklistItems || '["Prep complete"]').map((item: string) => ({ item, checked: false }))
    : [];
  const reportChecklist: ChecklistItem[] = agency?.reportChecklistEnabled
    ? JSON.parse(agency.reportChecklistItems || '["Report complete"]').map((item: string) => ({ item, checked: false }))
    : [];

  const stepChecklist =
    activeStep === 'Prep' ? prepChecklist : activeStep === 'Report' ? reportChecklist : [];
  const stepChecklistEnabled =
    activeStep === 'Prep'
      ? agency?.prepChecklistEnabled ?? false
      : activeStep === 'Report'
        ? agency?.reportChecklistEnabled ?? false
        : false;

  const otherOperations = allOperations.filter((op) => op.id !== id);

  return (
    <div className="animate-in fade-in duration-500 pb-12">
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/operations"
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-500 hover:text-stone-900 transition-colors mb-4"
        >
          <ArrowLeft size={16} />
          Back to Directory
        </Link>

        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight">{operation.name}</h1>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  operation.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-600'
                }`}
              >
                {operation.status}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-stone-500">
              {operation.clientId && (
                <span className="bg-stone-100 px-2 py-0.5 rounded text-xs font-mono">{operation.clientId}</span>
              )}
              <span className="flex items-center gap-1.5">
                <Building2 size={14} /> {agency?.name || 'Unknown Agency'}
              </span>
              {operation.operationType && (
                <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                  {operation.operationType}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <MapPin size={14} /> {operation.address || 'No address'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-stone-500">
              {operation.contactName && (
                <span>{operation.contactName}</span>
              )}
              {operation.phone && (
                <span className="flex items-center gap-1">
                  <Phone size={14} /> {operation.phone}
                </span>
              )}
              {operation.email && (
                <span className="flex items-center gap-1">
                  <Mail size={14} /> {operation.email}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => setIsScheduleModalOpen(true)}
              className="px-4 py-2 bg-[#D49A6A] text-white rounded-xl text-sm font-medium hover:bg-[#c28a5c] transition-colors flex items-center gap-2 shadow-sm"
            >
              <Calendar size={16} /> + Schedule
            </button>
            {operation.address && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(operation.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-white border border-stone-200 text-stone-700 rounded-xl text-sm font-medium hover:bg-stone-50 transition-colors flex items-center gap-2 shadow-sm"
              >
                <MapIcon size={16} /> Maps
              </a>
            )}
            <button
              onClick={() => setShowNearbyModal(true)}
              className="px-4 py-2 bg-white border border-stone-200 text-stone-700 rounded-xl text-sm font-medium hover:bg-stone-50 transition-colors flex items-center gap-2 shadow-sm"
            >
              <Navigation size={16} /> Nearby
            </button>
            {operation.cachedDistanceMiles != null && (
              <div className="px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm font-medium text-stone-700">
                {formatDistance(operation.cachedDistanceMiles)} &middot;{' '}
                {formatDriveTime(operation.cachedDriveTimeMinutes || 0)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Year Selector */}
      <div className="flex items-center gap-2 mb-4">
        {availableYears.map((yr) => (
          <button
            key={yr}
            onClick={() => setSelectedYear(yr)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              selectedYear === yr
                ? 'bg-[#D49A6A] text-white'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            {yr}
          </button>
        ))}
      </div>

      {/* Inspection Progress Bar */}
      <div className="bg-[#FDFCFB] rounded-3xl p-6 shadow-sm border border-stone-100 mb-6">
        <InspectionProgressBar
          currentStatus={currentInspection?.status || ''}
          onStepClick={handleProgressStepClick}
          disabled={!currentInspection}
        />
      </div>

      {/* Gmail CRM Panel */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setShowGmailPanel((prev) => !prev)}
          className={`px-4 py-2 border rounded-xl text-sm font-medium transition-colors flex items-center gap-2 shadow-sm ${
            showGmailPanel
              ? 'bg-[#D49A6A] border-[#D49A6A] text-white'
              : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
          }`}
        >
          <Mail size={16} /> Email
        </button>
      </div>

      {showGmailPanel && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100 mb-6 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Mail size={18} className="text-[#D49A6A]" />
              <h2 className="text-base font-bold text-stone-900">Gmail CRM</h2>
              {operation.email && (
                <span className="text-xs text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full">
                  {operation.email}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setComposeOpen(true)}
                className="px-4 py-1.5 bg-[#D49A6A] hover:bg-[#c28a5c] text-white rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Mail size={14} /> Compose
              </button>
              <button
                onClick={loadGmailThreads}
                disabled={loadingThreads}
                className="px-4 py-1.5 bg-white border border-stone-200 text-stone-700 rounded-xl text-xs font-medium hover:bg-stone-50 transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                {loadingThreads ? 'Loading...' : 'Load Threads'}
              </button>
            </div>
          </div>
          {gmailThreads.length === 0 && !loadingThreads ? (
            <div className="py-6 text-center text-stone-500 text-sm">
              No threads loaded. Click &quot;Load Threads&quot; to fetch email history.
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {gmailThreads.map((thread) => (
                <a
                  key={thread.id}
                  href={`https://mail.google.com/mail/u/0/#all/${thread.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 p-3 rounded-xl border border-stone-100 hover:bg-stone-50 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-full bg-[#D49A6A]/10 flex items-center justify-center shrink-0">
                    <Mail size={14} className="text-[#D49A6A]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-stone-700 truncate">{thread.snippet || 'No preview'}</p>
                  </div>
                  <ExternalLink
                    size={14}
                    className="text-stone-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1"
                  />
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-stone-200 mb-6">
        {(['overview', 'inspections', 'documents', 'activity'] as TabId[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium capitalize rounded-t-xl transition-colors ${
              activeTab === tab
                ? 'bg-white border border-b-0 border-stone-200 text-stone-900'
                : 'text-stone-500 hover:text-stone-700 hover:bg-stone-50'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <StickyNote operationId={id!} onSaved={() => setRefreshTrigger((n) => n + 1)} />
          <UnifiedActivityFeed operationId={id!} operationEmail={operation.email} refreshTrigger={refreshTrigger} />
        </div>
      )}

      {activeTab === 'inspections' && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100">
          <h2 className="text-base font-bold text-stone-900 mb-4">Inspections</h2>
          {inspections.length === 0 ? (
            <div className="text-center text-stone-500 py-4 text-sm">No inspections found.</div>
          ) : (
            <div className="space-y-3">
              {inspections.map((inspection) => {
                const date = new Date(inspection.date);
                const month = date.toLocaleDateString('en-US', { month: 'short' });
                const day = date.toLocaleDateString('en-US', { day: 'numeric' });
                const year = date.toLocaleDateString('en-US', { year: 'numeric' });

                return (
                  <div
                    key={inspection.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-stone-50 border border-stone-100"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white border border-stone-200 flex flex-col items-center justify-center">
                        <span className="text-[10px] font-bold text-stone-400 uppercase">{month}</span>
                        <span className="text-sm font-extrabold text-stone-900 leading-none">{day}</span>
                      </div>
                      <div>
                        <div className="text-sm font-bold text-stone-900">{year} Annual Inspection</div>
                        <div className="text-xs text-stone-500">{inspection.status}</div>
                      </div>
                    </div>
                    <Link
                      to={`/inspections/${inspection.id}`}
                      className="text-[#D49A6A] hover:text-[#c28a5c] text-sm font-medium"
                    >
                      View
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-base font-bold text-stone-900">Documents</h2>
            <label className="text-stone-400 hover:text-[#D49A6A] transition-colors cursor-pointer">
              <Plus size={18} />
              <input type="file" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>

          {documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center p-4">
              <FileText size={24} className="text-stone-300 mb-2" />
              <p className="text-sm text-stone-500">No documents yet</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {documents.map((d) => (
                <a
                  key={d.id}
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 rounded-xl border border-stone-100 hover:bg-stone-50 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        d.type.includes('pdf') ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'
                      }`}
                    >
                      <FileText size={16} />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-stone-900 truncate max-w-[250px]">{d.name}</div>
                      <div className="text-[10px] text-stone-500">
                        Added {formatDate(d.uploadedAt)} &middot; {formatFileSize(d.size)}
                      </div>
                    </div>
                  </div>
                  <MoreVertical
                    size={16}
                    className="text-stone-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  />
                </a>
              ))}
            </div>
          )}

          <div className="mt-4">
            <label
              className={`border-2 border-dashed border-stone-200 rounded-2xl p-6 flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
                uploadingDoc ? 'bg-stone-50 border-[#D49A6A]/50' : 'hover:bg-stone-50 hover:border-[#D49A6A]/50'
              }`}
            >
              <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploadingDoc} />
              {uploadingDoc ? (
                <>
                  <div className="w-6 h-6 border-2 border-[#D49A6A] border-t-transparent rounded-full animate-spin mb-2" />
                  <span className="text-sm font-medium text-[#D49A6A] mb-1">Uploading...</span>
                </>
              ) : (
                <>
                  <CloudUpload size={24} className="text-stone-400 mb-2" />
                  <span className="text-sm font-medium text-stone-700 mb-1">Upload Document</span>
                  <span className="text-[10px] text-stone-500">Click to browse</span>
                </>
              )}
            </label>
          </div>
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100">
          <h2 className="text-base font-bold text-stone-900 mb-4">Tasks & Activity</h2>
          <div className="mb-6">
            <TasksWidget operationId={id} title="Operation Tasks" />
          </div>
        </div>
      )}

      {/* Compose Email Modal */}
      {composeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-stone-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-stone-900">Compose Email</h2>
              <button onClick={() => setComposeOpen(false)} className="text-stone-400 hover:text-stone-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">To</label>
                <div className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm text-stone-600">
                  {operation.email || 'No email set'}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Subject</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder={`Inspection Follow-up: ${operation.name}`}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Message</label>
                <textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  rows={6}
                  placeholder={`Dear ${operation.contactName || 'Sir/Madam'},\n\nFollowing up regarding the inspection at ${operation.name}.`}
                  className="w-full resize-none bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all outline-none"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-stone-100 bg-stone-50/50 flex justify-end gap-3">
              <button
                onClick={() => setComposeOpen(false)}
                className="px-4 py-2 text-sm font-medium text-stone-600 hover:text-stone-900 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={sendTemplatedEmail}
                disabled={sendingEmail || !operation.email}
                className="bg-[#D49A6A] hover:bg-[#c28a5c] text-white px-6 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
              >
                {sendingEmail ? 'Sending...' : 'Send Email'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-stone-100">
              <h2 className="text-xl font-bold text-stone-900">Schedule Inspection</h2>
              <p className="text-sm text-stone-500 mt-1">Select a date for the upcoming inspection.</p>
            </div>
            <form id="schedule-form" onSubmit={handleSchedule} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">
                  Start Date
                </label>
                <input
                  type="date"
                  required
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">
                  End Date <span className="font-normal text-stone-400 normal-case">(optional)</span>
                </label>
                <input
                  type="date"
                  value={scheduleEndDate}
                  min={scheduleDate || undefined}
                  onChange={(e) => setScheduleEndDate(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all outline-none"
                />
              </div>
            </form>
            <div className="px-6 py-4 border-t border-stone-100 bg-stone-50/50 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsScheduleModalOpen(false);
                  setScheduleDate('');
                  setScheduleEndDate('');
                }}
                className="px-4 py-2 text-sm font-medium text-stone-600 hover:text-stone-900 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="schedule-form"
                disabled={!scheduleDate}
                className="bg-[#D49A6A] hover:bg-[#c28a5c] text-white px-6 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step Modal */}
      {activeStep && (
        <StepModal
          isOpen={!!activeStep}
          onClose={() => setActiveStep(null)}
          step={activeStep}
          checklistItems={stepChecklist}
          checklistEnabled={stepChecklistEnabled}
          onComplete={handleStepComplete}
        />
      )}

      {/* Nearby Operators Modal */}
      <NearbyOperatorsModal
        isOpen={showNearbyModal}
        onClose={() => setShowNearbyModal(false)}
        currentOperation={operation as any}
        operations={otherOperations as any[]}
        agencies={allAgencies}
      />
    </div>
  );
}
