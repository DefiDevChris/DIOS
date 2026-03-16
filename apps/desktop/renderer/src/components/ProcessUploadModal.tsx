import { useState } from 'react';
import { logger } from '@dios/shared';
import { createWorker } from 'tesseract.js';
import {
  X, ScanLine, ChevronDown, CheckCircle, Upload, Loader2, Check,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useDatabase } from '../hooks/useDatabase';
import { queueFile } from '../lib/syncQueue';
import { useBackgroundSync } from '../contexts/BackgroundSyncContext';
import { parseOcrText } from './ReceiptScanner';
import Swal from 'sweetalert2';
import type { Expense, UnassignedUpload } from '@dios/shared/types';

// Re-export the shared type for backward compatibility
export type { UnassignedUpload };

// Local interface extending the shared type with additional UI-specific fields
interface UnassignedUploadUI extends UnassignedUpload {
  /** URL from Firestore; falls back to fileUrl from shared type */
  downloadURL?: string;
  storagePath?: string;
  fileSize?: number;
}

interface Operation {
  id: string;
  name: string;
}

interface ProcessUploadModalProps {
  upload: UnassignedUploadUI;
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
  const { save: saveExpense } = useDatabase<Expense>({ table: 'expenses' });
  const { remove: removeUpload } = useDatabase<UnassignedUpload>({ table: 'unassigned_uploads' });
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
  const uploadUrl = upload.downloadURL || upload.fileUrl;

