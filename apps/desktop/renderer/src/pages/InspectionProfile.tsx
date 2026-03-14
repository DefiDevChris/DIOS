import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { db } from '@dios/shared/firebase';
import { doc, onSnapshot, updateDoc, collection, getDocs, query, orderBy, setDoc, serverTimestamp } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { logger } from '@dios/shared';
import {
  ArrowLeft, Calendar, Clock, FileText, Receipt, CheckCircle,
  MapPin, Building2, Save, Car, Link2, Search, X, DollarSign
} from 'lucide-react';
import { generateInvoicePdf, InvoiceData } from '../lib/pdfGenerator';
import { queueFile } from '../lib/syncQueue';
import { useBackgroundSync } from '../contexts/BackgroundSyncContext';
import { format } from 'date-fns';

interface Inspection {
  id: string;
  operationId: string;
  date: string;
  status: 'Scheduled' | 'In Progress' | 'Completed' | 'Cancelled';
  scope?: string;
  baseHoursLog: number;
  additionalHoursLog: number;
  milesDriven: number;
  reportNotes?: string;
  linkedExpenses?: string[];
  notes?: string;
  isBundled?: boolean;
  totalTripDriveTime?: number;
  totalTripStops?: number;
  sharedDriveTime?: number;
  mealsAndExpenses?: number;
  perDiemDays?: number;
  customLineItemName?: string;
  customLineItemAmount?: number;
  invoiceNotes?: string;
  invoiceExceptions?: string;
  bundleId?: string;
}

interface Expense {
  id: string;
  date: string;
  vendor: string;
  amount: number;
  notes?: string;
  receiptImageUrl?: string;
}

interface Operation {
  id: string;
  name: string;
  agencyId: string;
  address: string;
  lat?: number;
  lng?: number;
}

interface Agency {
  id: string;
  name: string;
  flatRateBaseAmount: number;
  flatRateIncludedHours: number;
  additionalHourlyRate: number;
  mileageRate: number;
  travelTimeHourlyRate?: number;
  perDiemRate?: number;
}

import TasksWidget from '../components/TasksWidget';
import Swal from 'sweetalert2';

