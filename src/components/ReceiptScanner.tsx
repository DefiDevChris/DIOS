import { useState, useRef, useEffect } from 'react';
import { createWorker } from 'tesseract.js';
import { useAuth } from '../contexts/AuthContext';
import { Camera, RefreshCw, Upload, X, CheckCircle, FileText, ScanLine, PenLine } from 'lucide-react';
import { queueFile } from '../lib/syncQueue';
import { useBackgroundSync } from '../contexts/BackgroundSyncContext';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface ReceiptScannerProps {
  onClose: () => void;
  onSuccess: () => void;
  mode?: 'camera' | 'manual';
}

function parseOcrText(text: string): { date?: string; amount?: string; vendor?: string } {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const vendor = lines.find(l => l.length > 2 && !/^\d/.test(l)) ?? lines[0] ?? '';

  let date: string | undefined;

  const mdyMatch = text.match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\b/);
  if (mdyMatch) {
    const [, m, d, y] = mdyMatch;
    date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  if (!date) {
    const isoMatch = text.match(/\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/);
    if (isoMatch) {
      const [, y, m, d] = isoMatch;
      date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }

  if (!date) {
    const monthMap: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    };
    const longMatch = text.match(
      /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(\d{4})\b/i
    );
    if (longMatch) {
      const m = monthMap[longMatch[1].slice(0, 3).toLowerCase()];
      const d = longMatch[2].padStart(2, '0');
      date = `${longMatch[3]}-${m}-${d}`;
    }
  }

  let amount: string | undefined;

  const totalMatch = text.match(
    /(?:total|amount\s+due|balance\s+due|grand\s+total|sale\s+total|total\s+sale)[:\s]*\$?\s*([\d,]+\.\d{2})/i
  );
  if (totalMatch) {
    amount = totalMatch[1].replace(/,/g, '');
  }

  if (!amount) {
    const allMatches = [...text.matchAll(/\$\s*([\d,]+\.\d{2})/g)];
    if (allMatches.length > 0) {
      const values = allMatches.map(m => parseFloat(m[1].replace(/,/g, '')));
      amount = Math.max(...values).toFixed(2);
    }
  }

  return { vendor, date, amount };
}

