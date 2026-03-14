import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { db, storage } from '../firebase';
import { doc, onSnapshot, updateDoc, collection, getDocs, setDoc } from 'firebase/firestore';
import { ref } from 'firebase/storage';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { configStore } from '../lib/configStore';
import { uploadToDrive } from '../lib/driveSync';
import { googleApiJson } from '../utils/googleApiClient';
import { getStoredLocalFolder, writeLocalFile } from '../lib/localFsSync';
import {
  ArrowLeft, Check, Search, FileText, Receipt, CheckCircle,
  MapPin, Phone, Mail, Building2, Calendar, Edit3, CloudUpload,
  Clock, Plus, File, MoreVertical, Map as MapIcon, ExternalLink, X
} from 'lucide-react';

interface Operation {
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
  inspectionStatus?: 'prep' | 'scheduled' | 'inspected' | 'report' | 'invoiced' | 'paid';
  lat?: number;
  lng?: number;
}

const INSPECTION_STEPS = [
  { id: 'prep', label: 'Prep', icon: Check },
  { id: 'scheduled', label: 'Scheduled', icon: Check },
  { id: 'inspected', label: 'Inspected', icon: Search },
  { id: 'report', label: 'Report', icon: FileText },
  { id: 'invoiced', label: 'Invoiced', icon: Receipt },
  { id: 'paid', label: 'Paid', icon: CheckCircle },
];

interface Document {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
  url?: string;
}

interface Activity {
  id: string;
  type: string;
  description: string;
  timestamp: string;
}

import TasksWidget from '../components/TasksWidget';
import Swal from 'sweetalert2';

