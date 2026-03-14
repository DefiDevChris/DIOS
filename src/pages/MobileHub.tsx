import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Camera, RefreshCw, Upload, X, CheckCircle } from 'lucide-react';
import { queueFile } from '../lib/syncQueue';
import { useBackgroundSync } from '../contexts/BackgroundSyncContext';
import Swal from 'sweetalert2';

export default function MobileHub() {
  const { user } = useAuth();
  const { triggerSync } = useBackgroundSync();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);

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
    setImageFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUpload = async () => {
    if (!imageFile || !user) return;
    setUploading(true);

    try {
      const year = new Date().getFullYear();
      const fileName = `${Date.now()}_${imageFile.name || 'capture.jpg'}`;

      await queueFile(imageFile, { fileName, year, uid: user.uid });

      setSuccess(true);

      // Trigger background sync immediately if online
      triggerSync();

      setTimeout(() => {
        setImageFile(null);
        setSuccess(false);
      }, 3000);
    } catch (error) {
      console.error('Upload failed:', error);
      Swal.fire({ text: 'Upload failed. Please try again.', icon: 'error' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[85vh] max-h-[800px]">

        {/* Header */}
        <div className="bg-[#D49A6A] text-white p-4 flex justify-center items-center shrink-0">
          <h1 className="font-bold tracking-wider uppercase text-sm">Mobile Field Hub</h1>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-stone-50 relative">

          {success ? (
            <div className="flex flex-col items-center justify-center text-emerald-600 animate-in fade-in zoom-in duration-300">
              <CheckCircle size={64} className="mb-4" />
              <h2 className="text-xl font-bold">Upload Complete</h2>
              <p className="text-sm text-stone-500 mt-2 text-center">Saved offline. Will sync when connected.</p>
            </div>
          ) : previewUrl ? (
            <div className="w-full h-full flex flex-col relative animate-in fade-in duration-300">
              <img
                src={previewUrl}
                alt="Preview"
                className="w-full h-full object-contain bg-black rounded-2xl"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center">
              <div className="w-24 h-24 bg-stone-200 rounded-full flex items-center justify-center mb-6 text-stone-400">
                <Camera size={48} />
              </div>
              <h2 className="text-xl font-bold text-stone-800 mb-2">Capture Image</h2>
              <p className="text-stone-500 text-sm max-w-[250px]">
                Take a photo of a receipt or document to upload to the master database.
              </p>
            </div>
          )}

          {/* Hidden File Input */}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
          />

        </div>

        {/* Controls Area */}
        <div className="bg-white p-6 border-t border-stone-200 shrink-0">
          {!previewUrl && !success ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-4 bg-[#D49A6A] hover:bg-[#c28a5c] text-white rounded-2xl font-bold text-lg flex items-center justify-center gap-2 transition-colors active:scale-[0.98]"
            >
              <Camera size={24} />
              Open Camera
            </button>
          ) : previewUrl && !success ? (
            <div className="flex gap-3">
              <button
                onClick={handleCancel}
                disabled={uploading}
                className="flex-1 py-3 bg-stone-100 text-stone-600 rounded-xl font-medium flex flex-col items-center justify-center gap-1 hover:bg-stone-200 transition-colors disabled:opacity-50"
              >
                <X size={20} />
                <span className="text-xs">Cancel</span>
              </button>

              <button
                onClick={handleRetake}
                disabled={uploading}
                className="flex-1 py-3 bg-stone-100 text-stone-600 rounded-xl font-medium flex flex-col items-center justify-center gap-1 hover:bg-stone-200 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={20} />
                <span className="text-xs">Retake</span>
              </button>

              <button
                onClick={handleUpload}
                disabled={uploading}
                className="flex-[2] py-3 bg-[#D49A6A] text-white rounded-xl font-bold flex flex-col items-center justify-center gap-1 hover:bg-[#c28a5c] transition-colors disabled:opacity-70"
              >
                {uploading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Upload size={20} />
                )}
                <span className="text-xs">{uploading ? 'Uploading...' : 'Upload'}</span>
              </button>
            </div>
          ) : null}
        </div>

      </div>
    </div>
  );
}