export default function ReceiptScanner({ onClose, onSuccess, mode = 'camera' }: ReceiptScannerProps) {
  const { user, googleAccessToken } = useAuth();
  const { triggerSync } = useBackgroundSync();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);

  const [isScanning, setIsScanning] = useState(false);
  const [ocrStatus, setOcrStatus] = useState('');

  const [vendor, setVendor] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(imageFile);
    setPreviewUrl(url);

    let cancelled = false;
    const runOcr = async () => {
      setIsScanning(true);
      setOcrStatus('Initialising OCR…');
      let worker;
      try {
        worker = await createWorker('eng', 1, {
          logger: (m: { status: string; progress: number }) => {
            if (cancelled) return;
            if (m.status === 'recognizing text') {
              setOcrStatus(`Scanning… ${Math.round(m.progress * 100)}%`);
            } else {
              setOcrStatus(m.status.charAt(0).toUpperCase() + m.status.slice(1) + '…');
            }
          },
        });

        const { data: { text } } = await worker.recognize(imageFile);
        if (cancelled) return;

        const parsed = parseOcrText(text);

        if (parsed.vendor) setVendor(v => v || parsed.vendor!);
        if (parsed.amount) setAmount(a => a || parsed.amount!);
        if (parsed.date) setDate(parsed.date);

        setOcrStatus('Done');
      } catch (err) {
        if (!cancelled) {
          console.error('OCR failed:', err);
          setOcrStatus('OCR failed – please fill in manually.');
        }
      } finally {
        if (worker) await worker.terminate();
        if (!cancelled) setIsScanning(false);
      }
    };

    runOcr();

    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [imageFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setVendor('');
      setAmount('');
      setDate(new Date().toISOString().split('T')[0]);
      setNotes('');
      setSuccess(false);
      setImageFile(e.target.files[0]);
    }
  };

  const handleRetake = () => {
    setImageFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleCancel = () => {
    if (!uploading) onClose();
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || (!imageFile && !vendor && !amount)) return;
    setUploading(true);

    try {
      // Save expense record to Firestore first
      const expenseRef = await addDoc(collection(db, 'users', user.uid, 'expenses'), {
        vendor,
        amount: parseFloat(amount) || 0,
        date,
        notes,
        receiptFileName: null,
        receiptFileId: null,
        createdAt: serverTimestamp(),
      });

      if (imageFile) {
        const year = new Date(date).getFullYear();
        const fileName = `${Date.now()}_${imageFile.name || 'receipt.jpg'}`;

        await queueFile(imageFile, {
          fileName,
          year,
          uid: user.uid,
          firestoreDocPath: `users/${user.uid}/expenses/${expenseRef.id}`,
          firestoreField: 'receiptFileId',
        });

        await updateDoc(doc(db, 'users', user.uid, 'expenses', expenseRef.id), {
          receiptFileName: fileName,
        });
      }

      triggerSync();
      setSuccess(true);

      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to save receipt. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const isManualMode = mode === 'manual';
  const headerLabel = isManualMode ? 'Add Manually' : 'Capture Receipt';
  const HeaderIcon = isManualMode ? PenLine : Camera;

  return (
    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="bg-[#D49A6A] text-white px-6 py-4 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <HeaderIcon size={20} />
            <h2 className="font-bold tracking-wider uppercase text-sm">{headerLabel}</h2>
          </div>
          <button
            onClick={handleCancel}
            disabled={uploading}
            className="text-white/80 hover:text-white transition-colors p-1 disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-stone-50">
          {success ? (
            <div className="flex flex-col items-center justify-center text-emerald-600 h-64 animate-in zoom-in duration-300">
              <CheckCircle size={64} className="mb-4" />
              <h2 className="text-xl font-bold">Receipt Saved</h2>
            </div>
          ) : (
            <div className={`flex flex-col ${isManualMode ? '' : 'md:flex-row'} gap-6`}>

              {/* Left Side: Image Capture / Preview (camera mode only) */}
              {!isManualMode && (
                <div className="w-full md:w-1/2 flex flex-col gap-4">
                  <div className="aspect-[3/4] bg-stone-200 rounded-2xl overflow-hidden border-2 border-dashed border-stone-300 flex flex-col items-center justify-center relative">
                    {previewUrl ? (
                      <>
                        <img src={previewUrl} alt="Receipt Preview" className="w-full h-full object-cover" />

                        {isScanning && (
                          <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-3">
                            <ScanLine size={36} className="text-[#D49A6A] animate-pulse" />
                            <p className="text-white text-xs font-medium text-center px-4">{ocrStatus}</p>
                          </div>
                        )}

                        {!isScanning && (
                          <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-2 opacity-0 hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={handleRetake}
                              className="bg-white text-stone-900 px-4 py-2 rounded-xl font-medium flex items-center gap-2"
                            >
                              <RefreshCw size={18} />
                              Retake
                            </button>
                            {ocrStatus === 'Done' && (
                              <p className="text-white text-xs font-medium">Fields auto-filled from OCR</p>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-center p-6 flex flex-col items-center">
                        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 text-stone-400 shadow-sm">
                          <Camera size={32} />
                        </div>
                        <p className="text-sm text-stone-500 font-medium mb-1">Take a photo of the receipt</p>
                        <p className="text-xs text-stone-400 mb-4">OCR will auto-fill the form</p>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="bg-stone-800 hover:bg-stone-900 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors w-full"
                        >
                          Open Camera
                        </button>
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </div>

                  {ocrStatus && ocrStatus !== 'Done' && !isScanning && (
                    <p className="text-xs text-stone-400 text-center">{ocrStatus}</p>
                  )}
                  {ocrStatus === 'Done' && (
                    <p className="text-xs text-emerald-600 text-center font-medium">OCR complete – review and confirm fields</p>
                  )}
                </div>
              )}

              {/* Right Side: Manual Entry Form */}
              <div className={`w-full ${isManualMode ? '' : 'md:w-1/2'}`}>
                <form id="receipt-form" onSubmit={handleUpload} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5">Date</label>
                    <input
                      type="date"
                      required
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full bg-white border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5">Vendor / Payee</label>
                    <input
                      type="text"
                      required
                      value={vendor}
                      onChange={(e) => setVendor(e.target.value)}
                      placeholder="e.g., Home Depot"
                      className="w-full bg-white border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5">Amount ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-white border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5">Notes (Optional)</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      placeholder="What was this for?"
                      className="w-full bg-white border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all resize-none"
                    />
                  </div>
                </form>
              </div>

            </div>
          )}
        </div>

        {/* Footer Actions */}
        {!success && (
          <div className="bg-white px-6 py-4 border-t border-stone-100 flex justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={handleCancel}
              disabled={uploading}
              className="px-5 py-2.5 text-sm font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-xl transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="receipt-form"
              disabled={uploading || isScanning || (!isManualMode && !imageFile && (!vendor || !amount)) || (isManualMode && (!vendor || !amount))}
              className="bg-[#D49A6A] hover:bg-[#c28a5c] text-white px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {uploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Saving…
                </>
              ) : isScanning ? (
                <>
                  <ScanLine size={18} className="animate-pulse" />
                  Scanning…
                </>
              ) : (
                <>
                  <Upload size={18} />
                  Save Receipt
                </>
              )}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
