import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { HardDrive, FolderOpen, ExternalLink, RefreshCw, AlertCircle, Loader } from 'lucide-react';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
  webViewLink?: string;
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';

export default function Drive() {
  const { googleAccessToken } = useAuth();
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [currentFolderName, setCurrentFolderName] = useState('DIOS Master Inspections Database');
  const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const token = googleAccessToken || localStorage.getItem('googleAccessToken');

  const listFolder = async (folderId: string, folderName: string) => {
    if (!token || token === 'dummy') return;
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
      setCurrentFolderName(folderName);
    } catch (err: any) {
      setError(err.message || 'Failed to list files.');
    } finally {
      setLoading(false);
    }
  };

  const loadRoot = async () => {
    if (!token || token === 'dummy') {
      setError('Please sign in with Google to browse Drive files.');
      return;
    }
    setLoading(true);
    setError(null);
    setFolderStack([]);
    try {
      // Find the DIOS master folder
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
      const rootFolder = data.files[0];
      setFolderStack([{ id: rootFolder.id, name: rootFolder.name }]);
      await listFolder(rootFolder.id, rootFolder.name);
      setInitialized(true);
    } catch (err: any) {
      setError(err.message || 'Failed to connect to Google Drive.');
      setLoading(false);
    }
  };

  const openFolder = async (file: DriveFile) => {
    setFolderStack(prev => [...prev, { id: file.id, name: file.name }]);
    await listFolder(file.id, file.name);
  };

  const navigateToStack = async (index: number) => {
    const newStack = folderStack.slice(0, index + 1);
    setFolderStack(newStack);
    const folder = newStack[newStack.length - 1];
    await listFolder(folder.id, folder.name);
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
      <div className="flex justify-between items-end mb-8">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-stone-100">
            <HardDrive size={24} className="text-[#D49A6A]" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight">Google Drive</h1>
            <p className="text-stone-500 text-sm mt-1">Browse your DIOS inspection files.</p>
          </div>
        </div>
        <button
          onClick={loadRoot}
          disabled={loading}
          className="px-4 py-2 bg-white border border-stone-200 text-stone-700 rounded-xl text-sm font-medium hover:bg-stone-50 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-60"
        >
          {loading ? <Loader size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          {initialized ? 'Refresh' : 'Load Drive Files'}
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {!initialized && !loading && !error && (
        <div className="bg-white rounded-3xl p-12 border border-stone-100 shadow-sm flex flex-col items-center justify-center text-center">
          <div className="w-20 h-20 bg-stone-100 rounded-3xl flex items-center justify-center mb-6">
            <HardDrive size={36} className="text-stone-400" />
          </div>
          <h2 className="text-xl font-bold text-stone-900 mb-2">Connect to Google Drive</h2>
          <p className="text-stone-500 text-sm max-w-sm mb-6">
            Browse your DIOS inspection files, reports, and receipts stored in Google Drive.
            Sign in with Google and click "Load Drive Files" to get started.
          </p>
          <button
            onClick={loadRoot}
            className="px-6 py-2.5 bg-[#D49A6A] hover:bg-[#c28a5c] text-white rounded-xl text-sm font-medium transition-colors shadow-sm"
          >
            Load Drive Files
          </button>
        </div>
      )}

      {initialized && (
        <div className="bg-white rounded-3xl border border-stone-100 shadow-sm overflow-hidden">
          {/* Breadcrumb */}
          <div className="px-6 py-4 border-b border-stone-100 flex items-center gap-2 flex-wrap">
            {folderStack.map((folder, index) => (
              <span key={folder.id} className="flex items-center gap-2">
                {index > 0 && <span className="text-stone-300">/</span>}
                <button
                  onClick={() => navigateToStack(index)}
                  className={`text-sm font-medium transition-colors ${
                    index === folderStack.length - 1
                      ? 'text-stone-900 cursor-default'
                      : 'text-[#D49A6A] hover:text-[#c28a5c]'
                  }`}
                >
                  {folder.name}
                </button>
              </span>
            ))}
          </div>

          {/* File List */}
          {loading ? (
            <div className="py-12 flex items-center justify-center text-stone-500">
              <Loader size={24} className="animate-spin mr-3" /> Loading files...
            </div>
          ) : files.length === 0 ? (
            <div className="py-12 text-center text-stone-500 text-sm">This folder is empty.</div>
          ) : (
            <div className="divide-y divide-stone-100">
              {files.map(file => (
                <div
                  key={file.id}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-stone-50 transition-colors group"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    file.mimeType === FOLDER_MIME ? 'bg-amber-50' : 'bg-blue-50'
                  }`}>
                    {file.mimeType === FOLDER_MIME
                      ? <FolderOpen size={20} className="text-amber-600" />
                      : <HardDrive size={20} className="text-blue-600" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    {file.mimeType === FOLDER_MIME ? (
                      <button
                        onClick={() => openFolder(file)}
                        className="text-sm font-medium text-stone-900 hover:text-[#D49A6A] transition-colors truncate block text-left"
                      >
                        {file.name}
                      </button>
                    ) : (
                      <span className="text-sm font-medium text-stone-900 truncate block">{file.name}</span>
                    )}
                    <div className="text-xs text-stone-400 mt-0.5">
                      {formatDate(file.modifiedTime)}{file.size ? ` · ${formatSize(file.size)}` : ''}
                    </div>
                  </div>
                  {file.webViewLink && (
                    <a
                      href={file.webViewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-[#D49A6A] transition-all"
                    >
                      <ExternalLink size={16} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
