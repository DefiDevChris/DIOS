import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { useDatabase } from '../hooks/useDatabase';
// serverTimestamp removed — sentinel objects can't be stored in SQLite
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { logger } from '@dios/shared';
import { getNextInvoiceNumber } from '../utils/invoiceNumbering';
import {
  ArrowLeft, Clock, FileText, Receipt, CheckCircle,
  Building2, Save, Car, Link2, Search, X, DollarSign
} from 'lucide-react';
import type { Agency, Inspection as SharedInspection, Operation as SharedOperation, Expense as SharedExpense, InvoiceLineItem } from '@dios/shared';
import { useSheetsSync } from '../hooks/useSheetsSync';
import InvoiceEditor from '../components/InvoiceEditor';
import InvoiceEmailModal from '../components/InvoiceEmailModal';
import { format } from 'date-fns';

interface Inspection extends SharedInspection {
  scope?: string;
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
}

interface Expense extends SharedExpense {}

interface Operation extends SharedOperation {}

import TasksWidget from '../components/TasksWidget';
import Swal from 'sweetalert2';

export default function InspectionProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, googleAccessToken } = useAuth();
  const { syncInspection } = useSheetsSync();

  // Database hooks
  const { findById: findInspectionById, save: saveInspection } = useDatabase<Inspection>({ table: 'inspections' });
  const { findById: findOperationById } = useDatabase<Operation>({ table: 'operations' });
  const { findById: findAgencyById } = useDatabase<Agency>({ table: 'agencies' });
  const { findAll: findAllExpenses } = useDatabase<Expense>({ table: 'expenses' });
  const { save: saveInvoice, findAll: findAllInvoices } = useDatabase<{ id: string; [key: string]: unknown }>({ table: 'invoices' });

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

  // Invoice editor modal state
  const [invoiceEditorOpen, setInvoiceEditorOpen] = useState(false);
  const [pendingInvoiceData, setPendingInvoiceData] = useState<{
    businessProfile: { businessName: string; ownerName: string; businessAddress: string; businessPhone: string; businessEmail: string };
    invoiceNumber: string;
    invoiceId: string;
  } | null>(null);
  const [emailModal, setEmailModal] = useState<{
    pdfBlob: Blob;
    invoiceNumber: string;
    total: number;
    lineItems: InvoiceLineItem[];
    notes: string;
  } | null>(null);

  // Linked expenses state
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [linkedExpenses, setLinkedExpenses] = useState<string[]>([]);
  const [expenseSearch, setExpenseSearch] = useState('');
  const [savingExpenses, setSavingExpenses] = useState(false);

  useEffect(() => {
    if (!user || !id) return;

    const loadInspection = async () => {
      try {
        const data = await findInspectionById(id);
        if (data) {
          setInspection(data);

          // Initialize form state
          setNotes(data.notes || '');
          setStatus(data.status);
          setScope(data.scope || '');
          setReportNotes(data.reportNotes || '');
          // linkedExpenses is stored as JSON text in SQLite — parse if string
          const rawLinked = data.linkedExpenses;
          if (Array.isArray(rawLinked)) {
            setLinkedExpenses(rawLinked);
          } else if (typeof rawLinked === 'string' && rawLinked) {
            try { setLinkedExpenses(JSON.parse(rawLinked)); } catch { setLinkedExpenses([]); }
          } else {
            setLinkedExpenses([]);
          }
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
              const opData = await findOperationById(data.operationId);
              if (opData) {
                setOperation(opData);

                // Fetch agency
                if (opData.agencyId) {
                  const agData = await findAgencyById(opData.agencyId);
                  if (agData) {
                    setAgency(agData);
                  }
                }
              }
            } catch (error) {
              logger.error('Error fetching related data:', error);
            }
          }
        } else {
          navigate('/operations');
        }
        setLoading(false);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `users/${user.uid}/inspections/${id}`);
        setLoading(false);
      }
    };

    loadInspection();
  }, [user, id, findInspectionById, findOperationById, findAgencyById, navigate]);

  // Fetch expenses for linking interface
  useEffect(() => {
    if (!user) return;

    const loadExpenses = async () => {
      try {
        const allExpenses = await findAllExpenses();
        // Sort by date descending
        const sorted = allExpenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setExpenses(sorted);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/expenses`);
      }
    };

    loadExpenses();
  }, [user, findAllExpenses]);

  const handleSave = async () => {
    if (!user || !id || !inspection) return;
    setSaving(true);

    let sharedDriveTime = 0;
    if (isBundled && totalTripStops > 0) {
      sharedDriveTime = Math.round(totalTripDriveTime) / totalTripStops;
    }

    try {
      await saveInspection({
        ...inspection,
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
        invoiceExceptions,
        updatedAt: new Date().toISOString(),
      });
      Swal.fire({ text: 'Changes saved successfully!', icon: 'success', timer: 1500, showConfirmButton: false });
      syncInspection(id).catch(() => {});
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/inspections/${id}`);
      Swal.fire({ text: 'Failed to save changes.', icon: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const calculateInvoiceTotal = () => {
    if (!agency) return 0;

    let total = agency.flatRateAmount;

    // Additional hours
    if (additionalHoursLog > 0) {
      total += additionalHoursLog * (agency.additionalHourlyRate || agency.hourlyRate || 0);
    }

    // Drive billing (by hour or by mile based on agency setting)
    const billingMethod = agency.driveBillingMethod || 'hourly';

    if (billingMethod === 'hourly') {
      let driveTime = 0;
      if (isBundled && totalTripStops > 0) {
        driveTime = Math.round(totalTripDriveTime) / totalTripStops;
      } else {
        driveTime = totalTripDriveTime;
      }
      if (driveTime > 0) {
        const travelRate = agency.driveTimeHourlyRate || agency.additionalHourlyRate || agency.hourlyRate || 0;
        total += driveTime * travelRate;
      }
    } else {
      if (milesDriven > 0) {
        total += milesDriven * agency.mileageRate;
      }
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
    setLinkedExpenses((prev) =>
      prev.includes(expenseId) ? prev.filter((id) => id !== expenseId) : [...prev, expenseId]
    );
  };

  const handleSaveLinkedExpenses = async () => {
    if (!user || !id || !inspection) return;
    setSavingExpenses(true);
    try {
      await saveInspection({
        ...inspection,
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
        mealsAndExpenses,
        perDiemDays,
        customLineItemName,
        customLineItemAmount,
        invoiceNotes,
        invoiceExceptions,
        linkedExpenses: JSON.stringify(linkedExpenses) as unknown as string[],
        updatedAt: new Date().toISOString(),
      });
      Swal.fire({ text: 'Linked expenses saved!', icon: 'success', timer: 1500, showConfirmButton: false });
      syncInspection(id).catch(() => {});
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/inspections/${id}`);
    } finally {
      setSavingExpenses(false);
    }
  };

  const handleGenerateInvoice = async () => {
    if (!user || !agency || !operation || !inspection) return;
    setSaving(true);
    try {
      const { getSystemConfig } = await import('../utils/systemConfig');
      const bp = await getSystemConfig(user.uid);

      const year = new Date().getFullYear();
      const allInvoices = await findAllInvoices();
      const yearCount = allInvoices.filter((d) => {
        const num = (d as any).invoiceNumber as string;
        return num?.startsWith(`INV-${year}-`);
      }).length;
      const invoiceNumber = getNextInvoiceNumber(year, yearCount);

      setPendingInvoiceData({
        businessProfile: {
          businessName: (bp.businessName as string) ?? '',
          ownerName: (bp.ownerName as string) ?? '',
          businessAddress: (bp.businessAddress as string) ?? '',
          businessPhone: (bp.businessPhone as string) ?? '',
          businessEmail: (bp.businessEmail as string) ?? '',
        },
        invoiceNumber,
        invoiceId: crypto.randomUUID(),
      });
      setInvoiceEditorOpen(true);
    } catch (error) {
      logger.error('Error opening invoice editor:', error);
      Swal.fire({ text: 'Failed to open invoice editor.', icon: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleInvoiceSave = async ({ lineItems, total, notes: editorNotes }: { lineItems: InvoiceLineItem[]; total: number; notes: string }) => {
    if (!user || !agency || !operation || !inspection || !pendingInvoiceData) return;
    try {
      await saveInvoice({
        id: pendingInvoiceData.invoiceId,
        inspectionId: inspection.id,
        operationId: operation.id,
        operationName: operation.name,
        agencyId: agency.id,
        agencyName: agency.name,
        date: new Date().toISOString(),
        inspectionDate: inspection.date,
        totalAmount: total,
        status: 'Not Complete',
        invoiceNumber: pendingInvoiceData.invoiceNumber,
        lineItems: JSON.stringify(lineItems),
        invoiceNotes: editorNotes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        syncStatus: 'pending',
      });
      setInvoiceEditorOpen(false);
      setPendingInvoiceData(null);
      Swal.fire({ text: 'Invoice saved!', icon: 'success', timer: 2000, showConfirmButton: false });
      syncInspection(inspection.id).catch(() => {});
    } catch (error) {
      logger.error('Error saving invoice:', error);
      Swal.fire({ text: 'Failed to save invoice.', icon: 'error' });
    }
  };

  const handleInvoiceEmail = async (pdfBlob: Blob, invoiceNumber: string, total: number, lineItems: InvoiceLineItem[], notes: string) => {
    if (!user || !agency || !operation || !inspection || !pendingInvoiceData) return;
    // Auto-save before emailing so the record exists
    try {
      await saveInvoice({
        id: pendingInvoiceData.invoiceId,
        inspectionId: inspection.id,
        operationId: operation.id,
        operationName: operation.name,
        agencyId: agency.id,
        agencyName: agency.name,
        date: new Date().toISOString(),
        inspectionDate: inspection.date,
        totalAmount: total,
        status: 'Not Complete',
        invoiceNumber,
        lineItems: JSON.stringify(lineItems),
        invoiceNotes: notes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        syncStatus: 'pending',
      });
    } catch (error) {
      logger.error('Error auto-saving invoice before email:', error);
    }
    setEmailModal({ pdfBlob, invoiceNumber, total, lineItems, notes });
  };

  const handleEmailSent = async () => {
    if (!user || !agency || !operation || !inspection || !pendingInvoiceData || !emailModal) return;
    try {
      await saveInvoice({
        id: pendingInvoiceData.invoiceId,
        inspectionId: inspection.id,
        operationId: operation.id,
        operationName: operation.name,
        agencyId: agency.id,
        agencyName: agency.name,
        date: new Date().toISOString(),
        inspectionDate: inspection.date,
        totalAmount: emailModal.total,
        status: 'Sent',
        sentDate: new Date().toISOString(),
        invoiceNumber: emailModal.invoiceNumber,
        lineItems: JSON.stringify(emailModal.lineItems),
        invoiceNotes: emailModal.notes,
        updatedAt: new Date().toISOString(),
        syncStatus: 'pending',
      });
      syncInspection(inspection.id).catch(() => {});
    } catch (error) {
      logger.error('Error updating invoice status after email:', error);
    }
    setEmailModal(null);
    setInvoiceEditorOpen(false);
    setPendingInvoiceData(null);
  };

  if (loading) {
    return <div className="p-8 text-center text-[#8b7355]">Loading inspection details...</div>;
  }

  if (!inspection) return null;

  const invoiceTotal = calculateInvoiceTotal();
  const calculatedDriveTime =
    isBundled && totalTripStops > 0 ? Math.round(totalTripDriveTime) / totalTripStops : totalTripDriveTime;

  return (
    <>
    <div className="animate-in fade-in duration-500 pb-12">
      {/* Breadcrumbs & Header */}
      <div className="mb-6">
        <Link
          to={`/operations/${inspection.operationId}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-[#8b7355] hover:text-[#2a2420] transition-colors mb-4"
        >
          <ArrowLeft size={16} />
          Back to Operation
        </Link>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="font-serif-display text-[36px] font-semibold text-[#2a2420]">
                Inspection: {new Date(inspection.date).toLocaleDateString()}
              </h1>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  status === 'Paid' || status === 'Invoiced' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                }`}
              >
                {status}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm text-[#8b7355]">
              <span className="flex items-center gap-1.5">
                <Building2 size={16} /> {operation?.name || 'Unknown Operation'}
              </span>
              {agency && (
                <span className="flex items-center gap-1.5">
                  <Receipt size={16} /> {agency.name}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="luxury-btn text-white rounded-xl text-sm font-bold border-0 cursor-pointer px-6 py-2 flex items-center gap-2 disabled:opacity-50"
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
          <div className="luxury-card rounded-[24px] p-6">
            <h2 className="font-serif-display text-xl font-semibold text-[#2a2420] mb-4">Inspection Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-[#8b7355] uppercase tracking-wider mb-2">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Inspection['status'])}
                  className="w-full luxury-input rounded-2xl px-4 py-3 text-sm outline-none"
                >
                  <option value="Scheduled">Scheduled</option>
                  <option value="Prep">Prep</option>
                  <option value="Inspected">Inspected</option>
                  <option value="Report">Report</option>
                  <option value="Invoiced">Invoiced</option>
                  <option value="Paid">Paid</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#8b7355] uppercase tracking-wider mb-2">Date</label>
                <div className="w-full bg-[rgba(212,165,116,0.04)] border border-[rgba(212,165,116,0.15)] rounded-2xl px-4 py-3 text-sm text-[#4a4038]">
                  {new Date(inspection.date).toLocaleDateString()}
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-[#8b7355] uppercase tracking-wider mb-2">
                  Scope of Inspection
                </label>
                <textarea
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  rows={3}
                  className="w-full resize-none luxury-input rounded-2xl px-4 py-3 text-sm outline-none"
                  placeholder="Describe the scope of this inspection (e.g., fields, crops, processes reviewed)..."
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="luxury-card rounded-[24px] p-6 flex-1 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <FileText size={18} className="text-[#d4a574]" />
              <h2 className="font-serif-display text-xl font-semibold text-[#2a2420]">Inspection Notes</h2>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full flex-1 min-h-[200px] resize-none bg-[#FDFCFB] border border-[rgba(212,165,116,0.15)] border-dashed rounded-2xl p-4 text-sm text-[#4a4038] focus:outline-none focus:ring-2 focus:ring-[#d4a574]/20 focus:border-[#d4a574]/50 transition-all"
              placeholder="Enter detailed notes about the inspection here..."
            ></textarea>
          </div>
          {/* Report Notes */}
          <div className="luxury-card rounded-[24px] p-6 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle size={18} className="text-[#d4a574]" />
              <h2 className="font-serif-display text-xl font-semibold text-[#2a2420]">Report Notes</h2>
            </div>
            <textarea
              value={reportNotes}
              onChange={(e) => setReportNotes(e.target.value)}
              className="w-full min-h-[140px] resize-none bg-[#FDFCFB] border border-[rgba(212,165,116,0.15)] border-dashed rounded-2xl p-4 text-sm text-[#4a4038] focus:outline-none focus:ring-2 focus:ring-[#d4a574]/20 focus:border-[#d4a574]/50 transition-all"
              placeholder="Notes to include in the official inspection report..."
            />
          </div>

          {/* Tasks */}
          <div className="min-h-[280px]">
            <TasksWidget inspectionId={id} title="Inspection Tasks" />
          </div>

          {/* Additional Billing Items */}
          <div className="luxury-card rounded-[24px] p-6 flex-1 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <Receipt size={18} className="text-[#d4a574]" />
              <h2 className="font-serif-display text-xl font-semibold text-[#2a2420]">Additional Billing Items</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-xs font-bold text-[#8b7355] uppercase tracking-wider mb-2">
                  Miles Driven
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={milesDriven}
                  onChange={(e) => setMilesDriven(parseInt(e.target.value) || 0)}
                  className="w-full luxury-input rounded-2xl px-4 py-3 text-sm outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#8b7355] uppercase tracking-wider mb-2">
                  Meals & Expenses ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={mealsAndExpenses}
                  onChange={(e) => setMealsAndExpenses(parseFloat(e.target.value) || 0)}
                  className="w-full luxury-input rounded-2xl px-4 py-3 text-sm outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#8b7355] uppercase tracking-wider mb-2">
                  Per Diem (Days)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={perDiemDays}
                  onChange={(e) => setPerDiemDays(parseInt(e.target.value) || 0)}
                  className="w-full luxury-input rounded-2xl px-4 py-3 text-sm outline-none"
                />
              </div>
            </div>

            <div className="border-t border-[rgba(212,165,116,0.12)] pt-6 mb-6">
              <h3 className="text-sm font-bold text-[#2a2420] mb-4">Custom Line Item</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-[#8b7355] uppercase tracking-wider mb-2">
                    Item Description
                  </label>
                  <input
                    type="text"
                    value={customLineItemName}
                    onChange={(e) => setCustomLineItemName(e.target.value)}
                    placeholder="e.g., Hotel Stay"
                    className="w-full luxury-input rounded-2xl px-4 py-3 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#8b7355] uppercase tracking-wider mb-2">
                    Amount ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={customLineItemAmount}
                    onChange={(e) => setCustomLineItemAmount(parseFloat(e.target.value) || 0)}
                    className="w-full luxury-input rounded-2xl px-4 py-3 text-sm outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-[rgba(212,165,116,0.12)] pt-6 space-y-6">
              <div>
                <label className="block text-xs font-bold text-[#8b7355] uppercase tracking-wider mb-2">
                  Invoice Notes
                </label>
                <textarea
                  value={invoiceNotes}
                  onChange={(e) => setInvoiceNotes(e.target.value)}
                  className="w-full min-h-[80px] resize-none luxury-input rounded-2xl p-4 text-sm outline-none"
                  placeholder="Notes to appear on the invoice..."
                ></textarea>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#8b7355] uppercase tracking-wider mb-2">
                  Exceptions / Internal Notes
                </label>
                <textarea
                  value={invoiceExceptions}
                  onChange={(e) => setInvoiceExceptions(e.target.value)}
                  className="w-full min-h-[80px] resize-none luxury-input rounded-2xl p-4 text-sm outline-none"
                  placeholder="Internal notes or billing exceptions..."
                ></textarea>
              </div>
            </div>
          </div>

          {/* Linked Expenses */}
          <div className="luxury-card rounded-[24px] p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Link2 size={18} className="text-[#d4a574]" />
                <h2 className="font-serif-display text-xl font-semibold text-[#2a2420]">Linked Expenses</h2>
                {linkedExpenses.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-[#d4a574]/10 text-[#d4a574] text-xs font-bold">
                    {linkedExpenses.length} linked
                  </span>
                )}
              </div>
              <button
                onClick={handleSaveLinkedExpenses}
                disabled={savingExpenses}
                className="luxury-btn text-white rounded-xl text-xs font-bold border-0 cursor-pointer px-4 py-1.5 flex items-center gap-1.5 disabled:opacity-50"
              >
                <Save size={13} />
                {savingExpenses ? 'Saving...' : 'Save Links'}
              </button>
            </div>

            <p className="text-xs text-[#8b7355] mb-4">
              Select expenses from your records to attach to this inspection.
            </p>

            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a89b8c]" size={15} />
              <input
                type="text"
                placeholder="Search expenses by vendor or notes..."
                value={expenseSearch}
                onChange={(e) => setExpenseSearch(e.target.value)}
                className="w-full luxury-input rounded-2xl py-3 pl-9 pr-4 text-sm outline-none"
              />
              {expenseSearch && (
                <button
                  onClick={() => setExpenseSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#a89b8c] hover:text-[#7a6b5a]"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Expenses list */}
            {expenses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-[#a89b8c]">
                <DollarSign size={28} className="mb-2 text-[#a89b8c]" />
                <p className="text-sm">No expenses found. Add expenses in the Expenses section.</p>
              </div>
            ) : (
              <div className="border border-[rgba(212,165,116,0.12)] rounded-2xl overflow-hidden divide-y divide-[rgba(212,165,116,0.12)] max-h-72 overflow-y-auto">
                {expenses
                  .filter((exp) => {
                    if (!expenseSearch) return true;
                    const q = expenseSearch.toLowerCase();
                    return (
                      exp.vendor.toLowerCase().includes(q) ||
                      (exp.notes || '').toLowerCase().includes(q) ||
                      exp.date.includes(q)
                    );
                  })
                  .map((exp) => {
                    const isLinked = linkedExpenses.includes(exp.id);
                    return (
                      <label
                        key={exp.id}
                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                          isLinked ? 'bg-[#d4a574]/5 hover:bg-[#d4a574]/10' : 'hover:bg-[rgba(212,165,116,0.04)]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isLinked}
                          onChange={() => handleToggleExpense(exp.id)}
                          className="w-4 h-4 rounded border-[#a89b8c] text-[#d4a574] focus:ring-[#d4a574] shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-[#2a2420] truncate">{exp.vendor}</span>
                            <span className="text-sm font-bold text-[#2a2420] shrink-0">${exp.amount.toFixed(2)}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-[#a89b8c]">
                              {new Date(exp.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                            {exp.notes && <span className="text-xs text-[#a89b8c] truncate">&middot; {exp.notes}</span>}
                          </div>
                        </div>
                      </label>
                    );
                  })}
              </div>
            )}

            {/* Linked summary */}
            {linkedExpenses.length > 0 && (
              <div className="mt-4 pt-4 border-t border-[rgba(212,165,116,0.12)] flex justify-between items-center text-sm">
                <span className="text-[#8b7355]">Total linked amount:</span>
                <span className="font-bold text-[#2a2420]">
                  ${expenses
                    .filter((e) => linkedExpenses.includes(e.id))
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
          <div className="luxury-card rounded-[24px] p-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock size={18} className="text-[#d4a574]" />
              <h2 className="font-serif-display text-xl font-semibold text-[#2a2420]">Time Log</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#8b7355] uppercase tracking-wider mb-2">
                  Base Hours
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={baseHoursLog}
                  onChange={(e) => setBaseHoursLog(parseFloat(e.target.value) || 0)}
                  className="w-full luxury-input rounded-2xl px-4 py-3 text-sm outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#8b7355] uppercase tracking-wider mb-2">
                  Additional Hours
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={additionalHoursLog}
                  onChange={(e) => setAdditionalHoursLog(parseFloat(e.target.value) || 0)}
                  className="w-full luxury-input rounded-2xl px-4 py-3 text-sm outline-none"
                />
              </div>
            </div>
          </div>

          {/* Drive Time & Bundling */}
          <div className="luxury-card rounded-[24px] p-6">
            <div className="flex items-center gap-2 mb-4">
              <Car size={18} className="text-[#d4a574]" />
              <h2 className="font-serif-display text-xl font-semibold text-[#2a2420]">Drive Time</h2>
            </div>

            <div className="space-y-4">
              <label className="flex items-center gap-3 p-3 border border-[rgba(212,165,116,0.15)] rounded-xl cursor-pointer hover:bg-[rgba(212,165,116,0.04)] transition-colors">
                <input
                  type="checkbox"
                  checked={isBundled}
                  onChange={(e) => setIsBundled(e.target.checked)}
                  className="w-4 h-4 text-[#d4a574] rounded border-[#a89b8c] focus:ring-[#d4a574]"
                />
                <span className="text-sm font-medium text-[#4a4038]">Bundled Inspection Trip</span>
              </label>

              <div>
                <label className="block text-xs font-bold text-[#8b7355] uppercase tracking-wider mb-2">
                  {isBundled ? 'Total Trip Drive Time (Hours)' : 'Drive Time (Hours)'}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={totalTripDriveTime}
                  onChange={(e) => setTotalTripDriveTime(parseFloat(e.target.value) || 0)}
                  className="w-full luxury-input rounded-2xl px-4 py-3 text-sm outline-none"
                />
              </div>

              {isBundled && (
                <div>
                  <label className="block text-xs font-bold text-[#8b7355] uppercase tracking-wider mb-2">
                    Number of Stops (Operators)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={totalTripStops}
                    onChange={(e) => setTotalTripStops(parseInt(e.target.value) || 1)}
                    className="w-full luxury-input rounded-2xl px-4 py-3 text-sm outline-none"
                  />
                </div>
              )}

              <div className="pt-3 border-t border-[rgba(212,165,116,0.12)]">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[#8b7355]">Calculated Drive Time:</span>
                  <span className="text-sm font-bold text-[#2a2420]">{calculatedDriveTime.toFixed(2)} hrs</span>
                </div>
                {isBundled && (
                  <p className="text-[10px] text-[#a89b8c] mt-1">
                    (Total drive time rounded to nearest hour, divided by {totalTripStops} stops)
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Invoice Summary */}
          <div className="bg-[#2a2420] rounded-[24px] p-6 shadow-sm text-white">
            <div className="flex items-center gap-2 mb-4">
              <Receipt size={18} className="text-[#d4a574]" />
              <h2 className="text-lg font-bold text-white">Invoice Estimate</h2>
            </div>

            {agency ? (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center text-[#a89b8c]">
                  <span>Base Rate ({agency.flatRateIncludedHours} hrs)</span>
                  <span className="text-white">${(agency.flatRateBaseAmount || agency.flatRateAmount || 0).toFixed(2)}</span>
                </div>
                {additionalHoursLog > 0 && (
                  <div className="flex justify-between items-center text-[#a89b8c]">
                    <span>Add&apos;l Hours ({additionalHoursLog} @ ${agency.additionalHourlyRate}/hr)</span>
                    <span className="text-white">${(additionalHoursLog * (agency.additionalHourlyRate || agency.hourlyRate || 0)).toFixed(2)}</span>
                  </div>
                )}
                {calculatedDriveTime > 0 && (
                  <div className="flex justify-between items-center text-[#a89b8c]">
                    <span>
                      Drive Time ({calculatedDriveTime.toFixed(2)} @ ${(
                        agency.driveTimeHourlyRate || agency.additionalHourlyRate || agency.hourlyRate || 0
                      ).toFixed(2)}
                      /hr)
                    </span>
                    <span className="text-white">
                      ${(calculatedDriveTime * (agency.driveTimeHourlyRate || agency.additionalHourlyRate || agency.hourlyRate || 0)).toFixed(2)}
                    </span>
                  </div>
                )}
                {milesDriven > 0 && (
                  <div className="flex justify-between items-center text-[#a89b8c]">
                    <span>Mileage ({milesDriven} @ ${agency.mileageRate.toFixed(3)}/mi)</span>
                    <span className="text-white">${(milesDriven * agency.mileageRate).toFixed(2)}</span>
                  </div>
                )}
                {mealsAndExpenses > 0 && (
                  <div className="flex justify-between items-center text-[#a89b8c]">
                    <span>Meals & Expenses</span>
                    <span className="text-white">${mealsAndExpenses.toFixed(2)}</span>
                  </div>
                )}
                {perDiemDays > 0 && (
                  <div className="flex justify-between items-center text-[#a89b8c]">
                    <span>Per Diem ({perDiemDays} @ ${(agency.perDiemRate || 0).toFixed(2)}/day)</span>
                    <span className="text-white">${(perDiemDays * (agency.perDiemRate || 0)).toFixed(2)}</span>
                  </div>
                )}
                {customLineItemAmount > 0 && (
                  <div className="flex justify-between items-center text-[#a89b8c]">
                    <span>{customLineItemName || 'Custom Item'}</span>
                    <span className="text-white">${customLineItemAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="pt-3 border-t border-stone-700 flex justify-between items-center font-bold text-lg">
                  <span>Total</span>
                  <span className="text-[#d4a574]">${invoiceTotal.toFixed(2)}</span>
                </div>
              </div>
            ) : (
              <div className="text-sm text-[#a89b8c]">Agency billing info not available.</div>
            )}

            <button
              onClick={handleGenerateInvoice}
              disabled={saving || !agency}
              className="w-full mt-6 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? 'Loading...' : 'View Invoice'}
            </button>
          </div>
        </div>
      </div>
    </div>

    {invoiceEditorOpen && pendingInvoiceData && inspection && operation && agency && (
      <InvoiceEditor
        isOpen={invoiceEditorOpen}
        onClose={() => { setInvoiceEditorOpen(false); setPendingInvoiceData(null); }}
        inspection={inspection}
        operation={operation}
        agency={agency}
        businessProfile={pendingInvoiceData.businessProfile}
        invoiceNumber={pendingInvoiceData.invoiceNumber}
        onSave={handleInvoiceSave}
        onEmail={handleInvoiceEmail}
      />
    )}

    {emailModal && agency && operation && inspection && (
      <InvoiceEmailModal
        isOpen={true}
        onClose={() => setEmailModal(null)}
        agency={agency}
        operation={operation}
        invoiceNumber={emailModal.invoiceNumber}
        totalAmount={emailModal.total}
        inspectionDate={inspection.date}
        pdfBlob={emailModal.pdfBlob}
        onSent={handleEmailSent}
      />
    )}
    </>
  );
}