export default function OperationProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, googleAccessToken } = useAuth();
  
  const [operation, setOperation] = useState<Operation | null>(null);
  const [agencyName, setAgencyName] = useState<string>('Loading...');
  const [loading, setLoading] = useState(true);
  const [quickNote, setQuickNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [inspections, setInspections] = useState<any[]>([]);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleEndDate, setScheduleEndDate] = useState('');

  // Gmail CRM state
  const [showGmailPanel, setShowGmailPanel] = useState(false);
  const [gmailThreads, setGmailThreads] = useState<{ id: string; snippet: string }[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

  useEffect(() => {
    if (!user || !id) return;

    const opPath = `users/${user.uid}/operations/${id}`;
    const unsubscribe = onSnapshot(
      doc(db, opPath),
      async (docSnapshot) => {
        if (docSnapshot.exists()) {
          const opData = { id: docSnapshot.id, ...docSnapshot.data() } as Operation;
          // Set default status if missing
          if (!opData.inspectionStatus) opData.inspectionStatus = 'inspected';
          
          setOperation(opData);
          setQuickNote(opData.quickNote || '');

          // Fetch agency name
          if (opData.agencyId) {
            try {
              const agencyDoc = await getDocs(collection(db, `users/${user.uid}/agencies`));
              const agency = agencyDoc.docs.find(d => d.id === opData.agencyId);
              setAgencyName(agency ? agency.data().name : 'Unknown Agency');
            } catch (error) {
              console.error("Error fetching agency:", error);
              setAgencyName('Unknown Agency');
            }
          }
        } else {
          // Operation not found
          navigate('/operations');
        }
        setLoading(false);
      },
      (error) => handleFirestoreError(error, OperationType.GET, opPath)
    );

    const docsPath = `users/${user.uid}/operations/${id}/documents`;
    const unsubscribeDocs = onSnapshot(
      collection(db, docsPath),
      (snapshot) => {
        const docsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Document[];
        // Sort by uploadedAt descending
        docsData.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
        setDocuments(docsData);
      },
      (error) => handleFirestoreError(error, OperationType.GET, docsPath)
    );

    const activitiesPath = `users/${user.uid}/operations/${id}/activities`;
    const unsubscribeActivities = onSnapshot(
      collection(db, activitiesPath),
      (snapshot) => {
        const activitiesData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Activity[];
        // Sort by timestamp descending
        activitiesData.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setActivities(activitiesData);
      },
      (error) => handleFirestoreError(error, OperationType.GET, activitiesPath)
    );

    const inspectionsPath = `users/${user.uid}/inspections`;
    const unsubscribeInspections = onSnapshot(
      collection(db, inspectionsPath),
      (snapshot) => {
        const inspectionsData: any[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data.operationId === id) {
            inspectionsData.push({ id: doc.id, ...data });
          }
        });
        // Sort by date descending
        inspectionsData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setInspections(inspectionsData);
      },
      (error) => handleFirestoreError(error, OperationType.GET, inspectionsPath)
    );

    return () => {
      unsubscribe();
      unsubscribeDocs();
      unsubscribeActivities();
      unsubscribeInspections();
    };
  }, [user, id, navigate]);

  const logActivity = async (type: string, description: string) => {
    if (!user || !id) return;
    const activitiesPath = `users/${user.uid}/operations/${id}/activities`;
    try {
      const newActivityRef = doc(collection(db, activitiesPath));
      await setDoc(newActivityRef, {
        type,
        description,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Failed to log activity:", error);
    }
  };

  const handleSaveQuickNote = async () => {
    if (!user || !id || !operation) return;
    setSavingNote(true);
    const opPath = `users/${user.uid}/operations/${id}`;
    try {
      await updateDoc(doc(db, opPath), { quickNote });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, opPath);
    } finally {
      setSavingNote(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!user || !id) return;
    const opPath = `users/${user.uid}/operations/${id}`;
    try {
      await updateDoc(doc(db, opPath), { inspectionStatus: newStatus });
      const stepLabel = INSPECTION_STEPS.find(s => s.id === newStatus)?.label || newStatus;
      await logActivity('status_change', `Status changed to ${stepLabel}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, opPath);
    }
  };

  // Auto-load Gmail threads when the panel is opened
  useEffect(() => {
    if (showGmailPanel && operation?.email && googleAccessToken) {
      loadGmailThreads(operation.email);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGmailPanel, operation?.email, googleAccessToken]);

  // --- Gmail CRM ---

  const loadGmailThreads = async (operatorEmail?: string) => {
    const email = operatorEmail || operation?.email;
    if (!googleAccessToken) {
      Swal.fire({ text: 'Please sign in with Google to view Gmail threads.', icon: 'info' });
      return;
    }
    if (!email) {
      Swal.fire({ text: 'No contact email set for this operation.', icon: 'info' });
      return;
    }
    setLoadingThreads(true);
    try {
      const q = `from:${email} OR to:${email}`;
      const data = await googleApiJson<{ threads?: { id: string; snippet: string }[] }>(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads?q=${encodeURIComponent(q)}&maxResults=10`
      );
      setGmailThreads(data.threads || []);
    } catch (error: any) {
      console.error('Failed to fetch Gmail threads:', error);
      Swal.fire({ text: `Failed to fetch email threads: ${error.message}`, icon: 'error' });
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
      const body = emailBody ||
        `Dear ${operation.contactName || 'Sir/Madam'},\n\nThis is a follow-up regarding the inspection at ${operation.name}.\n\nPlease feel free to reach out with any questions.\n\nBest regards`;

      // Build RFC 2822 message
      const message = [
        `To: ${to}`,
        `Subject: ${subject}`,
        'Content-Type: text/plain; charset=UTF-8',
        'MIME-Version: 1.0',
        '',
        body,
      ].join('\r\n');

      // Base64url encode
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
    } catch (error: any) {
      console.error('Failed to send email:', error);
      Swal.fire({ text: `Failed to send email: ${error.message}`, icon: 'error' });
    } finally {
      setSendingEmail(false);
    }
  };

  // --- Scheduling ---

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !id || !scheduleDate) return;

    try {
      // Create a new inspection document
      const inspectionsPath = `users/${user.uid}/inspections`;
      const newInspectionRef = doc(collection(db, inspectionsPath));
      await setDoc(newInspectionRef, {
        operationId: id,
        date: scheduleDate,
        ...(scheduleEndDate && scheduleEndDate !== scheduleDate ? { endDate: scheduleEndDate } : {}),
        status: 'Scheduled',
        baseHoursLog: 0,
        additionalHoursLog: 0,
        milesDriven: 0
      });

      // Update operation status
      await handleStatusChange('scheduled');
      
      // Log activity
      await logActivity('schedule', `Inspection scheduled for ${formatDate(scheduleDate)}`);
      
      setIsScheduleModalOpen(false);
      setScheduleDate('');
      setScheduleEndDate('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/inspections`);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !id || !operation) return;

    if (!googleAccessToken) {
      Swal.fire({ text: "Please sign in with Google to upload files to Drive.", icon: 'info' });
      return;
    }

    setUploadingDoc(true);
    const docsPath = `users/${user.uid}/operations/${id}/documents`;
    
    try {
      const year = new Date().getFullYear().toString();
      const opName = operation.name || 'Unknown Operation';
      const agName = agencyName || 'Unknown Agency';

      // 1. Upload to Google Drive
      const driveUpload = await uploadToDrive(
        googleAccessToken,
        user.uid,
        file,
        agName,
        opName,
        year
      );

      // 2. Mirror locally if a folder is linked
      try {
        const localHandle = await getStoredLocalFolder(true); // Allow prompt during upload user action
        if (localHandle) {
          await writeLocalFile(localHandle, [agName, opName, year], file);
          console.log("Successfully mirrored to local folder.");
        }
      } catch (localError) {
        console.error("Failed to mirror file locally:", localError);
        // We don't fail the whole upload if local mirror fails
      }

      // 3. Store metadata in Firestore
      const newDocRef = doc(collection(db, docsPath));
      await setDoc(newDocRef, {
        name: file.name,
        size: file.size,
        type: file.type,
        uploadedAt: new Date().toISOString(),
        url: driveUpload.webViewLink
      });

      await logActivity('document_upload', `${file.name} uploaded`);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, docsPath);
    } finally {
      setUploadingDoc(false);
      // Reset input
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

  const currentStepIndex = INSPECTION_STEPS.findIndex(s => s.id === operation.inspectionStatus);

  return (
    <div className="animate-in fade-in duration-500 pb-12">
      {/* Breadcrumbs & Header */}
      <div className="mb-6">
        <Link to="/operations" className="inline-flex items-center gap-2 text-sm font-medium text-stone-500 hover:text-stone-900 transition-colors mb-4">
          <ArrowLeft size={16} />
          Back to Directory
        </Link>
        
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight">{operation.name}</h1>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                operation.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-600'
              }`}>
                {operation.status}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm text-stone-500">
              <span className="flex items-center gap-1.5"><Building2 size={16} /> {agencyName}</span>
              <span className="flex items-center gap-1.5"><MapPin size={16} /> {operation.address}</span>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <button 
              onClick={() => setIsScheduleModalOpen(true)}
              className="px-4 py-2 bg-white border border-stone-200 text-stone-700 rounded-xl text-sm font-medium hover:bg-stone-50 transition-colors flex items-center gap-2 shadow-sm"
            >
              <Calendar size={16} /> Schedule
            </button>
            <button
              onClick={() => setShowGmailPanel(prev => !prev)}
              className={`px-4 py-2 border rounded-xl text-sm font-medium transition-colors flex items-center gap-2 shadow-sm ${
                showGmailPanel
                  ? 'bg-[#D49A6A] border-[#D49A6A] text-white'
                  : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
              }`}
            >
              <Mail size={16} /> Email
            </button>
            <button 
              onClick={() => logActivity('task', 'New task created')}
              className="px-4 py-2 bg-white border border-stone-200 text-stone-700 rounded-xl text-sm font-medium hover:bg-stone-50 transition-colors flex items-center gap-2 shadow-sm"
            >
              <CheckCircle size={16} /> Tasks
            </button>
            <button 
              onClick={() => logActivity('report', 'Report drafted')}
              className="px-4 py-2 bg-white border border-stone-200 text-stone-700 rounded-xl text-sm font-medium hover:bg-stone-50 transition-colors flex items-center gap-2 shadow-sm"
            >
              <FileText size={16} /> Report
            </button>
            <button 
              onClick={() => logActivity('invoice', 'Invoice generated')}
              className="px-4 py-2 bg-[#D49A6A] text-white rounded-xl text-sm font-medium hover:bg-[#c28a5c] transition-colors flex items-center gap-2 shadow-sm"
            >
              <Receipt size={16} /> Invoice
            </button>
          </div>
        </div>
      </div>

      {/* Inspection Flow */}
      <div className="bg-[#FDFCFB] rounded-3xl p-8 shadow-sm border border-stone-100 mb-6 overflow-x-auto">
        <div className="flex items-center justify-between min-w-[600px] relative">
          {/* Connecting Line */}
          <div className="absolute top-5 left-8 right-8 h-0.5 bg-stone-100 -z-10"></div>
          
          {INSPECTION_STEPS.map((step, index) => {
            const isCompleted = index <= currentStepIndex;
            const isCurrent = index === currentStepIndex;
            const Icon = step.icon;
            
            return (
              <div 
                key={step.id} 
                className="flex flex-col items-center gap-3 cursor-pointer group"
                onClick={() => handleStatusChange(step.id)}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                  isCompleted 
                    ? 'bg-white border-2 border-[#D49A6A] text-[#D49A6A] shadow-sm' 
                    : 'bg-white border-2 border-stone-200 text-stone-400 group-hover:border-stone-300'
                } ${isCurrent ? 'ring-4 ring-[#D49A6A]/10 scale-110' : ''}`}>
                  <Icon size={18} strokeWidth={isCompleted ? 2.5 : 2} />
                </div>
                <span className={`text-xs font-bold uppercase tracking-wider ${
                  isCompleted ? 'text-[#D49A6A]' : 'text-stone-400'
                }`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Gmail CRM Panel */}
      {showGmailPanel && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100 mb-6 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Mail size={18} className="text-[#D49A6A]" />
              <h2 className="text-base font-bold text-stone-900">Gmail CRM</h2>
              {operation.email && (
                <span className="text-xs text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full">{operation.email}</span>
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
              No threads loaded. Click "Load Threads" to fetch email history for this contact.
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {gmailThreads.map(thread => (
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
                    <p className="text-sm text-stone-700 truncate">{thread.snippet || 'No preview available'}</p>
                    <p className="text-xs text-stone-400 mt-0.5">Thread ID: {thread.id}</p>
                  </div>
                  <ExternalLink size={14} className="text-stone-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
                </a>
              ))}
            </div>
          )}
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
                <div className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm text-stone-600">{operation.email || 'No email set'}</div>
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Subject</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder={`Inspection Follow-up: ${operation.name}`}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Message</label>
                <textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  rows={6}
                  placeholder={`Dear ${operation.contactName || 'Sir/Madam'},\n\nThis is a follow-up regarding the inspection at ${operation.name}.\n\nBest regards`}
                  className="w-full resize-none bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-stone-100 bg-stone-50/50 flex justify-end gap-3">
              <button
                onClick={() => setComposeOpen(false)}
                className="px-4 py-2 text-sm font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-200/50 rounded-xl transition-colors"
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Left Column: Business Info & Map */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {/* Business Info */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100">
            <h2 className="text-base font-bold text-stone-900 mb-4">Business Info</h2>
            <div className="space-y-4">
              <div>
                <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1">Contact</div>
                <div className="text-sm font-medium text-stone-900">{operation.contactName || 'No contact specified'}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1">Phone</div>
                <div className="text-sm font-medium text-stone-900 flex items-center gap-2">
                  <Phone size={14} className="text-stone-400" />
                  {operation.phone || 'No phone'}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1">Email</div>
                <div className="text-sm font-medium text-stone-900 flex items-center gap-2">
                  <Mail size={14} className="text-stone-400" />
                  {operation.email || 'No email'}
                </div>
              </div>
              {operation.notes && (
                <div>
                  <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1">Internal Notes</div>
                  <div className="text-sm text-stone-600 bg-stone-50 p-3 rounded-xl border border-stone-100">
                    {operation.notes}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Map Widget */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100 flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-base font-bold text-stone-900">Location</h2>
            </div>
            <div className="w-full h-48 bg-stone-100 rounded-2xl border border-stone-200 overflow-hidden relative mb-4 flex items-center justify-center">
              {operation.address ? (
                <iframe
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  loading="lazy"
                  allowFullScreen
                  referrerPolicy="no-referrer-when-downgrade"
                  src={`https://www.google.com/maps/embed/v1/place?key=${configStore.getConfig()?.googleMapsApiKey}&q=${encodeURIComponent(operation.address)}`}
                ></iframe>
              ) : (
                <>
                  <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#d6d3d1 1px, transparent 1px)', backgroundSize: '16px 16px' }}></div>
                  <div className="relative z-10 flex flex-col items-center text-stone-400">
                    <MapPin size={32} className="text-[#D49A6A] mb-2 drop-shadow-md" fill="currentColor" />
                    <span className="text-xs font-medium bg-white/80 px-2 py-1 rounded-md backdrop-blur-sm">No Address Provided</span>
                  </div>
                </>
              )}
            </div>
            <button 
              onClick={() => navigate('/operations')}
              className="w-full py-2.5 bg-stone-50 hover:bg-stone-100 text-stone-700 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 border border-stone-200"
            >
              <MapIcon size={16} /> Show Nearby Operators
            </button>
          </div>
        </div>

        {/* Middle Column: Notes, Tasks & Documents */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {/* Quick Note */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100 flex flex-col min-h-[240px]">
            <div className="flex items-center gap-2 mb-4">
              <Edit3 size={18} className="text-[#D49A6A]" />
              <h2 className="text-base font-bold text-stone-900">Quick Note</h2>
            </div>
            <div className="flex-1 relative">
              <textarea 
                value={quickNote}
                onChange={(e) => setQuickNote(e.target.value)}
                onBlur={handleSaveQuickNote}
                className="w-full h-full resize-none bg-[#FDFCFB] border border-stone-200 border-dashed rounded-2xl p-4 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A]/50 transition-all"
                placeholder="Type your notes here. Saves automatically."
              ></textarea>
              <div className="absolute bottom-4 right-4 flex items-center gap-2">
                {savingNote && <span className="text-[10px] text-stone-400 font-medium uppercase tracking-wider">Saving...</span>}
                <button 
                  onClick={handleSaveQuickNote}
                  className="p-1.5 text-[#D49A6A] bg-[#D49A6A]/10 rounded-md hover:bg-[#D49A6A]/20 transition-colors"
                >
                  <Check size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Tasks */}
          <div className="min-h-[280px]">
            <TasksWidget operationId={id} title="Operation Tasks" />
          </div>

          {/* Documents */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100 flex-1 flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-base font-bold text-stone-900">Documents</h2>
              <label className="text-stone-400 hover:text-[#D49A6A] transition-colors cursor-pointer">
                <Plus size={18} />
                <input type="file" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
            
            <div className="flex-1 flex flex-col gap-3">
              {documents.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                  <FileText size={24} className="text-stone-300 mb-2" />
                  <p className="text-sm text-stone-500">No documents yet</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2">
                  {documents.map(doc => (
                    <a 
                      key={doc.id} 
                      href={doc.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-3 rounded-xl border border-stone-100 hover:bg-stone-50 transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          doc.type.includes('pdf') ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'
                        }`}>
                          <FileText size={16} />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-stone-900 truncate max-w-[180px]">{doc.name}</div>
                          <div className="text-[10px] text-stone-500">
                            Added {formatDate(doc.uploadedAt)} • {formatFileSize(doc.size)}
                          </div>
                        </div>
                      </div>
                      <MoreVertical size={16} className="text-stone-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </a>
                  ))}
                </div>
              )}

              {/* Upload Area */}
              <div className="mt-auto pt-4">
                <label className={`border-2 border-dashed border-stone-200 rounded-2xl p-6 flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
                  uploadingDoc ? 'bg-stone-50 border-[#D49A6A]/50' : 'hover:bg-stone-50 hover:border-[#D49A6A]/50'
                }`}>
                  <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploadingDoc} />
                  {uploadingDoc ? (
                    <>
                      <div className="w-6 h-6 border-2 border-[#D49A6A] border-t-transparent rounded-full animate-spin mb-2"></div>
                      <span className="text-sm font-medium text-[#D49A6A] mb-1">Uploading...</span>
                    </>
                  ) : (
                    <>
                      <CloudUpload size={24} className="text-stone-400 mb-2" />
                      <span className="text-sm font-medium text-stone-700 mb-1">Upload Document</span>
                      <span className="text-[10px] text-stone-500">Drag & drop or click to browse</span>
                    </>
                  )}
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Activity & Past Inspections */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {/* Past Inspections */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100">
            <h2 className="text-base font-bold text-stone-900 mb-4">Past Inspections</h2>
            {inspections.length === 0 ? (
              <div className="text-center text-stone-500 py-4 text-sm">No past inspections found.</div>
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                {inspections.map(inspection => {
                  const date = new Date(inspection.date);
                  const month = date.toLocaleDateString('en-US', { month: 'short' });
                  const day = date.toLocaleDateString('en-US', { day: 'numeric' });
                  const year = date.toLocaleDateString('en-US', { year: 'numeric' });
                  
                  return (
                    <div key={inspection.id} className="flex items-center justify-between p-3 rounded-xl bg-stone-50 border border-stone-100">
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
                      <Link to={`/inspections/${inspection.id}`} className="text-[#D49A6A] hover:text-[#c28a5c] text-sm font-medium">View</Link>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Activity View */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100 flex-1">
            <h2 className="text-base font-bold text-stone-900 mb-6">Recent Activity</h2>
            {activities.length === 0 ? (
              <div className="text-center text-stone-500 py-4">No recent activity.</div>
            ) : (
              <div className="relative pl-4 border-l-2 border-stone-100 space-y-6 max-h-[300px] overflow-y-auto pr-2">
                {activities.map((activity, index) => (
                  <div key={activity.id} className="relative">
                    <div className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full ring-4 ring-white ${
                      index === 0 ? 'bg-[#D49A6A]' : 'bg-stone-300'
                    }`}></div>
                    <div className="text-sm font-medium text-stone-900">{activity.description}</div>
                    <div className="text-xs text-stone-500 flex items-center gap-1 mt-1">
                      <Clock size={12} /> {formatDate(activity.timestamp)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

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
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Start Date</label>
                <input
                  type="date"
                  required
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">End Date <span className="font-normal text-stone-400 normal-case">(optional, for multi-day)</span></label>
                <input
                  type="date"
                  value={scheduleEndDate}
                  min={scheduleDate || undefined}
                  onChange={(e) => setScheduleEndDate(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                />
              </div>
            </form>
            
            <div className="px-6 py-4 border-t border-stone-100 bg-stone-50/50 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => { setIsScheduleModalOpen(false); setScheduleDate(''); setScheduleEndDate(''); }}
                className="px-4 py-2 text-sm font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-200/50 rounded-xl transition-colors"
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
    </div>
  );
}
