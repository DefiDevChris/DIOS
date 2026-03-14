import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from 'react-router';
import { collection, query, orderBy, onSnapshot, doc, deleteDoc } from 'firebase/firestore';
import { db } from '@dios/shared/firebase';
import { Wallet, Plus, Trash2, FileText, Search, Link as LinkIcon, DollarSign, Camera, Upload, PenLine, X, FolderOpen } from 'lucide-react';
import { logger } from '@dios/shared';
import ReceiptScanner from '../components/ReceiptScanner';
import { format } from 'date-fns';
import Swal from 'sweetalert2';

interface Expense {
  id: string;
  vendor: string;
  amount: number;
  date: string;
  notes: string;
  receiptFileName?: string;
  receiptFileId?: string;
  createdAt: any;
}

type ReceiptMode = 'camera' | 'manual' | 'uploads' | null;

export default function Expenses() {
  const { user } = useAuth();
  const location = useLocation();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModeSelect, setShowModeSelect] = useState(false);
  const [receiptMode, setReceiptMode] = useState<ReceiptMode>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'users', user.uid, 'expenses'),
      orderBy('date', 'desc'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const expensesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Expense[];

      setExpenses(expensesData);
      setLoading(false);
    }, (error) => {
      logger.error("Error fetching expenses:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Auto-open "Add Receipt" modal when navigated here with ?new=1
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('new') === '1') {
      setShowModeSelect(true);
    }
  }, [location.search]);

  const confirmDelete = async () => {
    if (!user || !expenseToDelete) return;

    try {
      await deleteDoc(doc(db, 'users', user.uid, 'expenses', expenseToDelete));
      setExpenseToDelete(null);
    } catch (error) {
      logger.error('Error deleting expense:', error);
      Swal.fire({ text: 'Failed to delete expense.', icon: 'error' });
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#D49A6A]"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500">

      {/* Header section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight flex items-center gap-3">
            <Wallet className="text-[#D49A6A]" size={32} />
            Expenses
          </h1>
          <p className="mt-2 text-stone-500 text-sm">Track your receipts and field expenses.</p>
        </div>

        <button
          onClick={() => setShowModeSelect(true)}
          className="bg-[#D49A6A] hover:bg-[#c28a5c] text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors shadow-sm active:scale-95"
        >
          <Plus size={18} />
          Add Receipt
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100 flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
            <DollarSign size={24} />
          </div>
          <div>
            <p className="text-sm font-bold text-stone-500 uppercase tracking-wider">Total Expenses</p>
            <p className="text-2xl font-black text-stone-900">${totalAmount.toFixed(2)}</p>
          </div>
        </div>
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100 flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
            <FileText size={24} />
          </div>
          <div>
            <p className="text-sm font-bold text-stone-500 uppercase tracking-wider">Receipts</p>
            <p className="text-2xl font-black text-stone-900">{filteredExpenses.length}</p>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden flex flex-col">

        {/* Toolbar */}
        <div className="p-4 border-b border-stone-100 bg-stone-50/50 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
            <input
              type="text"
              placeholder="Search vendors or notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-stone-200 focus:border-[#D49A6A] focus:ring-2 focus:ring-[#D49A6A]/20 rounded-xl py-2 pl-10 pr-4 text-sm transition-all"
            />
          </div>
        </div>

        {/* Expenses List */}
        {filteredExpenses.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center">
            <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mb-4 text-stone-400">
              <Wallet size={32} />
            </div>
            <h3 className="text-lg font-bold text-stone-900 mb-1">No expenses found</h3>
            <p className="text-stone-500 text-sm max-w-sm mb-6">
              {searchTerm ? "Try adjusting your search terms." : "You haven't added any expenses yet. Click 'Add Receipt' to get started."}
            </p>
            {!searchTerm && (
              <button
                onClick={() => setShowModeSelect(true)}
                className="text-[#D49A6A] font-medium hover:text-[#c28a5c] flex items-center gap-2"
              >
                <Plus size={18} /> Add your first receipt
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-100">
                  <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider w-32">Date</th>
                  <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">Vendor</th>
                  <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">Notes</th>
                  <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider text-right">Amount</th>
                  <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider text-center w-24">Receipt</th>
                  <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider text-center w-20">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredExpenses.map((expense) => (
                  <tr key={expense.id} className="hover:bg-stone-50/50 transition-colors group">
                    <td className="px-6 py-4 text-sm text-stone-600 whitespace-nowrap">
                      {expense.date ? format(new Date(expense.date), 'MMM d, yyyy') : 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-stone-900">
                      {expense.vendor || 'Unknown Vendor'}
                    </td>
                    <td className="px-6 py-4 text-sm text-stone-500 max-w-xs truncate">
                      {expense.notes || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-stone-900 text-right">
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
                        <span className="text-stone-300">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-center">
                      <button
                        onClick={() => setExpenseToDelete(expense.id)}
                        className="p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-stone-100">
              <h2 className="text-lg font-bold text-stone-900">Add Receipt</h2>
              <button onClick={() => setShowModeSelect(false)} className="text-stone-400 hover:text-stone-600 transition-colors p-1">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <button
                onClick={() => { setShowModeSelect(false); setReceiptMode('uploads'); }}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-stone-200 hover:border-[#D49A6A] hover:bg-[#D49A6A]/5 transition-all group text-left"
              >
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-500 group-hover:bg-blue-100 transition-colors shrink-0">
                  <FolderOpen size={24} />
                </div>
                <div>
                  <p className="font-bold text-stone-900 text-sm">Choose from Uploads</p>
                  <p className="text-xs text-stone-500 mt-0.5">Pick from unassigned uploads in Google Drive</p>
                </div>
              </button>

              <button
                onClick={() => { setShowModeSelect(false); setReceiptMode('camera'); }}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-stone-200 hover:border-[#D49A6A] hover:bg-[#D49A6A]/5 transition-all group text-left"
              >
                <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 group-hover:bg-emerald-100 transition-colors shrink-0">
                  <Camera size={24} />
                </div>
                <div>
                  <p className="font-bold text-stone-900 text-sm">Capture New Receipt</p>
                  <p className="text-xs text-stone-500 mt-0.5">Take a photo — OCR will auto-fill the form</p>
                </div>
              </button>

              <button
                onClick={() => { setShowModeSelect(false); setReceiptMode('manual'); }}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-stone-200 hover:border-[#D49A6A] hover:bg-[#D49A6A]/5 transition-all group text-left"
              >
                <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-[#D49A6A] group-hover:bg-amber-100 transition-colors shrink-0">
                  <PenLine size={24} />
                </div>
                <div>
                  <p className="font-bold text-stone-900 text-sm">Add Manually</p>
                  <p className="text-xs text-stone-500 mt-0.5">Enter the details by hand without a photo</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {expenseToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
                <Trash2 size={24} className="text-red-500" />
              </div>
              <h2 className="text-xl font-bold text-stone-900 mb-2">Delete Expense?</h2>
              <p className="text-sm text-stone-500">
                Are you sure you want to delete this expense? This action cannot be undone.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-stone-100 bg-stone-50/50 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setExpenseToDelete(null)}
                className="px-4 py-2 text-sm font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-200/50 rounded-xl transition-colors"
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

      {/* Receipt Scanner Modal (camera or manual mode) */}
      {(receiptMode === 'camera' || receiptMode === 'manual') && (
        <ReceiptScanner
          mode={receiptMode}
          onClose={() => setReceiptMode(null)}
          onSuccess={() => {}}
        />
      )}

      {/* Unassigned Uploads Modal */}
      {receiptMode === 'uploads' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between bg-[#D49A6A] text-white">
              <div className="flex items-center gap-2">
                <FolderOpen size={20} />
                <h2 className="font-bold tracking-wide text-sm uppercase">Unassigned Uploads</h2>
              </div>
              <button onClick={() => setReceiptMode(null)} className="text-white/80 hover:text-white transition-colors p-1">
                <X size={20} />
              </button>
            </div>
            <div className="p-8 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4 text-blue-400">
                <Upload size={32} />
              </div>
              <h3 className="text-lg font-bold text-stone-900 mb-2">Connect Google Drive</h3>
              <p className="text-sm text-stone-500 max-w-sm mb-6">
                Link your Google Drive to browse unassigned uploads from the master folder.
              </p>
              <button
                onClick={() => setReceiptMode(null)}
                className="text-stone-500 text-sm hover:text-stone-700 underline underline-offset-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