export default function InspectionProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, googleAccessToken } = useAuth();
  const { triggerSync } = useBackgroundSync();
  
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [agency, setAgency] = useState<Agency | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<Inspection['status']>('Scheduled');
  const [scope, setScope] = useState('');
  const [reportNotes, setReportNotes] = useState('');
  const [baseHoursLog, setBaseHoursLog] = useState(0);
  const [additionalHoursLog, setAdditionalHoursLog] = useState(0);
  const [milesDriven, setMilesDriven] = useState(0);
  const [isBundled, setIsBundled] = useState(false);
  const [totalTripDriveTime, setTotalTripDriveTime] = useState(0);
  const [totalTripStops, setTotalTripStops] = useState(1);
  const [mealsAndExpenses, setMealsAndExpenses] = useState(0);
  const [perDiemDays, setPerDiemDays] = useState(0);
  const [customLineItemName, setCustomLineItemName] = useState('');
  const [customLineItemAmount, setCustomLineItemAmount] = useState(0);
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [invoiceExceptions, setInvoiceExceptions] = useState('');

  // Linked expenses state
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [linkedExpenses, setLinkedExpenses] = useState<string[]>([]);
  const [expenseSearch, setExpenseSearch] = useState('');
  const [savingExpenses, setSavingExpenses] = useState(false);

  useEffect(() => {
    if (!user || !id) return;

    const inspectionPath = `users/${user.uid}/inspections/${id}`;
    const unsubscribe = onSnapshot(
      doc(db, inspectionPath),
      async (docSnapshot) => {
        if (docSnapshot.exists()) {
          const data = { id: docSnapshot.id, ...docSnapshot.data() } as Inspection;
          setInspection(data);
          
          // Initialize form state
          setNotes(data.notes || '');
          setStatus(data.status);
          setScope(data.scope || '');
          setReportNotes(data.reportNotes || '');
          setLinkedExpenses(data.linkedExpenses || []);
          setBaseHoursLog(data.baseHoursLog || 0);
          setAdditionalHoursLog(data.additionalHoursLog || 0);
          setMilesDriven(data.milesDriven || 0);
          setIsBundled(data.isBundled || false);
          setTotalTripDriveTime(data.totalTripDriveTime || 0);
          setTotalTripStops(data.totalTripStops || 1);
          setMealsAndExpenses(data.mealsAndExpenses || 0);
          setPerDiemDays(data.perDiemDays || 0);
          setCustomLineItemName(data.customLineItemName || '');
          setCustomLineItemAmount(data.customLineItemAmount || 0);
          setInvoiceNotes(data.invoiceNotes || '');
          setInvoiceExceptions(data.invoiceExceptions || '');

          // Fetch operation
          if (data.operationId) {
            try {
              const opDoc = await getDocs(collection(db, `users/${user.uid}/operations`));
              const op = opDoc.docs.find(d => d.id === data.operationId);
              if (op) {
                const opData = { id: op.id, ...op.data() } as Operation;
                setOperation(opData);

                // Fetch agency
                if (opData.agencyId) {
                  const agencyDoc = await getDocs(collection(db, `users/${user.uid}/agencies`));
                  const ag = agencyDoc.docs.find(d => d.id === opData.agencyId);
                  if (ag) {
                    setAgency({ id: ag.id, ...ag.data() } as Agency);
                  }
                }
              }
            } catch (error) {
              logger.error("Error fetching related data:", error);
            }
          }
        } else {
          navigate('/operations');
        }
        setLoading(false);
      },
      (error) => handleFirestoreError(error, OperationType.GET, inspectionPath)
    );

    return () => unsubscribe();
  }, [user, id, navigate]);

  // Fetch expenses for linking interface
  useEffect(() => {
    if (!user) return;
    const expensesPath = `users/${user.uid}/expenses`;
    const q = query(collection(db, expensesPath), orderBy('date', 'desc'));
    const unsubExpenses = onSnapshot(
      q,
      (snapshot) => {
        setExpenses(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Expense)));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, expensesPath)
    );
    return () => unsubExpenses();
  }, [user]);

  const handleSave = async () => {
    if (!user || !id) return;
    setSaving(true);
    
    let sharedDriveTime = 0;
    if (isBundled && totalTripStops > 0) {
      sharedDriveTime = Math.round(totalTripDriveTime) / totalTripStops;
    }

    const inspectionPath = `users/${user.uid}/inspections/${id}`;
    try {
      await updateDoc(doc(db, inspectionPath), {
        notes,
        status,
        scope,
        reportNotes,
        baseHoursLog,
        additionalHoursLog,
        milesDriven,
        isBundled,
        totalTripDriveTime,
        totalTripStops,
        sharedDriveTime,
        mealsAndExpenses,
        perDiemDays,
        customLineItemName,
        customLineItemAmount,
        invoiceNotes,
        invoiceExceptions
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, inspectionPath);
    } finally {
      setSaving(false);
    }
  };

  const calculateInvoiceTotal = () => {
    if (!agency) return 0;
    
    let total = agency.flatRateBaseAmount;
    
    // Additional hours
    if (additionalHoursLog > 0) {
      total += additionalHoursLog * agency.additionalHourlyRate;
    }
    
    // Drive time
    let driveTime = 0;
    if (isBundled && totalTripStops > 0) {
      driveTime = Math.round(totalTripDriveTime) / totalTripStops;
    } else {
      driveTime = totalTripDriveTime;
    }
    
    if (driveTime > 0) {
      const travelRate = agency.travelTimeHourlyRate || agency.additionalHourlyRate;
      total += driveTime * travelRate;
    }

    // Miles
    if (milesDriven > 0) {
      total += milesDriven * agency.mileageRate;
    }

    // Meals and Expenses
    if (mealsAndExpenses > 0) {
      total += mealsAndExpenses;
    }

    // Per Diem
    if (perDiemDays > 0) {
      const perDiemRate = agency.perDiemRate || 0;
      total += perDiemDays * perDiemRate;
    }

    // Custom Line Item
    if (customLineItemAmount > 0) {
      total += customLineItemAmount;
    }

    return total;
  };

  const handleToggleExpense = (expenseId: string) => {
    setLinkedExpenses(prev =>
      prev.includes(expenseId) ? prev.filter(id => id !== expenseId) : [...prev, expenseId]
    );
  };

  const handleSaveLinkedExpenses = async () => {
    if (!user || !id) return;
    setSavingExpenses(true);
    const inspectionPath = `users/${user.uid}/inspections/${id}`;
    try {
      await updateDoc(doc(db, inspectionPath), { linkedExpenses });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, inspectionPath);
    } finally {
      setSavingExpenses(false);
    }
  };

  const handleGenerateInvoice = async () => {
    if (!user || !agency || !operation || !inspection) return;

    setSaving(true);

    try {
      const invoiceTotal = calculateInvoiceTotal();
      const calculatedDriveTime = isBundled && totalTripStops > 0 ? Math.round(totalTripDriveTime) / totalTripStops : totalTripDriveTime;

      const invoiceData: InvoiceData = {
        invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
        date: format(new Date(), 'MMM d, yyyy'),
        operationName: operation.name,
        operationAddress: operation.address,
        agencyName: agency.name,
        baseAmount: agency.flatRateBaseAmount,
        baseHours: agency.flatRateIncludedHours,
        additionalHours: additionalHoursLog,
        additionalHourlyRate: agency.additionalHourlyRate,
        driveTime: calculatedDriveTime,
        travelRate: agency.travelTimeHourlyRate || agency.additionalHourlyRate,
        milesDriven: milesDriven,
        mileageRate: agency.mileageRate,
        mealsAndExpenses: mealsAndExpenses,
        perDiemDays: perDiemDays,
        perDiemRate: agency.perDiemRate || 0,
        customLineItemName: customLineItemName,
        customLineItemAmount: customLineItemAmount,
        totalAmount: invoiceTotal,
        notes: invoiceNotes
      };

      const pdfBlob = await generateInvoicePdf(invoiceData);
      const fileName = `Invoice_${operation.name}_${format(new Date(inspection.date), 'yyyy-MM-dd')}.pdf`;

      // Attempt to save using the File System Access API
      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: fileName,
            types: [{
              description: 'PDF Document',
              accept: { 'application/pdf': ['.pdf'] },
            }],
          });
          const writable = await handle.createWritable();
          await writable.write(pdfBlob);
          await writable.close();
        } catch (err: any) {
          if (err.name !== 'AbortError') {
            logger.error('File System Access API error:', err);
            // Fallback to standard download
            const url = URL.createObjectURL(pdfBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }
        }
      } else {
        // Fallback to standard download
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      // 3. Queue PDF for upload to Reports/{YYYY} in Google Drive (and mirror locally)
      try {
        const token = googleAccessToken || localStorage.getItem('googleAccessToken');
        if (token && token !== 'dummy') {
          const year = new Date(inspection.date).getFullYear();
          await queueFile(pdfBlob, {
            fileName,
            year,
            uid: user.uid,
            folderName: 'Reports',
          });
          triggerSync();
        }
      } catch (err) {
        logger.warn("Drive queue failed:", err);
      }

      // 4. Save to Firestore
      const newInvoiceRef = doc(collection(db, `users/${user.uid}/invoices`));
      await setDoc(newInvoiceRef, {
        inspectionId: inspection.id,
        operationId: operation.id,
        operationName: operation.name,
        agencyId: agency.id,
        agencyName: agency.name,
        date: new Date().toISOString(),
        inspectionDate: inspection.date,
        totalAmount: invoiceTotal,
        status: 'Unpaid',
        createdAt: serverTimestamp(),
      });

      Swal.fire({ text: 'Invoice generated successfully!', icon: 'success' });
    } catch (error) {
      logger.error('Error generating invoice:', error);
      Swal.fire({ text: 'Failed to generate invoice.', icon: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-stone-500">Loading inspection details...</div>;
  }

  if (!inspection) return null;

  const invoiceTotal = calculateInvoiceTotal();
  const calculatedDriveTime = isBundled && totalTripStops > 0 ? Math.round(totalTripDriveTime) / totalTripStops : totalTripDriveTime;

  return (
    <div className="animate-in fade-in duration-500 pb-12">
      {/* Breadcrumbs & Header */}
      <div className="mb-6">
        <Link to={`/operations/${inspection.operationId}`} className="inline-flex items-center gap-2 text-sm font-medium text-stone-500 hover:text-stone-900 transition-colors mb-4">
          <ArrowLeft size={16} />
          Back to Operation
        </Link>
        
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight">
                Inspection: {new Date(inspection.date).toLocaleDateString()}
              </h1>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
              }`}>
                {status}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm text-stone-500">
              <span className="flex items-center gap-1.5"><Building2 size={16} /> {operation?.name || 'Unknown Operation'}</span>
              {agency && <span className="flex items-center gap-1.5"><Receipt size={16} /> {agency.name}</span>}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={handleSave}
              disabled={saving}
              className="bg-[#D49A6A] hover:bg-[#c28a5c] text-white px-6 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
            >
              <Save size={16} />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Details & Notes */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          {/* Status & Basic Info */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100">
            <h2 className="text-lg font-bold text-stone-900 mb-4">Inspection Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                >
                  <option value="Scheduled">Scheduled</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Date</label>
                <div className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm text-stone-700">
                  {new Date(inspection.date).toLocaleDateString()}
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Scope of Inspection</label>
                <textarea
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  rows={3}
                  className="w-full resize-none bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                  placeholder="Describe the scope of this inspection (e.g., fields, crops, processes reviewed)..."
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100 flex-1 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <FileText size={18} className="text-[#D49A6A]" />
              <h2 className="text-lg font-bold text-stone-900">Inspection Notes</h2>
            </div>
            <textarea 
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full flex-1 min-h-[200px] resize-none bg-[#FDFCFB] border border-stone-200 border-dashed rounded-2xl p-4 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A]/50 transition-all"
              placeholder="Enter detailed notes about the inspection here..."
            ></textarea>
          </div>
          {/* Report Notes */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle size={18} className="text-[#D49A6A]" />
              <h2 className="text-lg font-bold text-stone-900">Report Notes</h2>
            </div>
            <textarea
              value={reportNotes}
              onChange={(e) => setReportNotes(e.target.value)}
              className="w-full min-h-[140px] resize-none bg-[#FDFCFB] border border-stone-200 border-dashed rounded-2xl p-4 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A]/50 transition-all"
              placeholder="Notes to include in the official inspection report..."
            />
          </div>

          {/* Tasks */}
          <div className="min-h-[280px]">
            <TasksWidget inspectionId={id} title="Inspection Tasks" />
          </div>

          {/* Additional Billing Items */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100 flex-1 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <Receipt size={18} className="text-[#D49A6A]" />
              <h2 className="text-lg font-bold text-stone-900">Additional Billing Items</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Miles Driven</label>
                <input 
                  type="number" 
                  min="0"
                  step="1"
                  value={milesDriven}
                  onChange={(e) => setMilesDriven(parseInt(e.target.value) || 0)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Meals & Expenses ($)</label>
                <input 
                  type="number" 
                  min="0"
                  step="0.01"
                  value={mealsAndExpenses}
                  onChange={(e) => setMealsAndExpenses(parseFloat(e.target.value) || 0)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Per Diem (Days)</label>
                <input 
                  type="number" 
                  min="0"
                  step="1"
                  value={perDiemDays}
                  onChange={(e) => setPerDiemDays(parseInt(e.target.value) || 0)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                />
              </div>
            </div>

            <div className="border-t border-stone-100 pt-6 mb-6">
              <h3 className="text-sm font-bold text-stone-900 mb-4">Custom Line Item</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Item Description</label>
                  <input 
                    type="text" 
                    value={customLineItemName}
                    onChange={(e) => setCustomLineItemName(e.target.value)}
                    placeholder="e.g., Hotel Stay"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Amount ($)</label>
                  <input 
                    type="number" 
                    min="0"
                    step="0.01"
                    value={customLineItemAmount}
                    onChange={(e) => setCustomLineItemAmount(parseFloat(e.target.value) || 0)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-stone-100 pt-6 space-y-6">
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Invoice Notes</label>
                <textarea 
                  value={invoiceNotes}
                  onChange={(e) => setInvoiceNotes(e.target.value)}
                  className="w-full min-h-[80px] resize-none bg-stone-50 border border-stone-200 rounded-xl p-4 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                  placeholder="Notes to appear on the invoice..."
                ></textarea>
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Exceptions / Internal Notes</label>
                <textarea 
                  value={invoiceExceptions}
                  onChange={(e) => setInvoiceExceptions(e.target.value)}
                  className="w-full min-h-[80px] resize-none bg-stone-50 border border-stone-200 rounded-xl p-4 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                  placeholder="Internal notes or billing exceptions..."
                ></textarea>
              </div>
            </div>
          </div>

          {/* Linked Expenses */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Link2 size={18} className="text-[#D49A6A]" />
                <h2 className="text-lg font-bold text-stone-900">Linked Expenses</h2>
                {linkedExpenses.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-[#D49A6A]/10 text-[#D49A6A] text-xs font-bold">
                    {linkedExpenses.length} linked
                  </span>
                )}
              </div>
              <button
                onClick={handleSaveLinkedExpenses}
                disabled={savingExpenses}
                className="bg-[#D49A6A] hover:bg-[#c28a5c] text-white px-4 py-1.5 rounded-xl text-xs font-medium transition-colors shadow-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                <Save size={13} />
                {savingExpenses ? 'Saving...' : 'Save Links'}
              </button>
            </div>

            <p className="text-xs text-stone-500 mb-4">
              Select expenses from your records to attach to this inspection.
            </p>

            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={15} />
              <input
                type="text"
                placeholder="Search expenses by vendor or notes..."
                value={expenseSearch}
                onChange={(e) => setExpenseSearch(e.target.value)}
                className="w-full bg-stone-50 border border-stone-200 focus:border-[#D49A6A] focus:ring-2 focus:ring-[#D49A6A]/20 rounded-xl py-2 pl-9 pr-4 text-sm transition-all"
              />
              {expenseSearch && (
                <button
                  onClick={() => setExpenseSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Expenses list */}
            {expenses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-stone-400">
                <DollarSign size={28} className="mb-2 text-stone-300" />
                <p className="text-sm">No expenses found. Add expenses in the Expenses section.</p>
              </div>
            ) : (
              <div className="border border-stone-100 rounded-2xl overflow-hidden divide-y divide-stone-100 max-h-72 overflow-y-auto">
                {expenses
                  .filter(exp => {
                    if (!expenseSearch) return true;
                    const q = expenseSearch.toLowerCase();
                    return (
                      exp.vendor.toLowerCase().includes(q) ||
                      (exp.notes || '').toLowerCase().includes(q) ||
                      exp.date.includes(q)
                    );
                  })
                  .map(exp => {
                    const isLinked = linkedExpenses.includes(exp.id);
                    return (
                      <label
                        key={exp.id}
                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                          isLinked ? 'bg-[#D49A6A]/5 hover:bg-[#D49A6A]/10' : 'hover:bg-stone-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isLinked}
                          onChange={() => handleToggleExpense(exp.id)}
                          className="w-4 h-4 rounded border-stone-300 text-[#D49A6A] focus:ring-[#D49A6A] shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-stone-800 truncate">{exp.vendor}</span>
                            <span className="text-sm font-bold text-stone-900 shrink-0">${exp.amount.toFixed(2)}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-stone-400">
                              {new Date(exp.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                            {exp.notes && (
                              <span className="text-xs text-stone-400 truncate">&middot; {exp.notes}</span>
                            )}
                          </div>
                        </div>
                      </label>
                    );
                  })}
              </div>
            )}

            {/* Linked summary */}
            {linkedExpenses.length > 0 && (
              <div className="mt-4 pt-4 border-t border-stone-100 flex justify-between items-center text-sm">
                <span className="text-stone-500">Total linked amount:</span>
                <span className="font-bold text-stone-900">
                  ${expenses
                    .filter(e => linkedExpenses.includes(e.id))
                    .reduce((sum, e) => sum + e.amount, 0)
                    .toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Time & Billing */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {/* Hours Log */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100">
            <div className="flex items-center gap-2 mb-4">
              <Clock size={18} className="text-[#D49A6A]" />
              <h2 className="text-lg font-bold text-stone-900">Time Log</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Base Hours</label>
                <input 
                  type="number" 
                  min="0"
                  step="0.5"
                  value={baseHoursLog}
                  onChange={(e) => setBaseHoursLog(parseFloat(e.target.value) || 0)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Additional Hours</label>
                <input 
                  type="number" 
                  min="0"
                  step="0.5"
                  value={additionalHoursLog}
                  onChange={(e) => setAdditionalHoursLog(parseFloat(e.target.value) || 0)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                />
              </div>
            </div>
          </div>

          {/* Drive Time & Bundling */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100">
            <div className="flex items-center gap-2 mb-4">
              <Car size={18} className="text-[#D49A6A]" />
              <h2 className="text-lg font-bold text-stone-900">Drive Time</h2>
            </div>
            
            <div className="space-y-4">
              <label className="flex items-center gap-3 p-3 border border-stone-200 rounded-xl cursor-pointer hover:bg-stone-50 transition-colors">
                <input 
                  type="checkbox" 
                  checked={isBundled}
                  onChange={(e) => setIsBundled(e.target.checked)}
                  className="w-4 h-4 text-[#D49A6A] rounded border-stone-300 focus:ring-[#D49A6A]"
                />
                <span className="text-sm font-medium text-stone-700">Bundled Inspection Trip</span>
              </label>

              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">
                  {isBundled ? 'Total Trip Drive Time (Hours)' : 'Drive Time (Hours)'}
                </label>
                <input 
                  type="number" 
                  min="0"
                  step="0.5"
                  value={totalTripDriveTime}
                  onChange={(e) => setTotalTripDriveTime(parseFloat(e.target.value) || 0)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                />
              </div>

              {isBundled && (
                <div>
                  <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Number of Stops (Operators)</label>
                  <input 
                    type="number" 
                    min="1"
                    step="1"
                    value={totalTripStops}
                    onChange={(e) => setTotalTripStops(parseInt(e.target.value) || 1)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                  />
                </div>
              )}

              <div className="pt-3 border-t border-stone-100">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-stone-500">Calculated Drive Time:</span>
                  <span className="text-sm font-bold text-stone-900">{calculatedDriveTime.toFixed(2)} hrs</span>
                </div>
                {isBundled && (
                  <p className="text-[10px] text-stone-400 mt-1">
                    (Total drive time rounded to nearest hour, divided by {totalTripStops} stops)
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Invoice Summary */}
          <div className="bg-stone-900 rounded-3xl p-6 shadow-sm text-white">
            <div className="flex items-center gap-2 mb-4">
              <Receipt size={18} className="text-[#D49A6A]" />
              <h2 className="text-lg font-bold text-white">Invoice Estimate</h2>
            </div>
            
            {agency ? (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center text-stone-400">
                  <span>Base Rate ({agency.flatRateIncludedHours} hrs)</span>
                  <span className="text-white">${agency.flatRateBaseAmount.toFixed(2)}</span>
                </div>
                {additionalHoursLog > 0 && (
                  <div className="flex justify-between items-center text-stone-400">
                    <span>Add'l Hours ({additionalHoursLog} @ ${agency.additionalHourlyRate}/hr)</span>
                    <span className="text-white">${(additionalHoursLog * agency.additionalHourlyRate).toFixed(2)}</span>
                  </div>
                )}
                {calculatedDriveTime > 0 && (
                  <div className="flex justify-between items-center text-stone-400">
                    <span>Drive Time ({calculatedDriveTime.toFixed(2)} @ ${(agency.travelTimeHourlyRate || agency.additionalHourlyRate).toFixed(2)}/hr)</span>
                    <span className="text-white">${(calculatedDriveTime * (agency.travelTimeHourlyRate || agency.additionalHourlyRate)).toFixed(2)}</span>
                  </div>
                )}
                {milesDriven > 0 && (
                  <div className="flex justify-between items-center text-stone-400">
                    <span>Mileage ({milesDriven} @ ${(agency.mileageRate).toFixed(3)}/mi)</span>
                    <span className="text-white">${(milesDriven * agency.mileageRate).toFixed(2)}</span>
                  </div>
                )}
                {mealsAndExpenses > 0 && (
                  <div className="flex justify-between items-center text-stone-400">
                    <span>Meals & Expenses</span>
                    <span className="text-white">${mealsAndExpenses.toFixed(2)}</span>
                  </div>
                )}
                {perDiemDays > 0 && (
                  <div className="flex justify-between items-center text-stone-400">
                    <span>Per Diem ({perDiemDays} @ ${(agency.perDiemRate || 0).toFixed(2)}/day)</span>
                    <span className="text-white">${(perDiemDays * (agency.perDiemRate || 0)).toFixed(2)}</span>
                  </div>
                )}
                {customLineItemAmount > 0 && (
                  <div className="flex justify-between items-center text-stone-400">
                    <span>{customLineItemName || 'Custom Item'}</span>
                    <span className="text-white">${customLineItemAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="pt-3 border-t border-stone-700 flex justify-between items-center font-bold text-lg">
                  <span>Total</span>
                  <span className="text-[#D49A6A]">${invoiceTotal.toFixed(2)}</span>
                </div>
              </div>
            ) : (
              <div className="text-sm text-stone-400">Agency billing info not available.</div>
            )}
            
            <button
              onClick={handleGenerateInvoice}
              disabled={saving || !agency}
              className="w-full mt-6 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? 'Generating...' : 'Generate Invoice'}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
