import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Camera, RefreshCw, Upload, X, CheckCircle, FileText } from 'lucide-react';
import { queueFile, processQueue } from '../lib/syncQueue';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

interface ReceiptScannerProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function ReceiptScanner({ onClose, onSuccess }: ReceiptScannerProps) {
  const { user, googleAccessToken } = useAuth();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Manual fields for the expense entry
  const [vendor, setVendor] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (imageFile) {
      const url = URL.createObjectURL(imageFile);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(null);
    }
  }, [imageFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setImageFile(e.target.files[0]);
      setSuccess(false);
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
    if (!uploading) {
      onClose();
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || (!imageFile && !vendor && !amount)) return;
    setUploading(true);

    try {
      let fileName = null;
      let driveFileId = null;

      if (imageFile) {
        const year = new Date(date).getFullYear();
        fileName = `${Date.now()}_${imageFile.name || 'receipt.jpg'}`;

        // In a real app we might wait for the queue to process or get an ID,
        // but since it's offline-first, we'll store the filename as a reference
        // and later link it when synced. For now, we queue it.
        await queueFile(imageFile, { fileName, year, uid: user.uid });
        driveFileId = fileName; // Placeholder for actual Drive ID after sync
      }

      // Add to expenses collection
      await addDoc(collection(db, 'users', user.uid, 'expenses'), {
        vendor,
        amount: parseFloat(amount) || 0,
        date,
        notes,
        receiptFileName: fileName,
        receiptFileId: driveFileId, // Might be updated later via sync background task
        createdAt: serverTimestamp(),
      });

      setSuccess(true);

      if (googleAccessToken) {
        processQueue(googleAccessToken);
      }

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

  return (
    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-[#D49A6A] text-white px-6 py-4 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <FileText size={20} />
            <h2 className="font-bold tracking-wider uppercase text-sm">Add Receipt</h2>
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
            <div className="flex flex-col md:flex-row gap-6">

              {/* Left Side: Image Capture/Preview */}
              <div className="w-full md:w-1/2 flex flex-col gap-4">
                <div className="aspect-[3/4] bg-stone-200 rounded-2xl overflow-hidden border-2 border-dashed border-stone-300 flex flex-col items-center justify-center relative">
                  {previewUrl ? (
                    <>
                      <img src={previewUrl} alt="Receipt Preview" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={handleRetake}
                          className="bg-white text-stone-900 px-4 py-2 rounded-xl font-medium flex items-center gap-2"
                        >
                          <RefreshCw size={18} />
                          Retake
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="text-center p-6 flex flex-col items-center">
                      <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 text-stone-400 shadow-sm">
                        <Camera size={32} />
                      </div>
                      <p className="text-sm text-stone-500 font-medium mb-4">Take a photo of the receipt</p>
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
              </div>

              {/* Right Side: Manual Entry Form */}
              <div className="w-full md:w-1/2">
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
                      rows={2}
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
              disabled={uploading || (!imageFile && (!vendor || !amount))}
              className="bg-[#D49A6A] hover:bg-[#c28a5c] text-white px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {uploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Saving...
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
