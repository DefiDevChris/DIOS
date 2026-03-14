import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { configStore } from '../lib/configStore';
import { ArrowRight, Calendar, CheckSquare, CloudUpload, Edit3, Check, X, FileText, Tag, DollarSign, UploadCloud, FileImage } from 'lucide-react';
import { format } from 'date-fns';
import TasksWidget from '../components/TasksWidget';

export default function Dashboard() {
  const { user, googleAccessToken } = useAuth();
  const [unassignedFiles, setUnassignedFiles] = useState<any[]>([]);
  const [loadingUploads, setLoadingUploads] = useState(true);
  const [selectedTriageFile, setSelectedTriageFile] = useState<any>(null);
  const [operations, setOperations] = useState<any[]>([]);
  const [selectedOperationId, setSelectedOperationId] = useState('');
  const [isTriaging, setIsTriaging] = useState(false);
  const [ocrData, setOcrData] = useState<any>(null);

  useEffect(() => {
    const fetchUploads = async () => {
      if (!googleAccessToken) {
        setLoadingUploads(false);
        return;
      }

      try {
        const folderResponse = await fetch("https://www.googleapis.com/drive/v3/files?q=name='Unassigned Uploads' and mimeType='application/vnd.google-apps.folder'", {
          headers: { Authorization: `Bearer ${googleAccessToken}` }
        });
        const folderData = await folderResponse.json();

        if (folderData.files && folderData.files.length > 0) {
          const folderId = folderData.files[0].id;
          const filesResponse = await fetch(`https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and trashed=false&fields=files(id,name,mimeType,thumbnailLink,webContentLink)`, {
            headers: { Authorization: `Bearer ${googleAccessToken}` }
          });
          const filesData = await filesResponse.json();

          if (filesData.files) {
            setUnassignedFiles(filesData.files);
          }
        }
      } catch (error) {
        console.error("Error fetching unassigned uploads:", error);
      } finally {
        setLoadingUploads(false);
      }
    };

    fetchUploads();
  }, [googleAccessToken]);

  useEffect(() => {
    if (user && selectedTriageFile) {
      const fetchOperations = async () => {
        const opsRef = collection(db, 'users', user.uid, 'operations');
        const snapshot = await getDocs(opsRef);
        const ops = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setOperations(ops);
        if (ops.length > 0) setSelectedOperationId(ops[0].id);
      };
      fetchOperations();
    }
  }, [user, selectedTriageFile]);

  const handleAssignToOperation = async () => {
    if (!selectedTriageFile || !selectedOperationId || !user || !googleAccessToken) return;
    setIsTriaging(true);

    try {
      const operation = operations.find(o => o.id === selectedOperationId);
      if (!operation) throw new Error("Operation not found");

      let operationFolderId = '';
      const folderRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=name='${encodeURIComponent(operation.name)}' and mimeType='application/vnd.google-apps.folder'&fields=files(id)`, {
        headers: { Authorization: `Bearer ${googleAccessToken}` }
      });
      const folderData = await folderRes.json();

      if (folderData.files && folderData.files.length > 0) {
        operationFolderId = folderData.files[0].id;
      } else {
        const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${googleAccessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: operation.name,
            mimeType: 'application/vnd.google-apps.folder'
          })
        });
        const createData = await createRes.json();
        operationFolderId = createData.id;
      }

      const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${selectedTriageFile.id}?fields=parents`, {
        headers: { Authorization: `Bearer ${googleAccessToken}` }
      });
      const fileData = await fileRes.json();
      const previousParents = fileData.parents?.join(',') || '';

      await fetch(`https://www.googleapis.com/drive/v3/files/${selectedTriageFile.id}?addParents=${operationFolderId}&removeParents=${previousParents}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${googleAccessToken}` }
      });

      const docRef = doc(collection(db, 'users', user.uid, 'operations', selectedOperationId, 'documents'));
      await setDoc(docRef, {
        name: selectedTriageFile.name,
        size: selectedTriageFile.size || 0,
        type: selectedTriageFile.mimeType,
        uploadedAt: new Date().toISOString(),
        url: selectedTriageFile.webContentLink || `https://drive.google.com/file/d/${selectedTriageFile.id}/view`
      });

      setUnassignedFiles(prev => prev.filter(f => f.id !== selectedTriageFile.id));
      setSelectedTriageFile(null);
    } catch (error) {
      console.error("Error assigning to operation:", error);
      alert("Failed to assign file to operation.");
    } finally {
      setIsTriaging(false);
    }
  };

  const handleMarkAsReceipt = async () => {
    if (!selectedTriageFile || !user || !googleAccessToken) return;
    setIsTriaging(true);

    try {
      const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${selectedTriageFile.id}?alt=media`, {
        headers: { Authorization: `Bearer ${googleAccessToken}` }
      });
      const blob = await fileRes.blob();

      const toBase64 = (file: Blob) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = error => reject(error);
      });

      const base64Image = await toBase64(blob);

      const apiKey = configStore.getConfig()?.firebaseConfig.apiKey;
      if (!apiKey) throw new Error("Firebase API Key not found for Vision API");

      const visionRes = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: base64Image },
              features: [{ type: 'DOCUMENT_TEXT_DETECTION' }]
            }
          ]
        })
      });

      const visionData = await visionRes.json();
      const text = visionData.responses[0]?.fullTextAnnotation?.text || '';

      const dateMatch = text.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/);
      const amountMatch = text.match(/\$?\d+\.\d{2}/g);
      const firstLine = text.split('\n')[0] || '';

      let maxAmount = 0;
      if (amountMatch) {
        amountMatch.forEach((amt: string) => {
          const num = parseFloat(amt.replace('$', ''));
          if (num > maxAmount) maxAmount = num;
        });
      }

      setOcrData({
        vendor: firstLine.slice(0, 100).trim(),
        date: dateMatch ? dateMatch[0] : format(new Date(), 'MM/dd/yyyy'),
        amount: maxAmount,
        category: 'Meals'
      });
    } catch (error) {
      console.error("OCR Error:", error);
      alert("Failed to process image with OCR.");
    } finally {
      setIsTriaging(false);
    }
  };


  const handleSaveExpense = async () => {
    if (!selectedTriageFile || !user || !googleAccessToken || !ocrData) return;
    setIsTriaging(true);

    try {
      // 1. Fetch or create "Receipts" folder in Drive
      let receiptsFolderId = '';
      const folderRes = await fetch("https://www.googleapis.com/drive/v3/files?q=name='Receipts' and mimeType='application/vnd.google-apps.folder'&fields=files(id)", {
        headers: { Authorization: `Bearer ${googleAccessToken}` }
      });
      const folderData = await folderRes.json();

      if (folderData.files && folderData.files.length > 0) {
        receiptsFolderId = folderData.files[0].id;
      } else {
        const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${googleAccessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: 'Receipts',
            mimeType: 'application/vnd.google-apps.folder'
          })
        });
        const createData = await createRes.json();
        receiptsFolderId = createData.id;
      }

      // 2. Move file to Receipts folder
      const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${selectedTriageFile.id}?fields=parents`, {
        headers: { Authorization: `Bearer ${googleAccessToken}` }
      });
      const fileData = await fileRes.json();
      const previousParents = fileData.parents?.join(',') || '';

      await fetch(`https://www.googleapis.com/drive/v3/files/${selectedTriageFile.id}?addParents=${receiptsFolderId}&removeParents=${previousParents}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${googleAccessToken}` }
      });

      // 3. Save Expense to Firestore
      const expenseId = crypto.randomUUID();
      const expenseRef = doc(collection(db, 'users', user.uid, 'expenses'), expenseId);

      let amountNum = parseFloat(ocrData.amount);
      if (isNaN(amountNum)) amountNum = 0;

      await setDoc(expenseRef, {
        id: expenseId,
        date: new Date(ocrData.date).toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
        vendor: ocrData.vendor || 'Unknown Vendor',
        category: ocrData.category,
        amount: amountNum,
        driveFileId: selectedTriageFile.id,
        isOcrGenerated: true
      });

      // 4. Update UI
      setUnassignedFiles(prev => prev.filter(f => f.id !== selectedTriageFile.id));
      setSelectedTriageFile(null);
      setOcrData(null);
    } catch (error) {
      console.error("Error saving expense:", error);
      alert("Failed to save expense.");
    } finally {
      setIsTriaging(false);
    }
  };


  const today = new Date();

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
            <button className="text-stone-400 hover:text-[#D49A6A] transition-colors">
              <ArrowRight size={18} />
            </button>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center text-stone-400">
            <div className="w-12 h-12 bg-stone-50 rounded-xl flex items-center justify-center mb-3 border border-stone-100">
              <Calendar size={24} className="text-stone-300" />
            </div>
            <p className="text-sm font-medium">No upcoming inspections</p>
          </div>
        </div>

        {/* Quick Note (Spans 5 cols) */}
        <div className="col-span-12 lg:col-span-5 bg-white rounded-3xl p-6 shadow-sm border border-stone-100 flex flex-col min-h-[320px]">
          <div className="flex items-center gap-2 mb-4">
            <Edit3 size={18} className="text-[#D49A6A]" />
            <h2 className="text-base font-bold text-stone-900">Quick Note</h2>
          </div>
          <div className="flex-1 relative">
            <textarea 
              className="w-full h-full resize-none bg-[#FDFCFB] border border-stone-200 border-dashed rounded-2xl p-4 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A]/50 transition-all"
              placeholder="Type your notes here"
            ></textarea>
            <div className="absolute bottom-4 right-4 flex items-center gap-2">
              <button className="p-1.5 text-stone-400 hover:text-stone-600 transition-colors">
                <Edit3 size={16} />
              </button>
              <button className="p-1.5 text-[#D49A6A] bg-[#D49A6A]/10 rounded-md hover:bg-[#D49A6A]/20 transition-colors">
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
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-2">
              <CloudUpload size={18} className="text-[#D49A6A]" />
              <h2 className="text-base font-bold text-stone-900">Uploads</h2>
            </div>
          </div>
          <div className="flex-1 flex flex-col overflow-y-auto max-h-[250px] pr-2">
            {loadingUploads ? (
              <div className="flex-1 flex flex-col items-center justify-center text-stone-400">
                <div className="w-5 h-5 border-2 border-[#D49A6A] border-t-transparent rounded-full animate-spin mb-2"></div>
                <p className="text-sm">Loading...</p>
              </div>
            ) : unassignedFiles.length > 0 ? (
              <div className="grid grid-cols-2 gap-4">
                {unassignedFiles.map(file => (
                  <div key={file.id} className="relative group rounded-xl overflow-hidden border border-stone-200 cursor-pointer hover:border-[#D49A6A] transition-colors aspect-square" onClick={() => setSelectedTriageFile(file)}>
                    {file.thumbnailLink ? (
                       <img src={file.thumbnailLink} alt={file.name} className="w-full h-full object-cover" />
                    ) : (
                       <div className="w-full h-full bg-stone-100 flex items-center justify-center text-stone-400">
                         <FileImage size={32} />
                       </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                       <span className="text-white text-sm font-bold shadow-sm">Triage</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-stone-400">
                <div className="mb-3">
                  <CloudUpload size={36} className="text-stone-300" strokeWidth={1.5} />
                </div>
                <p className="text-sm font-medium text-stone-500">No unassigned uploads</p>
                <p className="text-xs mt-1">Files in Drive "Unassigned Uploads" will appear here</p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Triage Modal */}
      {selectedTriageFile && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="bg-[#D49A6A] text-white p-4 flex justify-between items-center">
              <h3 className="font-bold text-lg">Document Triage</h3>
              <button onClick={() => { setSelectedTriageFile(null); setOcrData(null); setIsTriaging(false); }} className="text-white hover:text-stone-200">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex flex-col items-center">
                {selectedTriageFile.thumbnailLink ? (
                  <img src={selectedTriageFile.thumbnailLink.replace('=s220', '=s800')} alt="Preview" className="max-h-64 object-contain rounded-xl border border-stone-200" />
                ) : (
                  <div className="w-32 h-32 bg-stone-100 flex items-center justify-center text-stone-400 rounded-xl border border-stone-200">
                    <FileImage size={48} />
                  </div>
                )}
                <p className="mt-4 font-medium text-stone-900 text-center">{selectedTriageFile.name}</p>
              </div>

              {ocrData ? (
                 <div className="space-y-4">
                   <h4 className="font-bold text-stone-900 text-sm">Review OCR Data</h4>
                   <div>
                     <label className="block text-xs font-bold text-stone-500 mb-1">Vendor</label>
                     <input type="text" value={ocrData.vendor} onChange={(e) => setOcrData({...ocrData, vendor: e.target.value})} className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A]" />
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                     <div>
                       <label className="block text-xs font-bold text-stone-500 mb-1">Date</label>
                       <input type="text" value={ocrData.date} onChange={(e) => setOcrData({...ocrData, date: e.target.value})} className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A]" />
                     </div>
                     <div>
                       <label className="block text-xs font-bold text-stone-500 mb-1">Amount</label>
                       <input type="number" value={ocrData.amount} onChange={(e) => setOcrData({...ocrData, amount: parseFloat(e.target.value) || 0})} className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A]" />
                     </div>
                   </div>
                   <div>
                     <label className="block text-xs font-bold text-stone-500 mb-1">Category</label>
                     <select value={ocrData.category} onChange={(e) => setOcrData({...ocrData, category: e.target.value})} className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A]">
                        <option value="Meals">Meals</option>
                        <option value="Travel">Travel</option>
                        <option value="Supplies">Supplies</option>
                        <option value="Other">Other</option>
                     </select>
                   </div>
                   <button
                    onClick={handleSaveExpense}
                    disabled={isTriaging}
                    className="w-full py-2 bg-stone-900 text-white rounded-xl text-sm font-bold hover:bg-stone-800 disabled:opacity-50 transition-colors"
                  >
                    Save Expense
                  </button>
                 </div>
              ) : (
              <div className="space-y-4">
                <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-3">
                  <h4 className="font-bold text-stone-900 text-sm flex items-center gap-2">
                    <Tag size={16} className="text-[#D49A6A]" /> Option 1: Assign to Operation
                  </h4>
                  <select
                    value={selectedOperationId}
                    onChange={(e) => setSelectedOperationId(e.target.value)}
                    className="w-full bg-white border border-stone-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A]"
                  >
                    <option value="" disabled>Select an Operation...</option>
                    {operations.map(op => (
                      <option key={op.id} value={op.id}>{op.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleAssignToOperation}
                    disabled={isTriaging || !selectedOperationId}
                    className="w-full py-2 bg-stone-900 text-white rounded-xl text-sm font-bold hover:bg-stone-800 disabled:opacity-50 transition-colors"
                  >
                    Assign to Operation
                  </button>
                </div>

                <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-3">
                  <h4 className="font-bold text-stone-900 text-sm flex items-center gap-2">
                    <DollarSign size={16} className="text-[#D49A6A]" /> Option 2: Mark as Receipt
                  </h4>
                  <p className="text-xs text-stone-500">Run Vision AI to extract vendor, date, and amount.</p>
                  <button
                    onClick={handleMarkAsReceipt}
                    disabled={isTriaging}
                    className="w-full py-2 bg-white border-2 border-[#D49A6A] text-[#D49A6A] rounded-xl text-sm font-bold hover:bg-[#D49A6A]/10 disabled:opacity-50 transition-colors"
                  >
                    {isTriaging && !ocrData ? 'Running OCR...' : 'Run OCR & Mark as Receipt'}
                  </button>
                </div>
              </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
