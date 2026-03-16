import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '@dios/shared/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { HardDrive, FolderOpen, ExternalLink, RefreshCw, AlertCircle, Loader, FileText, Image, FileSpreadsheet, File, Upload } from 'lucide-react';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
  webViewLink?: string;
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';

function getFileIcon(mimeType: string) {
  if (mimeType === FOLDER_MIME) return { Icon: FolderOpen, bg: 'bg-amber-50', color: 'text-amber-600' };
  if (mimeType.includes('image')) return { Icon: Image, bg: 'bg-purple-50', color: 'text-purple-600' };
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return { Icon: FileSpreadsheet, bg: 'bg-green-50', color: 'text-green-600' };
  if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('word')) return { Icon: FileText, bg: 'bg-blue-50', color: 'text-blue-600' };
  return { Icon: File, bg: 'bg-[rgba(212,165,116,0.04)]', color: 'text-[#8b7355]' };
}

export default function Drive() {
  const { user, googleAccessToken, isLocalUser } = useAuth();
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Upload state
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const token = googleAccessToken || sessionStorage.getItem('googleAccessToken');

  const currentFolderId = folderStack.length > 0 ? folderStack[folderStack.length - 1].id : null;

  const listFolder = async (folderId: string, folderName: string) => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const q = `'${folderId}' in parents and trashed=false`;
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,modifiedTime,size,webViewLink)&orderBy=folder,name`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error(`Drive API error: ${res.status}`);
      const data = await res.json();
      setFiles(data.files || []);
      setFolderStack(prev => {
        const existing = prev.find(f => f.id === folderId);
        if (existing) return prev;
        return [...prev, { id: folderId, name: folderName }];
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to list files.');
    } finally {
      setLoading(false);
    }
  };

  const loadRoot = async () => {
    if (!token) {
      setError('Please sign in with Google to browse Drive files.');
      return;
    }
    setLoading(true);
    setError(null);
    setFolderStack([]);

    try {
      let rootFolderId: string | null = null;
      const rootFolderName = 'DIOS Master Inspections Database';

      // Try to get masterId from Firestore (saved by driveSync.initializeDriveHierarchy)
      if (user && db) {
        try {
          const configRef = doc(db, `users/${user.uid}/system_settings/config`);
          const configSnap = await getDoc(configRef);
          if (configSnap.exists()) {
            const folders = configSnap.data()?.driveFolders;
            rootFolderId = folders?.masterId ?? null;
          }
        } catch {
          // Ignore Firestore errors; fall back to Drive name search
        }
      }

      // Fall back to searching Drive by folder name
      if (!rootFolderId) {
        const q = `name='DIOS Master Inspections Database' and mimeType='${FOLDER_MIME}' and 'root' in parents and trashed=false`;
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) throw new Error(`Drive API error: ${res.status}`);
        const data = await res.json();
        if (!data.files || data.files.length === 0) {
          setError('DIOS Master Inspections Database folder not found. Run the Drive setup from Settings to create it.');
          setLoading(false);
          return;
        }
        rootFolderId = data.files[0].id;
      }

      setFolderStack([{ id: rootFolderId, name: rootFolderName }]);
      // List folder contents without pushing to stack again
      const q = `'${rootFolderId}' in parents and trashed=false`;
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,modifiedTime,size,webViewLink)&orderBy=folder,name`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error(`Drive API error: ${res.status}`);
      const data = await res.json();
      setFiles(data.files || []);
      setInitialized(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to connect to Google Drive.');
    } finally {
      setLoading(false);
    }
  };

  // Auto-load on mount if token is available
  useEffect(() => {
    if (token && !initialized) {
      loadRoot();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const openFolder = async (file: DriveFile) => {
    const newStack = [...folderStack, { id: file.id, name: file.name }];
    setFolderStack(newStack);
    setLoading(true);
    setError(null);
    try {
      const q = `'${file.id}' in parents and trashed=false`;
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,modifiedTime,size,webViewLink)&orderBy=folder,name`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error(`Drive API error: ${res.status}`);
      const data = await res.json();
      setFiles(data.files || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to open folder.');
    } finally {
      setLoading(false);
    }
  };

  const navigateToStack = async (index: number) => {
    const newStack = folderStack.slice(0, index + 1);
    setFolderStack(newStack);
    const folder = newStack[newStack.length - 1];
    setLoading(true);
    setError(null);
    try {
      const q = `'${folder.id}' in parents and trashed=false`;
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,modifiedTime,size,webViewLink)&orderBy=folder,name`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error(`Drive API error: ${res.status}`);
      const data = await res.json();
      setFiles(data.files || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to navigate.');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadToDrive = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token || !currentFolderId) return;
    e.target.value = '';

    setUploading(true);
    setUploadProgress(0);
    setUploadError(null);

    try {
      // Build multipart/related body for Google Drive API upload
      const boundary = `dios_upload_${Date.now()}`;
      const metadata = JSON.stringify({
        name: file.name,
        parents: [currentFolderId],
      });

      // Read file as ArrayBuffer
      const fileBuffer = await file.arrayBuffer();

      // Construct multipart body
      const encoder = new TextEncoder();
      const metaPart = encoder.encode(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`
      );
      const filePart = encoder.encode(
        `--${boundary}\r\nContent-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`
      );
      const ending = encoder.encode(`\r\n--${boundary}--`);

      const body = new Uint8Array(
        metaPart.byteLength + filePart.byteLength + fileBuffer.byteLength + ending.byteLength
      );
      body.set(metaPart, 0);
      body.set(filePart, metaPart.byteLength);
      body.set(new Uint8Array(fileBuffer), metaPart.byteLength + filePart.byteLength);
      body.set(ending, metaPart.byteLength + filePart.byteLength + fileBuffer.byteLength);

      // Use XMLHttpRequest to track progress
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink');
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.setRequestHeader('Content-Type', `multipart/related; boundary=${boundary}`);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setUploadProgress(Math.round((event.loaded / event.total) * 100));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Drive upload failed: ${xhr.status} ${xhr.statusText}`));
          }
        };

        xhr.onerror = () => reject(new Error('Network error during Drive upload.'));
        xhr.send(body);
      });

      // Refresh folder listing to show new file
      const q = `'${currentFolderId}' in parents and trashed=false`;
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,modifiedTime,size,webViewLink)&orderBy=folder,name`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
      }
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const formatSize = (size?: string) => {
    if (!size) return '';
    const bytes = parseInt(size);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return iso;
    }
  };

  return (
    <div className="animate-in fade-in duration-500">
      {isLocalUser && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
          <span className="text-amber-500 mt-0.5">⚠️</span>
          <div>
            <p className="font-medium text-amber-800">Google Drive requires cloud setup</p>
            <p className="text-sm text-amber-700 mt-0.5">You're running in local mode. Configure Firebase and Google OAuth in Settings → Data &amp; Integrations to enable Drive access.</p>
          </div>
        </div>
      )}
      <div className="flex justify-between items-end mb-8">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 luxury-card rounded-2xl flex items-center justify-center">
            <HardDrive size={24} className="text-[#d4a574]" />
          </div>
          <div>
            <h1 className="font-serif-display text-[36px] font-semibold text-[#2a2420] tracking-tight">Google Drive</h1>
            <p className="text-[#8b7355] text-sm font-medium mt-1">Browse your DIOS Master Inspections Database.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {initialized && currentFolderId && (
            <>
              <input
                ref={uploadInputRef}
                type="file"
                className="hidden"
                onChange={handleUploadToDrive}
              />
              <button
                onClick={() => uploadInputRef.current?.click()}
                disabled={uploading || !token}
                className="px-4 py-2 luxury-btn text-white rounded-xl text-sm font-bold border-0 cursor-pointer transition-colors flex items-center gap-2 shadow-sm disabled:opacity-60"
              >
                {uploading ? (
                  <>
                    <Loader size={16} className="animate-spin" />
                    {uploadProgress}%
                  </>
                ) : (
                  <>
                    <Upload size={16} />
                    Upload to Drive
                  </>
                )}
              </button>
            </>
          )}
          <button
            onClick={loadRoot}
            disabled={loading}
            className="px-4 py-2 bg-white border border-[rgba(212,165,116,0.15)] text-[#4a4038] rounded-xl text-sm font-medium hover:bg-[rgba(212,165,116,0.04)] transition-colors flex items-center gap-2 shadow-sm disabled:opacity-60"
          >
            {loading ? <Loader size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {initialized ? 'Refresh' : 'Load Drive Files'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {uploadError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span className="text-sm">Upload failed: {uploadError}</span>
        </div>
      )}

      {/* Upload progress bar */}
      {uploading && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-amber-800">Uploading to Drive…</span>
            <span className="text-sm font-bold text-amber-700">{uploadProgress}%</span>
          </div>
          <div className="w-full bg-amber-100 rounded-full h-2">
            <div
              className="bg-[#d4a574] h-2 rounded-full transition-all duration-200"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {!initialized && !loading && !error && (
        <div className="luxury-card rounded-[24px] p-12 flex flex-col items-center justify-center text-center">
          <div className="w-20 h-20 bg-[rgba(212,165,116,0.06)] rounded-[24px] flex items-center justify-center mb-6">
            <HardDrive size={36} className="text-[#a89b8c]" />
          </div>
          <h2 className="text-xl font-bold text-[#2a2420] mb-2">Connect to Google Drive</h2>
          <p className="text-[#8b7355] text-sm max-w-sm mb-6">
            Browse your DIOS inspection files, reports, and receipts stored in Google Drive.
            Sign in with Google and click "Load Drive Files" to get started.
          </p>
          <button
            onClick={loadRoot}
            className="px-6 py-2.5 luxury-btn text-white rounded-xl text-sm font-bold border-0 cursor-pointer transition-colors shadow-sm"
          >
            Load Drive Files
          </button>
        </div>
      )}

      {loading && !initialized && (
        <div className="luxury-card rounded-[24px] p-12 flex flex-col items-center justify-center">
          <Loader size={32} className="animate-spin text-[#d4a574] mb-4" />
          <p className="text-[#8b7355] text-sm">Connecting to Google Drive…</p>
        </div>
      )}

      {initialized && (
        <div className="luxury-card rounded-[24px] overflow-hidden">
          {/* Breadcrumb */}
          <div className="px-6 py-4 border-b border-[rgba(212,165,116,0.12)] flex items-center gap-1.5 flex-wrap">
            {folderStack.map((folder, index) => (
              <span key={folder.id} className="flex items-center gap-1.5">
                {index > 0 && <span className="text-[#a89b8c] text-sm">/</span>}
                <button
                  onClick={() => navigateToStack(index)}
                  className={`text-sm font-medium transition-colors px-1.5 py-0.5 rounded-lg ${
                    index === folderStack.length - 1
                      ? 'text-[#2a2420] bg-[rgba(212,165,116,0.06)] cursor-default'
                      : 'text-[#d4a574] hover:text-[#c28a5c] hover:bg-amber-50'
                  }`}
                >
                  {folder.name}
                </button>
              </span>
            ))}
          </div>

          {/* File count */}
          {!loading && (
            <div className="px-6 py-2 border-b border-[rgba(212,165,116,0.06)] text-xs text-[#a89b8c]">
              {files.length} {files.length === 1 ? 'item' : 'items'}
            </div>
          )}

          {/* File List */}
          {loading ? (
            <div className="py-12 flex items-center justify-center text-[#8b7355]">
              <Loader size={24} className="animate-spin mr-3" /> Loading…
            </div>
          ) : files.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-[#8b7355] text-sm mb-4">This folder is empty.</p>
              {currentFolderId && (
                <button
                  onClick={() => uploadInputRef.current?.click()}
                  disabled={uploading || !token}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#d4a574]/10 hover:bg-[#d4a574]/20 text-[#d4a574] rounded-xl text-sm font-medium transition-colors"
                >
                  <Upload size={15} />
                  Upload a file
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-[rgba(212,165,116,0.06)]">
              {files.map(file => {
                const { Icon, bg, color } = getFileIcon(file.mimeType);
                return (
                  <div
                    key={file.id}
                    className="flex items-center gap-4 px-6 py-3.5 hover:bg-[rgba(212,165,116,0.04)] transition-colors group"
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${bg}`}>
                      <Icon size={20} className={color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      {file.mimeType === FOLDER_MIME ? (
                        <button
                          onClick={() => openFolder(file)}
                          className="text-sm font-medium text-[#2a2420] hover:text-[#d4a574] transition-colors truncate block text-left"
                        >
                          {file.name}
                        </button>
                      ) : (
                        <span className="text-sm font-medium text-[#2a2420] truncate block">{file.name}</span>
                      )}
                      <div className="text-xs text-[#a89b8c] mt-0.5">
                        {formatDate(file.modifiedTime)}{file.size ? ` · ${formatSize(file.size)}` : ''}
                      </div>
                    </div>
                    {file.webViewLink && (
                      <a
                        href={file.webViewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open in Google Drive"
                        className="opacity-0 group-hover:opacity-100 p-2 text-[#a89b8c] hover:text-[#d4a574] hover:bg-amber-50 rounded-lg transition-all"
                      >
                        <ExternalLink size={15} />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
