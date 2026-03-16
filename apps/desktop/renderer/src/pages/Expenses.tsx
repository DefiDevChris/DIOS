import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from 'react-router';
import { Wallet, Plus, Trash2, FileText, Search, Link as LinkIcon, DollarSign, Camera, Upload, PenLine, X, FolderOpen } from 'lucide-react';
import { logger, configStore } from '@dios/shared';
import ReceiptScanner from '../components/ReceiptScanner';
import { format } from 'date-fns';
import Swal from 'sweetalert2';
import { useDatabase } from '../hooks/useDatabase';
import type { Expense } from '@dios/shared/types';

// Extended Expense interface with local fields
type ExtendedExpense = Expense & {
  createdAt: string;
  receiptFileName?: string;
};

type ReceiptMode = 'camera' | 'manual' | 'uploads' | 'local-upload' | null;

export default function Expenses() {
  const { user, googleAccessToken, isLocalUser } = useAuth();
  const location = useLocation();

  // Database hooks
  const { findAll: findAllExpenses, remove: removeExpense, save: saveExpense } = useDatabase<ExtendedExpense>({ table: 'expenses' });

  const [expenses, setExpenses] = useState<ExtendedExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModeSelect, setShowModeSelect] = useState(false);
  const [receiptMode, setReceiptMode] = useState<ReceiptMode>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);
  const [unassignedFiles, setUnassignedFiles] = useState<Array<{id: string; name: string; mimeType: string; thumbnailLink?: string; createdTime: string}>>([]);
  const [loadingUploads, setLoadingUploads] = useState(false);
  const [assigningFileId, setAssigningFileId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchExpenses = async () => {
      try {
        const data = await findAllExpenses();
        // Sort by date desc, then createdAt desc
        const sorted = data.sort((a, b) => {
          const dateCompare = b.date.localeCompare(a.date);
          if (dateCompare !== 0) return dateCompare;
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        });
        setExpenses(sorted);
      } catch (error) {
        logger.error("Error fetching expenses:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchExpenses();
  }, [user, findAllExpenses]);

  // Auto-open "Add Receipt" modal when navigated here with ?new=1
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('new') === '1') {
      setShowModeSelect(true);
    }
  }, [location.search]);

  const confirmDelete = async () => {
    if (!user || !expenseToDelete || isLocalUser) {
      Swal.fire({ text: 'Cannot delete expense in offline mode.', icon: 'warning' });
      return;
    }

    try {
      const idToDelete = expenseToDelete;
      setExpenseToDelete(null);
      await removeExpense(idToDelete);
      // Refresh expenses list
      const updatedExpenses = await findAllExpenses();
      const sorted = updatedExpenses.sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });
      setExpenses(sorted);
    } catch (error) {
      logger.error('Error deleting expense:', error);
      Swal.fire({ text: 'Failed to delete expense.', icon: 'error' });
    }
  };

  const fetchUnassignedUploads = async () => {
    if (!user || !googleAccessToken || isLocalUser) return;
    setLoadingUploads(true);

    try {
      // Get Drive folder from config stored in Firestore
      const projectId = configStore.getConfig()?.firebaseConfig?.projectId || '';
      const configRes = await fetch(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${user.uid}/system_settings/config`,
        { headers: { Authorization: `Bearer ${await user.getIdToken()}` } }
      );

      let folderId: string | undefined;
      if (configRes.ok) {
        const configData = await configRes.json();
        folderId = configData.fields?.driveFolders?.mapValue?.fields?.unassignedId?.stringValue;
      }

      if (!folderId) {
        setUnassignedFiles([]);
        setLoadingUploads(false);
        return;
      }

      const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,thumbnailLink,createdTime)&orderBy=createdTime desc`,
        { headers: { Authorization: `Bearer ${googleAccessToken}` } }
      );

      if (!res.ok) throw new Error(`Drive API error: ${res.status}`);

      const data = await res.json();
      setUnassignedFiles(data.files || []);
    } catch (error) {
      logger.error('Failed to fetch unassigned uploads:', error);
      setUnassignedFiles([]);
      Swal.fire({ text: 'Could not load uploads from Drive. Check your Google connection.', icon: 'warning' });
    } finally {
      setLoadingUploads(false);
    }
  };

  const assignFileAsReceipt = async (file: { id: string; name: string }) => {
    if (!user || isLocalUser) {
      Swal.fire({ text: 'Cannot assign receipt in offline mode.', icon: 'warning' });
      return;
    }
    setAssigningFileId(file.id);

    try {
      // Get config
      const projectId = configStore.getConfig()?.firebaseConfig?.projectId || '';
      const configRes = await fetch(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${user.uid}/system_settings/config`,
        { headers: { Authorization: `Bearer ${await user.getIdToken()}` } }
      );

      let receiptsId: string | undefined;
      let unassignedId: string | undefined;
      if (configRes.ok) {
        const configData = await configRes.json();
        receiptsId = configData.fields?.driveFolders?.mapValue?.fields?.receiptsId?.stringValue;
        unassignedId = configData.fields?.driveFolders?.mapValue?.fields?.unassignedId?.stringValue;
      }

      if (receiptsId && unassignedId && googleAccessToken) {
        const moveResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files/${file.id}?addParents=${receiptsId}&removeParents=${unassignedId}`,
          {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${googleAccessToken}` },
          }
        );
        if (!moveResponse.ok) {
          const errorText = await moveResponse.text().catch(() => '');
          throw new Error(`Failed to move file in Drive: ${moveResponse.status} ${errorText}`);
        }
      }

      // Prompt user for vendor name so the expense record isn't blank
      const { value: vendor } = await Swal.fire({
        title: 'Expense Details',
        input: 'text',
        inputLabel: 'Vendor name',
        inputPlaceholder: 'e.g. Shell Gas Station',
        showCancelButton: true,
        inputValidator: (v) => (!v ? 'Please enter a vendor name' : null),
      });
      if (!vendor) return; // user cancelled

      await saveExpense({
        id: crypto.randomUUID(),
        vendor,
        amount: 0,
        date: new Date().toISOString().split('T')[0],
        notes: `From upload: ${file.name}`,
        receiptFileName: file.name,
        receiptFileId: file.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        syncStatus: 'pending',
      });

      // Refresh expenses list
      const updatedExpenses = await findAllExpenses();
      const sorted = updatedExpenses.sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });
      setExpenses(sorted);

      setUnassignedFiles(prev => prev.filter(f => f.id !== file.id));
      Swal.fire({ text: `Receipt "${file.name}" assigned successfully.`, icon: 'success', timer: 2000, showConfirmButton: false });
    } catch (error) {
      logger.error('Failed to assign receipt:', error);
      Swal.fire({ text: 'Failed to assign receipt.', icon: 'error' });
    } finally {
      setAssigningFileId(null);
    }
  };

  const filteredExpenses = expenses.filter(expense =>
    expense.vendor?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    expense.notes?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalAmount = filteredExpenses.reduce((sum, expense) => sum + (expense.amount || 0), 0);

  if (loading) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#d4a574]"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500">

      {/* Header section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="font-serif-display text-[36px] font-semibold text-[#2a2420] tracking-tight flex items-center gap-3">
            <Wallet className="text-[#d4a574]" size={32} />
            Expenses
          </h1>
          <p className="mt-2 text-[#8b7355] text-sm font-medium">Track your receipts and field expenses.</p>
        </div>

        <button
          onClick={() => setShowModeSelect(true)}
          className="luxury-btn text-white px-5 py-2.5 rounded-xl text-sm font-bold border-0 cursor-pointer flex items-center gap-2 transition-colors shadow-sm active:scale-95"
        >
          <Plus size={18} />
          Add Receipt
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="luxury-card rounded-[24px] p-6 flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
            <DollarSign size={24} />
          </div>
          <div>
            <p className="text-sm font-bold text-[#8b7355] uppercase tracking-wider">Total Expenses</p>
            <p className="text-2xl font-black text-[#2a2420]">${totalAmount.toFixed(2)}</p>
          </div>
        </div>
        <div className="luxury-card rounded-[24px] p-6 flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
            <FileText size={24} />
          </div>
          <div>
            <p className="text-sm font-bold text-[#8b7355] uppercase tracking-wider">Receipts</p>
            <p className="text-2xl font-black text-[#2a2420]">{filteredExpenses.length}</p>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="luxury-card rounded-[24px] overflow-hidden flex flex-col">

        {/* Toolbar */}
        <div className="p-4 border-b border-[rgba(212,165,116,0.12)] bg-[rgba(212,165,116,0.04)] flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a89b8c]" size={18} />
            <input
              type="text"
              placeholder="Search vendors or notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full luxury-input rounded-2xl py-2 pl-10 pr-4 text-sm outline-none"
            />
          </div>
        </div>

        {/* Expenses List */}
        {filteredExpenses.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center">
            <div className="w-16 h-16 bg-[rgba(212,165,116,0.06)] rounded-full flex items-center justify-center mb-4 text-[#d4a574]">
              <Wallet size={32} />
            </div>
            <h3 className="text-lg font-bold text-[#2a2420] mb-1">No expenses found</h3>
            <p className="text-[#8b7355] text-sm max-w-sm mb-6">
              {searchTerm ? "Try adjusting your search terms." : "You haven't added any expenses yet. Click 'Add Receipt' to get started."}
            </p>
            {!searchTerm && (
              <button
                onClick={() => setShowModeSelect(true)}
                className="text-[#d4a574] font-medium hover:text-[#c28a5c] flex items-center gap-2"
              >
                <Plus size={18} /> Add your first receipt
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[rgba(212,165,116,0.04)] border-b border-[rgba(212,165,116,0.12)]">
                  <th className="px-6 py-4 text-xs font-bold text-[#8b7355] uppercase tracking-wider w-32">Date</th>
                  <th className="px-6 py-4 text-xs font-bold text-[#8b7355] uppercase tracking-wider">Vendor</th>
                  <th className="px-6 py-4 text-xs font-bold text-[#8b7355] uppercase tracking-wider">Notes</th>
                  <th className="px-6 py-4 text-xs font-bold text-[#8b7355] uppercase tracking-wider text-right">Amount</th>
                  <th className="px-6 py-4 text-xs font-bold text-[#8b7355] uppercase tracking-wider text-center w-24">Receipt</th>
                  <th className="px-6 py-4 text-xs font-bold text-[#8b7355] uppercase tracking-wider text-center w-20">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(212,165,116,0.12)]">
                {filteredExpenses.map((expense) => (
                  <tr key={expense.id} className="hover:bg-[rgba(212,165,116,0.04)] transition-colors group">
                    <td className="px-6 py-4 text-sm text-[#7a6b5a] whitespace-nowrap">
                      {expense.date ? format(new Date(expense.date), 'MMM d, yyyy') : 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-[#2a2420]">
                      {expense.vendor || 'Unknown Vendor'}
                    </td>
                    <td className="px-6 py-4 text-sm text-[#8b7355] max-w-xs truncate">
                      {expense.notes || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-[#2a2420] text-right">
                      ${expense.amount?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-6 py-4 text-sm text-center">
                      {(expense.receiptFileName || expense.receiptFileId) ? (
                        <div className="flex justify-center">
                          <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg inline-flex items-center gap-1 text-xs font-medium" title={expense.receiptFileName}>
                            <LinkIcon size={14} />
                          </span>
                        </div>
                      ) : (
                        <span className="text-[#a89b8c]">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-center">
                      <button
                        onClick={() => setExpenseToDelete(expense.id)}
                        className="p-1.5 text-[#a89b8c] hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        title="Delete expense"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Receipt Mode Selection Modal */}
      {showModeSelect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 luxury-modal-backdrop animate-in fade-in duration-200">
          <div className="luxury-modal-card rounded-[28px] w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-[rgba(212,165,116,0.12)]">
              <h2 className="text-lg font-bold text-[#2a2420]">Add Receipt</h2>
              <button onClick={() => setShowModeSelect(false)} className="text-[#a89b8c] hover:text-[#7a6b5a] transition-colors p-1">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <button
                onClick={() => { setShowModeSelect(false); setReceiptMode('uploads'); fetchUnassignedUploads(); }}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-[rgba(212,165,116,0.15)] hover:border-[#d4a574] hover:bg-[#d4a574]/5 transition-all group text-left"
              >
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-500 group-hover:bg-blue-100 transition-colors shrink-0">
                  <FolderOpen size={24} />
                </div>
                <div>
                  <p className="font-bold text-[#2a2420] text-sm">Choose from Uploads</p>
                  <p className="text-xs text-[#8b7355] mt-0.5">Pick from unassigned uploads in Google Drive</p>
                </div>
              </button>

              <button
                onClick={() => { setShowModeSelect(false); setReceiptMode('local-upload'); }}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-[rgba(212,165,116,0.15)] hover:border-[#d4a574] hover:bg-[#d4a574]/5 transition-all group text-left"
              >
                <div className="w-12 h-12 bg-violet-50 rounded-xl flex items-center justify-center text-violet-600 group-hover:bg-violet-100 transition-colors shrink-0">
                  <Upload size={24} />
                </div>
                <div>
                  <p className="font-bold text-[#2a2420] text-sm">Upload from Computer</p>
                  <p className="text-xs text-[#8b7355] mt-0.5">Select a receipt image or PDF from your local files</p>
                </div>
              </button>

              <button
                onClick={() => { setShowModeSelect(false); setReceiptMode('camera'); }}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-[rgba(212,165,116,0.15)] hover:border-[#d4a574] hover:bg-[#d4a574]/5 transition-all group text-left"
              >
                <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 group-hover:bg-emerald-100 transition-colors shrink-0">
                  <Camera size={24} />
                </div>
                <div>
                  <p className="font-bold text-[#2a2420] text-sm">Capture New Receipt</p>
                  <p className="text-xs text-[#8b7355] mt-0.5">Take a photo — OCR will auto-fill the form</p>
                </div>
              </button>

              <button
                onClick={() => { setShowModeSelect(false); setReceiptMode('manual'); }}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-[rgba(212,165,116,0.15)] hover:border-[#d4a574] hover:bg-[#d4a574]/5 transition-all group text-left"
              >
                <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-[#d4a574] group-hover:bg-amber-100 transition-colors shrink-0">
                  <PenLine size={24} />
                </div>
                <div>
                  <p className="font-bold text-[#2a2420] text-sm">Add Manually</p>
                  <p className="text-xs text-[#8b7355] mt-0.5">Enter the details by hand without a photo</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {expenseToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 luxury-modal-backdrop animate-in fade-in duration-200">
          <div className="luxury-modal-card rounded-[28px] w-full max-w-sm overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
                <Trash2 size={24} className="text-red-500" />
              </div>
              <h2 className="text-xl font-bold text-[#2a2420] mb-2">Delete Expense?</h2>
              <p className="text-sm text-[#8b7355]">
                Are you sure you want to delete this expense? This action cannot be undone.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-[rgba(212,165,116,0.12)] flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setExpenseToDelete(null)}
                className="px-4 py-2 text-sm font-medium text-[#7a6b5a] hover:text-[#2a2420] hover:bg-[rgba(212,165,116,0.06)] rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Scanner Modal (camera, manual, or local-upload mode) */}
      {(receiptMode === 'camera' || receiptMode === 'manual' || receiptMode === 'local-upload') && (
        <ReceiptScanner
          mode={receiptMode}
          onClose={() => setReceiptMode(null)}
          onSuccess={() => {
            // Refresh expenses after successful add
            findAllExpenses().then(data => {
              const sorted = data.sort((a, b) => {
                const dateCompare = b.date.localeCompare(a.date);
                if (dateCompare !== 0) return dateCompare;
                return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
              });
              setExpenses(sorted);
            });
          }}
        />
      )}

      {/* Unassigned Uploads Modal */}
      {receiptMode === 'uploads' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 luxury-modal-backdrop animate-in fade-in duration-200">
          <div className="luxury-modal-card rounded-[28px] w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-[rgba(212,165,116,0.12)] flex items-center justify-between bg-[#d4a574] text-white shrink-0">
              <div className="flex items-center gap-2">
                <FolderOpen size={20} />
                <h2 className="font-bold tracking-wide text-sm uppercase">Unassigned Uploads</h2>
              </div>
              <button onClick={() => setReceiptMode(null)} className="text-white/80 hover:text-white transition-colors p-1">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loadingUploads ? (
                <div className="p-8 flex flex-col items-center text-center">
                  <div className="w-8 h-8 border-2 border-[#d4a574] border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="text-sm text-[#8b7355]">Loading uploads from Drive...</p>
                </div>
              ) : unassignedFiles.length === 0 ? (
                <div className="p-8 flex flex-col items-center text-center">
                  <div className="w-16 h-16 bg-[rgba(212,165,116,0.04)] rounded-full flex items-center justify-center mb-4 text-[#d4a574]">
                    <Upload size={32} />
                  </div>
                  <h3 className="text-lg font-bold text-[#2a2420] mb-2">No Unassigned Uploads</h3>
                  <p className="text-sm text-[#8b7355] max-w-sm">
                    Upload receipt photos from your phone to the "Unassigned Uploads" folder in Google Drive, then come back here to assign them.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[rgba(212,165,116,0.12)]">
                  {unassignedFiles.map((file) => (
                    <div key={file.id} className="flex items-center justify-between p-4 hover:bg-[rgba(212,165,116,0.04)] transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                          file.mimeType.includes('image') ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'
                        }`}>
                          <FileText size={18} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#2a2420] truncate">{file.name}</p>
                          <p className="text-[10px] text-[#8b7355]">
                            {new Date(file.createdTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => assignFileAsReceipt(file)}
                        disabled={assigningFileId === file.id}
                        className="shrink-0 ml-3 px-3 py-1.5 rounded-lg text-xs font-bold text-[#d4a574] bg-[#d4a574]/10 hover:bg-[#d4a574]/20 transition-colors disabled:opacity-50"
                      >
                        {assigningFileId === file.id ? 'Assigning...' : 'Assign'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
