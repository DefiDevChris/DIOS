import { useState, useEffect, useRef } from 'react';
import { ArrowRight, Calendar, CloudUpload, Edit3, Check, Loader2, X, FileText, Image, File } from 'lucide-react';
import { format } from 'date-fns';
import TasksWidget from '../components/TasksWidget';
import ProcessUploadModal, { UnassignedUpload } from '../components/ProcessUploadModal';
import { useAuth } from '../contexts/AuthContext';
import { db, storage } from '@dios/shared/firebase';
import { collection, query, where, orderBy, limit, getDocs, addDoc, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useNavigate } from 'react-router';
import { logger } from '@dios/shared';

interface UpcomingInspection {
  id: string;
  date: string;
  status: string;
  operationId: string;
  operationName: string;
}

interface Operation {
  id: string;
  name: string;
}

function getFileIcon(fileType: string) {
  if (fileType.startsWith('image/')) return { Icon: Image, color: 'text-purple-500' };
  if (fileType === 'application/pdf') return { Icon: FileText, color: 'text-blue-500' };
  return { Icon: File, color: 'text-stone-400' };
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

  const [upcomingInspections, setUpcomingInspections] = useState<UpcomingInspection[]>([]);
  const [loadingInspections, setLoadingInspections] = useState(true);

  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  // Uploads state
  const [unassignedUploads, setUnassignedUploads] = useState<UnassignedUpload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [selectedUpload, setSelectedUpload] = useState<UnassignedUpload | null>(null);

  // Fetch upcoming inspections (future dates, ordered ascending)
  useEffect(() => {
    if (!user || !db) {
      setLoadingInspections(false);
      return;
    }

    const fetchUpcoming = async () => {
      setLoadingInspections(true);
      try {
        const todayStr = today.toISOString().split('T')[0];

        const inspSnap = await getDocs(
          query(
            collection(db, `users/${user.uid}/inspections`),
            where('date', '>=', todayStr),
            orderBy('date', 'asc'),
            limit(5)
          )
        );

        const rawInspections = inspSnap.docs.map(d => ({
          id: d.id,
          ...(d.data() as { date: string; status: string; operationId: string }),
          operationName: '',
        }));

        if (rawInspections.length === 0) {
          setUpcomingInspections([]);
          return;
        }

        const opsSnap = await getDocs(collection(db, `users/${user.uid}/operations`));
        const opNames: Record<string, string> = {};
        opsSnap.forEach(d => {
          opNames[d.id] = (d.data() as { name: string }).name;
        });

        setUpcomingInspections(
          rawInspections.map(i => ({
            ...i,
            operationName: opNames[i.operationId] ?? 'Unknown Operation',
          }))
        );
      } catch (error) {
        logger.error('Error fetching upcoming inspections:', error);
      } finally {
        setLoadingInspections(false);
      }
    };

    fetchUpcoming();
  }, [user]);

  // Fetch operations for the processing modal
  useEffect(() => {
    if (!user || !db) return;
    const unsub = onSnapshot(
      collection(db, `users/${user.uid}/operations`),
      (snap) => {
        setOperations(snap.docs.map(d => ({ id: d.id, name: (d.data() as { name: string }).name })));
      }
    );
    return () => unsub();
  }, [user]);

  // Fetch unassigned uploads (last 6, most recent first)
  useEffect(() => {
    if (!user || !db) return;
    const unsub = onSnapshot(
      query(
        collection(db, `users/${user.uid}/unassigned_uploads`),
        orderBy('uploadedAt', 'desc'),
        limit(6)
      ),
      (snap) => {
        setUnassignedUploads(snap.docs.map(d => ({ id: d.id, ...d.data() } as UnassignedUpload)));
      }
    );
    return () => unsub();
  }, [user]);

  const handleSaveNote = async () => {
    if (!user || !db || !noteText.trim()) return;
    setSavingNote(true);
    try {
      await addDoc(collection(db, `users/${user.uid}/notes`), {
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
    if (!file || !user || !storage || !db) return;
    e.target.value = '';

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
              await addDoc(collection(db, `users/${user.uid}/unassigned_uploads`), {
                fileName: file.name,
                storagePath,
                downloadURL,
                fileType: file.type,
                fileSize: file.size,
                uploadedAt: new Date().toISOString(),
              });
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
          <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight">Good Morning</h1>
          <p className="mt-2 text-stone-500 text-sm">Here's what's happening with your certification operations today.</p>
        </div>
        <div className="flex items-center gap-2 text-stone-500 text-sm font-medium">
          <Calendar size={16} className="text-[#D49A6A]" />
          {format(today, 'EEEE, MMMM d, yyyy')}
        </div>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-12 gap-6">

        {/* Upcoming Inspections (Spans 7 cols) */}
        <div className="col-span-12 lg:col-span-7 bg-white rounded-3xl p-6 shadow-sm border border-stone-100 flex flex-col min-h-[320px]">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-base font-bold text-stone-900">Upcoming Inspections</h2>
            <button
              onClick={() => navigate('/schedule')}
              className="text-stone-400 hover:text-[#D49A6A] transition-colors"
            >
              <ArrowRight size={18} />
            </button>
          </div>

          {loadingInspections ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 size={24} className="animate-spin text-stone-300" />
            </div>
          ) : upcomingInspections.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-stone-400">
              <div className="w-12 h-12 bg-stone-50 rounded-xl flex items-center justify-center mb-3 border border-stone-100">
                <Calendar size={24} className="text-stone-300" />
              </div>
              <p className="text-sm font-medium">No upcoming inspections</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-3 overflow-y-auto">
              {upcomingInspections.map(inspection => (
                <div
                  key={inspection.id}
                  className="flex items-center gap-4 p-3 rounded-2xl bg-stone-50 border border-stone-100 hover:bg-stone-100 transition-colors cursor-pointer"
                  onClick={() => navigate(`/inspections/${inspection.id}`)}
                >
                  <div className="w-12 h-12 rounded-xl bg-white border border-stone-200 flex flex-col items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold text-[#D49A6A] uppercase leading-none">
                      {formatInspectionDate(inspection.date).split(' ')[0]}
                    </span>
                    <span className="text-lg font-extrabold text-stone-900 leading-none">
                      {formatInspectionDate(inspection.date).split(' ')[1]}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-stone-900 truncate">{inspection.operationName}</div>
                    <div className="text-xs text-stone-500 mt-0.5">{inspection.status}</div>
                  </div>
                  <ArrowRight size={14} className="text-stone-300 shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Note (Spans 5 cols) */}
        <div className="col-span-12 lg:col-span-5 bg-white rounded-3xl p-6 shadow-sm border border-stone-100 flex flex-col min-h-[320px]">
          <div className="flex items-center gap-2 mb-4">
            <Edit3 size={18} className="text-[#D49A6A]" />
            <h2 className="text-base font-bold text-stone-900">Quick Note</h2>
          </div>
          <div className="flex-1 relative">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              className="w-full h-full resize-none bg-[#FDFCFB] border border-stone-200 border-dashed rounded-2xl p-4 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A]/50 transition-all"
              placeholder="Type your notes here"
            />
            <div className="absolute bottom-4 right-4 flex items-center gap-2">
              {noteSaved && (
                <span className="text-[10px] text-emerald-500 font-medium uppercase tracking-wider">Saved!</span>
              )}
              {savingNote && (
                <Loader2 size={14} className="animate-spin text-stone-400" />
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
        <div className="col-span-12 lg:col-span-6 bg-white rounded-3xl p-6 shadow-sm border border-stone-100 flex flex-col min-h-[280px]">
          <div className="flex justify-between items-center mb-5">
            <div className="flex items-center gap-2">
              <CloudUpload size={18} className="text-[#D49A6A]" />
              <h2 className="text-base font-bold text-stone-900">Uploads</h2>
              {unassignedUploads.length > 0 && (
                <span className="bg-[#D49A6A] text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                  {unassignedUploads.length}
                </span>
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#D49A6A] hover:bg-[#c28a5c] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                <span className="text-xs text-stone-500 font-medium">Uploading…</span>
                <span className="text-xs font-bold text-[#D49A6A]">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-stone-100 rounded-full h-2">
                <div
                  className="bg-[#D49A6A] h-2 rounded-full transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Hint text */}
          {unassignedUploads.length > 0 && !uploading && (
            <p className="text-[10px] text-stone-400 mb-3">
              Click an item to assign it to an operation or process as a receipt.
            </p>
          )}

          {/* File list or empty state */}
          {!uploading && unassignedUploads.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-stone-400">
              <div className="mb-3">
                <CloudUpload size={36} className="text-stone-300" strokeWidth={1.5} />
              </div>
              <p className="text-sm font-medium text-stone-500">No unassigned uploads</p>
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
                    className="flex items-center gap-3 p-2.5 rounded-xl bg-stone-50 border border-stone-100 hover:bg-amber-50 hover:border-[#D49A6A]/30 transition-colors group text-left w-full"
                  >
                    <div className="w-8 h-8 rounded-lg bg-white border border-stone-200 flex items-center justify-center shrink-0">
                      <Icon size={16} className={color} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-stone-800 truncate">{file.fileName}</div>
                      <div className="text-[10px] text-stone-400 mt-0.5">
                        Unassigned · {formatFileSize(file.fileSize)}
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-1">
                      <span className="text-[10px] font-semibold text-[#D49A6A] opacity-0 group-hover:opacity-100 transition-opacity">
                        Process
                      </span>
                      <ArrowRight size={12} className="text-stone-300 opacity-0 group-hover:opacity-100 transition-opacity" />
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