  const handleProcess = async () => {
    if (!user) return;

    if (isReceipt) {
      setPhase('scanning');
      setOcrStatus('Initializing OCR…');
      let worker;
      try {
        const response = await fetch(uploadUrl);
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
        const response = await fetch(uploadUrl);
        const blob = await response.blob();
        const year = new Date().getFullYear();
        const folderName = selectedOp?.name ?? 'Unassigned Uploads';

        await queueFile(blob, {
          fileName: upload.fileName,
          year,
          uid: user.uid,
          folderName,
        });

        await removeUpload(upload.id);

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
      const response = await fetch(uploadUrl);
      const blob = await response.blob();

      const expenseId = crypto.randomUUID();
      await saveExpense({
        id: expenseId,
        vendor,
        amount: parseFloat(amount) || 0,
        date,
        notes,
        receiptFileId: undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        syncStatus: 'pending',
      });

      const year = new Date(date).getFullYear();
      await queueFile(blob, {
        fileName: upload.fileName,
        year,
        uid: user.uid,
        folderName: 'Receipts',
        firestoreDocPath: `users/${user.uid}/expenses/${expenseId}`,
        firestoreField: 'receiptFileId',
      });

      await removeUpload(upload.id);

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
    <div className="luxury-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="luxury-modal-card rounded-[28px] w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div
          className="px-6 py-4 flex justify-between items-center shrink-0"
          style={{
            background: 'linear-gradient(135deg, rgba(212,165,116,0.12) 0%, rgba(212,165,116,0.05) 100%)',
            borderBottom: '1px solid rgba(212,165,116,0.15)',
          }}
        >
          <h2 className="font-serif-display text-xl font-semibold text-[#2a2420]">Process Upload</h2>
          <button
            onClick={onClose}
            disabled={!canClose}
            className="text-[#a89b8c] hover:text-[#2a2420] transition-colors p-1 disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">

          {phase === 'success' ? (
            <div className="flex flex-col items-center justify-center text-[#d4a574] h-48 animate-in zoom-in duration-300">
              <div className="luxury-check-orb checked mb-3">
                <CheckCircle size={48} />
              </div>
              <p className="font-serif-display font-semibold text-lg text-[#2a2420]">Processed Successfully</p>
            </div>

          ) : phase === 'scanning' ? (
            <div className="flex flex-col items-center justify-center h-48 gap-4">
              <div className="luxury-icon-pill">
                <ScanLine size={36} className="text-[#d4a574] animate-pulse" />
              </div>
              <p className="text-sm text-[#7a6b5a] font-body text-center px-4">{ocrStatus}</p>
            </div>

          ) : phase === 'processing' ? (
            <div className="flex flex-col items-center justify-center h-48 gap-4">
              <div className="luxury-icon-pill">
                <Loader2 size={36} className="text-[#d4a574] animate-spin" />
              </div>
              <p className="text-sm text-[#7a6b5a] font-body">Moving file to Drive…</p>
            </div>

          ) : phase === 'assign' ? (
            <div className="flex flex-col gap-5">

              {/* Image preview */}
              {isImage && (
                <div className="w-full rounded-[20px] overflow-hidden max-h-64 flex items-center justify-center" style={{ border: '1px solid rgba(212,165,116,0.15)' }}>
                  <img
                    src={uploadUrl}
                    alt={upload.fileName}
                    className="max-h-64 object-contain"
                  />
                </div>
              )}

              <div>
                <p className="text-xs font-bold text-[#8b7355] uppercase tracking-wider mb-2 font-body">File</p>
                <p className="text-sm text-[#2a2420] font-medium font-body truncate">{upload.fileName}</p>
              </div>

              {/* Operation picker */}
              <div>
                <label className="block text-xs font-bold text-[#8b7355] uppercase tracking-wider mb-2 font-body">
                  Assign to Operation
                </label>
                <div className="relative">
                  <select
                    value={selectedOpId}
                    onChange={(e) => setSelectedOpId(e.target.value)}
                    className="luxury-input w-full appearance-none rounded-2xl px-4 py-3 text-sm font-body outline-none pr-8"
                  >
                    <option value="">No operation (unassigned)</option>
                    {operations.map(op => (
                      <option key={op.id} value={op.id}>{op.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#a89b8c] pointer-events-none" />
                </div>
              </div>

              {/* Receipt checkbox (images only) */}
              {isImage && (
                <label className="flex items-center gap-3 cursor-pointer group select-none">
                  <div
                    className={`luxury-check-orb${isReceipt ? ' checked' : ''}`}
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
                    <p className="text-sm font-semibold text-[#2a2420] font-body">Is this a receipt?</p>
                    <p className="text-xs text-[#a89b8c] font-body">OCR will extract vendor, date, and amount automatically</p>
                  </div>
                </label>
              )}
            </div>

          ) : phase === 'expense-form' ? (
            <div className="flex flex-col md:flex-row gap-6">

              {/* Image preview */}
              <div className="w-full md:w-2/5 shrink-0">
                <div className="aspect-[3/4] rounded-[20px] overflow-hidden flex items-center justify-center" style={{ border: '1px solid rgba(212,165,116,0.15)' }}>
                  <img
                    src={uploadUrl}
                    alt="Receipt"
                    className="w-full h-full object-contain"
                  />
                </div>
                {ocrStatus && ocrStatus !== 'Done' && (
                  <p className="text-xs text-[#d4a574] font-body text-center mt-2">{ocrStatus}</p>
                )}
              </div>

              {/* Expense form */}
              <div className="flex-1">
                <form id="expense-form" onSubmit={handleSaveExpense} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-[#8b7355] uppercase tracking-wider mb-2 font-body">Date</label>
                    <input
                      type="date"
                      required
                      value={date}
                      onChange={e => setDate(e.target.value)}
                      className="luxury-input w-full rounded-2xl px-4 py-3 text-sm font-body outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#8b7355] uppercase tracking-wider mb-2 font-body">Vendor / Payee</label>
                    <input
                      type="text"
                      required
                      value={vendor}
                      onChange={e => setVendor(e.target.value)}
                      placeholder="e.g., Home Depot"
                      className="luxury-input w-full rounded-2xl px-4 py-3 text-sm font-body outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#8b7355] uppercase tracking-wider mb-2 font-body">Amount ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="luxury-input w-full rounded-2xl px-4 py-3 text-sm font-body outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#8b7355] uppercase tracking-wider mb-2 font-body">Notes (Optional)</label>
                    <textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      rows={3}
                      placeholder="What was this for?"
                      className="luxury-input w-full rounded-2xl px-4 py-3 text-sm font-body outline-none resize-none"
                    />
                  </div>
                </form>
              </div>

            </div>
          ) : null}

        </div>

        {/* Footer */}
        {(phase === 'assign' || phase === 'expense-form') && (
          <div
            className="px-6 py-4 flex justify-end gap-3 shrink-0"
            style={{
              background: 'linear-gradient(135deg, rgba(212,165,116,0.06) 0%, rgba(212,165,116,0.02) 100%)',
              borderTop: '1px solid rgba(212,165,116,0.15)',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="luxury-btn-secondary px-5 py-3.5 text-sm font-semibold text-[#7a6b5a] rounded-2xl disabled:opacity-50"
            >
              Cancel
            </button>

            {phase === 'assign' ? (
              <button
                onClick={handleProcess}
                className="luxury-btn text-white px-8 py-3.5 rounded-2xl text-sm font-bold border-0 cursor-pointer flex items-center gap-2"
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
                className="luxury-btn text-white px-8 py-3.5 rounded-2xl text-sm font-bold border-0 cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
