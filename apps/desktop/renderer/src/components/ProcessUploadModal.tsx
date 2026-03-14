import { useState } from 'react';
import { logger } from '@dios/shared';
import { createWorker } from 'tesseract.js';
import {
  X, ScanLine, ChevronDown, CheckCircle, Upload, Loader2, Check,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '@dios/shared/firebase';
import {
  collection, addDoc, serverTimestamp, doc, deleteDoc,
} from 'firebase/firestore';
import { queueFile } from '../lib/syncQueue';
import { useBackgroundSync } from '../contexts/BackgroundSyncContext';
import { parseOcrText } from './ReceiptScanner';
import Swal from 'sweetalert2';

export interface UnassignedUpload {
  id: string;
  fileName: string;
  storagePath: string;
  downloadURL: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
}

interface Operation {
  id: string;
  name: string;
}

interface ProcessUploadModalProps {
  upload: UnassignedUpload;
  operations: Operation[];
  onClose: () => void;
  onProcessed: () => void;
}

type Phase = 'assign' | 'scanning' | 'expense-form' | 'processing' | 'success';

export default function ProcessUploadModal({
  upload,
  operations,
  onClose,
  onProcessed,
}: ProcessUploadModalProps) {
  const { user } = useAuth();
  const { triggerSync } = useBackgroundSync();

  const [phase, setPhase] = useState<Phase>('assign');
  const [selectedOpId, setSelectedOpId] = useState('');
  const [isReceipt, setIsReceipt] = useState(false);
  const [ocrStatus, setOcrStatus] = useState('');

  // Expense form state
  const [vendor, setVendor] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const isImage = upload.fileType.startsWith('image/');
  const selectedOp = operations.find(o => o.id === selectedOpId);
  const canClose = phase !== 'scanning' && phase !== 'processing' && !saving;

  const handleProcess = async () => {
    if (!user) return;

    if (isReceipt) {
      setPhase('scanning');
      setOcrStatus('Initializing OCR…');
      let worker;
      try {
        const response = await fetch(upload.downloadURL);
        const blob = await response.blob();

        worker = await createWorker('eng', 1, {
          logger: (m: { status: string; progress: number }) => {
            if (m.status === 'recognizing text') {
              setOcrStatus(`Scanning… ${Math.round(m.progress * 100)}%`);
            } else {
              setOcrStatus(m.status.charAt(0).toUpperCase() + m.status.slice(1) + '…');
            }
          },
        });

        const { data } = await worker.recognize(blob);
        const parsed = parseOcrText(data.text);

        if (parsed.vendor) setVendor(parsed.vendor);
        if (parsed.amount) setAmount(parsed.amount);
        if (parsed.date) setDate(parsed.date);

        setPhase('expense-form');
      } catch (err) {
        logger.error('OCR failed:', err);
        setOcrStatus('OCR failed – please fill in manually.');
        setPhase('expense-form');
      } finally {
        if (worker) await worker.terminate();
      }
    } else {
      setPhase('processing');
      try {
        const response = await fetch(upload.downloadURL);
        const blob = await response.blob();
        const year = new Date().getFullYear();
        const folderName = selectedOp?.name ?? 'Unassigned Uploads';

        await queueFile(blob, {
          fileName: upload.fileName,
          year,
          uid: user.uid,
          folderName,
        });

        await deleteDoc(doc(db, `users/${user.uid}/unassigned_uploads`, upload.id));

        triggerSync();
        setPhase('success');
        setTimeout(() => { onProcessed(); onClose(); }, 1500);
      } catch (err) {
        logger.error('Processing failed:', err);
        Swal.fire({ text: 'Processing failed. Please try again.', icon: 'error' });
        setPhase('assign');
      }
    }
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !vendor || !amount) return;
    setSaving(true);

    try {
      const response = await fetch(upload.downloadURL);
      const blob = await response.blob();

      const expenseRef = await addDoc(collection(db, 'users', user.uid, 'expenses'), {
        vendor,
        amount: parseFloat(amount) || 0,
        date,
        notes,
        receiptFileName: upload.fileName,
        receiptFileId: null,
        createdAt: serverTimestamp(),
      });

      const year = new Date(date).getFullYear();
      await queueFile(blob, {
        fileName: upload.fileName,
        year,
        uid: user.uid,
        folderName: 'Receipts',
        firestoreDocPath: `users/${user.uid}/expenses/${expenseRef.id}`,
        firestoreField: 'receiptFileId',
      });

      await deleteDoc(doc(db, `users/${user.uid}/unassigned_uploads`, upload.id));

      triggerSync();
      setPhase('success');
      setTimeout(() => { onProcessed(); onClose(); }, 1500);
    } catch (err) {
      logger.error('Save failed:', err);
      Swal.fire({ text: 'Failed to save receipt. Please try again.', icon: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="bg-[#D49A6A] text-white px-6 py-4 flex justify-between items-center shrink-0">
          <h2 className="font-bold tracking-wider uppercase text-sm">Process Upload</h2>
          <button
            onClick={onClose}
            disabled={!canClose}
            className="text-white/80 hover:text-white transition-colors p-1 disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-stone-50">

          {phase === 'success' ? (
            <div className="flex flex-col items-center justify-center text-emerald-600 h-48 animate-in zoom-in duration-300">
              <CheckCircle size={48} className="mb-3" />
              <p className="font-bold text-lg">Processed Successfully</p>
            </div>

          ) : phase === 'scanning' ? (
            <div className="flex flex-col items-center justify-center h-48 gap-4">
              <ScanLine size={36} className="text-[#D49A6A] animate-pulse" />
              <p className="text-sm text-stone-600 text-center px-4">{ocrStatus}</p>
            </div>

          ) : phase === 'processing' ? (
            <div className="flex flex-col items-center justify-center h-48 gap-4">
              <Loader2 size={36} className="text-[#D49A6A] animate-spin" />
              <p className="text-sm text-stone-600">Moving file to Drive…</p>
            </div>

          ) : phase === 'assign' ? (
            <div className="flex flex-col gap-5">

              {/* Image preview */}
              {isImage && (
                <div className="w-full rounded-2xl overflow-hidden bg-stone-100 max-h-64 flex items-center justify-center">
                  <img
                    src={upload.downloadURL}
                    alt={upload.fileName}
                    className="max-h-64 object-contain"
                  />
                </div>
              )}

              <div>
                <p className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-1">File</p>
                <p className="text-sm text-stone-700 font-medium truncate">{upload.fileName}</p>
              </div>

              {/* Operation picker */}
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5">
                  Assign to Operation
                </label>
                <div className="relative">
                  <select
                    value={selectedOpId}
                    onChange={(e) => setSelectedOpId(e.target.value)}
                    className="w-full appearance-none bg-white border border-stone-200 rounded-xl px-3 py-2.5 text-sm pr-8 focus:outline-none focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A]"
                  >
                    <option value="">No operation (unassigned)</option>
                    {operations.map(op => (
                      <option key={op.id} value={op.id}>{op.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
                </div>
              </div>

              {/* Receipt checkbox (images only) */}
              {isImage && (
                <label className="flex items-center gap-3 cursor-pointer group select-none">
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors shrink-0 ${
                      isReceipt
                        ? 'bg-[#D49A6A] border-[#D49A6A]'
                        : 'border-stone-300 group-hover:border-[#D49A6A]'
                    }`}
                    onClick={() => setIsReceipt(v => !v)}
                  >
                    {isReceipt && <Check size={12} className="text-white" />}
                  </div>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={isReceipt}
                    onChange={e => setIsReceipt(e.target.checked)}
                  />
                  <div>
                    <p className="text-sm font-semibold text-stone-800">Is this a receipt?</p>
                    <p className="text-xs text-stone-500">OCR will extract vendor, date, and amount automatically</p>
                  </div>
                </label>
              )}
            </div>

          ) : phase === 'expense-form' ? (
            <div className="flex flex-col md:flex-row gap-6">

              {/* Image preview */}
              <div className="w-full md:w-2/5 shrink-0">
                <div className="aspect-[3/4] bg-stone-200 rounded-2xl overflow-hidden flex items-center justify-center">
                  <img
                    src={upload.downloadURL}
                    alt="Receipt"
                    className="w-full h-full object-contain"
                  />
                </div>
                {ocrStatus && ocrStatus !== 'Done' && (
                  <p className="text-xs text-amber-600 text-center mt-2">{ocrStatus}</p>
                )}
              </div>

              {/* Expense form */}
              <div className="flex-1">
                <form id="expense-form" onSubmit={handleSaveExpense} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5">Date</label>
                    <input
                      type="date"
                      required
                      value={date}
                      onChange={e => setDate(e.target.value)}
                      className="w-full bg-white border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5">Vendor / Payee</label>
                    <input
                      type="text"
                      required
                      value={vendor}
                      onChange={e => setVendor(e.target.value)}
                      placeholder="e.g., Home Depot"
                      className="w-full bg-white border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5">Amount ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-white border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5">Notes (Optional)</label>
                    <textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      rows={3}
                      placeholder="What was this for?"
                      className="w-full bg-white border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all resize-none"
                    />
                  </div>
                </form>
              </div>

            </div>
          ) : null}

        </div>

        {/* Footer */}
        {(phase === 'assign' || phase === 'expense-form') && (
          <div className="bg-white px-6 py-4 border-t border-stone-100 flex justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-5 py-2.5 text-sm font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-xl transition-colors disabled:opacity-50"
            >
              Cancel
            </button>

            {phase === 'assign' ? (
              <button
                onClick={handleProcess}
                className="bg-[#D49A6A] hover:bg-[#c28a5c] text-white px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors shadow-sm"
              >
                {isReceipt
                  ? <><ScanLine size={16} /> Scan Receipt</>
                  : <><Upload size={16} /> Process File</>
                }
              </button>
            ) : (
              <button
                type="submit"
                form="expense-form"
                disabled={saving || !vendor || !amount}
                className="bg-[#D49A6A] hover:bg-[#c28a5c] text-white px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <><Loader2 size={16} className="animate-spin" /> Saving…</>
                ) : (
                  <><Upload size={16} /> Save Expense</>
                )}
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
