import { useState, useEffect, useRef } from 'react';
import { ArrowRight, Calendar, CloudUpload, Edit3, Check, Loader2, FileText, Image, File } from 'lucide-react';
import { format } from 'date-fns';
import TasksWidget from '../components/TasksWidget';
import ProcessUploadModal from '../components/ProcessUploadModal';
import type { UnassignedUpload } from '@dios/shared/types';
import { useAuth } from '../contexts/AuthContext';
import { storage } from '@dios/shared/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useNavigate } from 'react-router';
import { logger } from '@dios/shared';
import { useDatabase } from '../hooks/useDatabase';
import type { Inspection, Operation } from '@dios/shared/types';
import Swal from 'sweetalert2';

interface UpcomingInspection {
  id: string;
  date: string;
  status: string;
  operationId: string;
  operationName: string;
}

// Extended UI interface for UnassignedUpload with Firestore fields
interface UnassignedUploadUI extends UnassignedUpload {
  downloadURL?: string;
  storagePath?: string;
  fileSize?: number;
}

// Local Note interface that matches what we store
interface Note {
  id: string;
  content: string;
  createdAt: string;
}

function getFileIcon(fileType: string) {
  if (fileType.startsWith('image/')) return { Icon: Image, color: 'text-purple-500' };
  if (fileType === 'application/pdf') return { Icon: FileText, color: 'text-blue-500' };
  return { Icon: File, color: 'text-[#a89b8c]' };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const today = new Date();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Database hooks
  const { findAll: findAllInspections } = useDatabase<Inspection>({ table: 'inspections' });
  const { findAll: findAllOperations } = useDatabase<Operation>({ table: 'operations' });
  const { findAll: findAllUploads, save: saveUpload } = useDatabase<UnassignedUploadUI>({ table: 'unassigned_uploads' });
  const { save: saveNote } = useDatabase<Note>({ table: 'notes' });

  const [upcomingInspections, setUpcomingInspections] = useState<UpcomingInspection[]>([]);
  const [loadingInspections, setLoadingInspections] = useState(true);

  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  // Uploads state
  const [unassignedUploads, setUnassignedUploads] = useState<UnassignedUploadUI[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [operations, setOperations] = useState<{ id: string; name: string }[]>([]);
  const [selectedUpload, setSelectedUpload] = useState<UnassignedUploadUI | null>(null);

  // Fetch upcoming inspections (future dates, ordered ascending)
  useEffect(() => {
    if (!user) {
      setLoadingInspections(false);
      return;
    }

    const fetchUpcoming = async () => {
      setLoadingInspections(true);
      try {
        const todayStr = today.toISOString().split('T')[0];

        const inspections = await findAllInspections();
        const ops = await findAllOperations();
        
        const opNames: Record<string, string> = {};
        ops.forEach(op => {
          opNames[op.id] = op.name;
        });

        const upcoming = inspections
          .filter(i => i.date >= todayStr)
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(0, 5)
          .map(i => ({
            id: i.id,
            date: i.date,
            status: i.status,
            operationId: i.operationId,
            operationName: opNames[i.operationId] ?? 'Unknown Operation',
          }));

        setUpcomingInspections(upcoming);
      } catch (error) {
        logger.error('Error fetching upcoming inspections:', error);
      } finally {
        setLoadingInspections(false);
      }
    };

    fetchUpcoming();
  }, [user, findAllInspections, findAllOperations]);

  // Fetch operations for the processing modal
  useEffect(() => {
    if (!user) return;
    
    const fetchOperations = async () => {
      const ops = await findAllOperations();
      setOperations(ops.map(op => ({ id: op.id, name: op.name })));
    };
    
    fetchOperations();
  }, [user, findAllOperations]);

  // Fetch unassigned uploads (last 6, most recent first)
  useEffect(() => {
    if (!user) return;
    
    const fetchUploads = async () => {
      const uploads = await findAllUploads();
      const sorted = uploads
        .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
        .slice(0, 6);
      setUnassignedUploads(sorted);
    };
    
    fetchUploads();
  }, [user, findAllUploads]);

  const handleSaveNote = async () => {
    if (!user || !noteText.trim()) return;
    setSavingNote(true);
    try {
      await saveNote({
        id: crypto.randomUUID(),
        content: noteText.trim(),
        createdAt: new Date().toISOString(),
      });
      setNoteText('');
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 2000);
    } catch (error) {
      logger.error('Error saving note:', error);
    } finally {
      setSavingNote(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    e.target.value = '';

    if (!storage) {
      Swal.fire({ text: 'Cloud storage is not configured. Please set up Firebase to upload files.', icon: 'info' });
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const fileName = `${Date.now()}_${file.name}`;
      const storagePath = `users/${user.uid}/unassigned_uploads/${fileName}`;
      const storageRef = ref(storage, storagePath);
      const uploadTask = uploadBytesResumable(storageRef, file);

      await new Promise<void>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            setUploadProgress(pct);
          },
          reject,
          async () => {
            try {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              await saveUpload({
                id: crypto.randomUUID(),
                fileName: file.name,
                fileType: file.type,
                fileUrl: downloadURL,
                uploadedAt: new Date().toISOString(),
                source: 'desktop' as const,
              });
              // Refresh uploads list
              const uploads = await findAllUploads();
              const sorted = uploads
                .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
                .slice(0, 6);
              setUnassignedUploads(sorted);
              resolve();
            } catch (err) {
              reject(err);
            }
          }
        );
      });
    } catch (error) {
      logger.error('Upload error:', error);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const formatInspectionDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    return format(d, 'MMM d');
  };

  return (
    <div className="animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="font-serif-display text-[36px] font-semibold text-[#2a2420] tracking-tight">{(() => { const h = new Date().getHours(); return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening'; })()}</h1>
          <p className="mt-2 text-[#8b7355] font-medium text-sm">Here's what's happening with your certification operations today.</p>
        </div>
        <div className="flex items-center gap-2 text-[#8b7355] text-sm font-medium">
          <Calendar size={16} className="text-[#d4a574]" />
          {format(today, 'EEEE, MMMM d, yyyy')}
        </div>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-12 gap-6">

        {/* Upcoming Inspections (Spans 7 cols) */}
        <div className="col-span-12 lg:col-span-7 luxury-card rounded-[24px] p-6 flex flex-col min-h-[320px]">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-base font-bold text-[#2a2420]">Upcoming Inspections</h2>
            <button
              onClick={() => navigate('/schedule')}
              className="text-[#a89b8c] hover:text-[#d4a574] transition-colors"
            >
              <ArrowRight size={18} />
            </button>
          </div>

          {loadingInspections ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 size={24} className="animate-spin text-[#d4a574]" />
            </div>
          ) : upcomingInspections.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-[#a89b8c]">
              <div className="w-12 h-12 bg-[rgba(212,165,116,0.04)] rounded-xl flex items-center justify-center mb-3 border border-[rgba(212,165,116,0.12)]">
                <Calendar size={24} className="text-[#d4a574]" />
              </div>
              <p className="text-sm font-medium">No upcoming inspections</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-3 overflow-y-auto">
              {upcomingInspections.map(inspection => (
                <div
                  key={inspection.id}
                  className="flex items-center gap-4 p-3 rounded-2xl bg-[rgba(212,165,116,0.04)] border border-[rgba(212,165,116,0.12)] hover:bg-[rgba(212,165,116,0.08)] transition-colors cursor-pointer"
                  onClick={() => navigate(`/inspections/${inspection.id}`)}
                >
                  <div className="w-12 h-12 rounded-xl bg-white border border-[rgba(212,165,116,0.15)] flex flex-col items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold text-[#d4a574] uppercase leading-none">
                      {formatInspectionDate(inspection.date).split(' ')[0]}
                    </span>
                    <span className="text-lg font-extrabold text-[#2a2420] leading-none">
                      {formatInspectionDate(inspection.date).split(' ')[1]}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-[#2a2420] truncate">{inspection.operationName}</div>
                    <div className="text-xs text-[#8b7355] mt-0.5">{inspection.status}</div>
                  </div>
                  <ArrowRight size={14} className="text-[#d4a574] shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Note (Spans 5 cols) */}
        <div className="col-span-12 lg:col-span-5 luxury-card rounded-[24px] p-6 flex flex-col min-h-[320px]">
          <div className="flex items-center gap-2 mb-4">
            <Edit3 size={18} className="text-[#d4a574]" />
            <h2 className="text-base font-bold text-[#2a2420]">Quick Note</h2>
          </div>
          <div className="flex-1 relative">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              className="w-full h-full resize-none luxury-input border-dashed rounded-2xl p-4 text-sm text-[#7a6b5a] focus:outline-none focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A]/50 transition-all"
              placeholder="Type your notes here"
            />
            <div className="absolute bottom-4 right-4 flex items-center gap-2">
              {noteSaved && (
                <span className="text-[10px] text-emerald-500 font-medium uppercase tracking-wider">Saved!</span>
              )}
              {savingNote && (
                <Loader2 size={14} className="animate-spin text-[#a89b8c]" />
              )}
              <button
                onClick={handleSaveNote}
                disabled={savingNote || !noteText.trim()}
                className="p-1.5 text-[#D49A6A] bg-[#D49A6A]/10 rounded-md hover:bg-[#D49A6A]/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Check size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Tasks & Follow-ups (Spans 6 cols) */}
        <div className="col-span-12 lg:col-span-6 min-h-[280px]">
          <TasksWidget />
        </div>

        {/* Uploads (Spans 6 cols) */}
        <div className="col-span-12 lg:col-span-6 luxury-card rounded-[24px] p-6 flex flex-col min-h-[280px]">
          <div className="flex justify-between items-center mb-5">
            <div className="flex items-center gap-2">
              <CloudUpload size={18} className="text-[#d4a574]" />
              <h2 className="text-base font-bold text-[#2a2420]">Uploads</h2>
              {unassignedUploads.length > 0 && (
                <span className="bg-[#D49A6A] text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                  {unassignedUploads.length}
                </span>
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="luxury-btn text-white text-xs font-semibold px-3 py-1.5 rounded-lg border-0 cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CloudUpload size={13} />
              Upload
            </button>
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
            onChange={handleFileSelect}
          />

          {/* Upload progress bar */}
          {uploading && (
            <div className="mb-4">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-xs text-[#8b7355] font-medium">Uploading…</span>
                <span className="text-xs font-bold text-[#D49A6A]">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-[rgba(212,165,116,0.12)] rounded-full h-2">
                <div
                  className="bg-[#D49A6A] h-2 rounded-full transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Hint text */}
          {unassignedUploads.length > 0 && !uploading && (
            <p className="text-[10px] text-[#a89b8c] mb-3">
              Click an item to assign it to an operation or process as a receipt.
            </p>
          )}

          {/* File list or empty state */}
          {!uploading && unassignedUploads.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-[#a89b8c]">
              <div className="mb-3">
                <CloudUpload size={36} className="text-[#d4a574]" strokeWidth={1.5} />
              </div>
              <p className="text-sm font-medium text-[#7a6b5a]">No unassigned uploads</p>
              <p className="text-xs mt-1">Captures from Mobile Hub appear here</p>
            </div>
          ) : unassignedUploads.length > 0 ? (
            <div className="flex-1 flex flex-col gap-2 overflow-y-auto">
              {unassignedUploads.map(file => {
                const { Icon, color } = getFileIcon(file.fileType);
                return (
                  <button
                    key={file.id}
                    onClick={() => setSelectedUpload(file)}
                    className="flex items-center gap-3 p-2.5 rounded-xl bg-[rgba(212,165,116,0.04)] border border-[rgba(212,165,116,0.12)] hover:bg-[rgba(212,165,116,0.06)] hover:border-[rgba(212,165,116,0.3)] transition-colors group text-left w-full"
                  >
                    <div className="w-8 h-8 rounded-lg bg-white border border-[rgba(212,165,116,0.15)] flex items-center justify-center shrink-0">
                      <Icon size={16} className={color} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-[#2a2420] truncate">{file.fileName}</div>
                      <div className="text-[10px] text-[#a89b8c] mt-0.5">
                        Unassigned{file.fileSize ? ` · ${formatFileSize(file.fileSize)}` : ''}
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-1">
                      <span className="text-[10px] font-semibold text-[#d4a574] opacity-0 group-hover:opacity-100 transition-opacity">
                        Process
                      </span>
                      <ArrowRight size={12} className="text-[#d4a574] opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

      </div>

      {/* Process Upload Modal */}
      {selectedUpload && (
        <ProcessUploadModal
          upload={selectedUpload}
          operations={operations}
          onClose={() => setSelectedUpload(null)}
          onProcessed={() => setSelectedUpload(null)}
        />
      )}
    </div>
  );
}
