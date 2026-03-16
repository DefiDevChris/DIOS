import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { logger } from '@dios/shared';
import { Receipt, Calendar, Building2, ExternalLink, FileDown, Loader, Mail, Cloud } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { format } from 'date-fns';
import { generateInvoicePdf } from '../lib/pdfGenerator';
import type { InvoiceData } from '@dios/shared';
import { uploadToDrive } from '../lib/driveSync';
import Swal from 'sweetalert2';
import { useDatabase } from '../hooks/useDatabase';
import { useSheetsSync } from '../hooks/useSheetsSync';
import InvoiceEmailModal from '../components/InvoiceEmailModal';
import type { Invoice, Inspection, Agency, Operation, Expense } from '@dios/shared/types';

export default function Invoices() {
  const { user, googleAccessToken } = useAuth();
  const { syncInspection } = useSheetsSync();
  const [searchParams, setSearchParams] = useSearchParams();

  // Database hooks
  const { findAll: findAllInvoices, save: saveInvoice } = useDatabase<Invoice>({ table: 'invoices' });
  const { findById: findInspectionById } = useDatabase<Inspection>({ table: 'inspections' });
  const { findById: findAgencyById } = useDatabase<Agency>({ table: 'agencies' });
  const { findById: findOperationById } = useDatabase<Operation>({ table: 'operations' });
  const { findAll: findAllExpenses } = useDatabase<Expense>({ table: 'expenses' });

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'All' | 'Not Complete' | 'Sent' | 'Paid'>('All');
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null);
  const [savingToDrive, setSavingToDrive] = useState<string | null>(null);
  const [emailModal, setEmailModal] = useState<{
    isOpen: boolean;
    agency: Agency | null;
    operation: Operation | null;
    invoiceNumber: string;
    totalAmount: number;
    inspectionDate: string;
    pdfBlob: Blob | null;
  } | null>(null);

  const currentYear = new Date().getFullYear();
  // Read selectedYear from URL search params (synced with Layout's year selector)
  const selectedYear = Number(searchParams.get('year')) || currentYear;
  const setSelectedYear = (year: number) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('year', String(year));
      return next;
    });
  };

  const filteredByYear = invoices.filter(inv => {
    if (inv.status === 'Paid' && inv.paidDate) {
      return new Date(inv.paidDate).getFullYear() === selectedYear;
    }
    return new Date(inv.date).getFullYear() === selectedYear;
  });

  const summaryTotals = {
    awaitingPayment: filteredByYear.filter(i => i.status === 'Sent').reduce((sum, i) => sum + i.totalAmount, 0),
    paid: filteredByYear.filter(i => i.status === 'Paid').reduce((sum, i) => sum + i.totalAmount, 0),
    notCompleteCount: filteredByYear.filter(i => i.status === 'Not Complete').length,
  };

  const availableYears = [...new Set(invoices.map(inv => {
    if (inv.status === 'Paid' && inv.paidDate) return new Date(inv.paidDate).getFullYear();
    return new Date(inv.date).getFullYear();
  }))].sort((a, b) => b - a);

  if (!availableYears.includes(currentYear)) {
    availableYears.unshift(currentYear);
  }

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchInvoices = async () => {
      try {
        const data = await findAllInvoices();
        setInvoices(data);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'invoices');
      } finally {
        setLoading(false);
      }
    };

    fetchInvoices();
  }, [user, findAllInvoices]);

  const markPaid = async (invoiceId: string) => {
    if (!user) return;
    try {
      const invoice = invoices.find(i => i.id === invoiceId);
      if (!invoice) return;

      const updatedInvoice: Invoice = {
        id: invoiceId,
        inspectionId: invoice.inspectionId,
        operationId: invoice.operationId,
        operationName: invoice.operationName,
        agencyId: invoice.agencyId,
        agencyName: invoice.agencyName,
        date: invoice.date,
        inspectionDate: invoice.inspectionDate,
        totalAmount: invoice.totalAmount,
        pdfDriveId: invoice.pdfDriveId,
        status: 'Paid',
        paidDate: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        syncStatus: 'pending',
      };

      await saveInvoice(updatedInvoice);

      // Refresh invoices list
      const updatedInvoices = await findAllInvoices();
      setInvoices(updatedInvoices);
      syncInspection(invoice.inspectionId).catch(() => {});
    } catch (error) {
      logger.error('Error updating invoice status', error);
    }
  };

  const handleDownloadPdf = async (invoice: Invoice) => {
    if (!user) return;
    setGeneratingPdf(invoice.id);

    try {
      // 1. Fetch inspection data
      const inspectionData = await findInspectionById(invoice.inspectionId);

      // 2. Fetch agency data
      let agencyData: Agency | null = null;
      if (invoice.agencyId) {
        agencyData = await findAgencyById(invoice.agencyId);
      }

      // 3. Fetch operation address
      let operationAddress = '';
      if (invoice.operationId) {
        const op = await findOperationById(invoice.operationId);
        if (op) operationAddress = op.address || '';
      }

      // 4. Sum any linked expenses for meals totals
      let linkedMeals = 0;
      const linkedExpenses = inspectionData?.linkedExpenses;
      if (linkedExpenses && linkedExpenses.length > 0) {
        const allExpenses = await findAllExpenses();
        const expenseIds = (typeof linkedExpenses === 'string' ? [linkedExpenses] : linkedExpenses).slice(0, 10);
        expenseIds.forEach((expId: string) => {
          const exp = allExpenses.find(e => e.id === expId);
          if (exp) linkedMeals += exp.amount || 0;
        });
      }

      // 5. Build line items using stored lineItems or fallback
      let lineItems = [];
      let totalAmount = invoice.totalAmount;

      const inspectionLineItems = inspectionData?.lineItems;
      if (inspectionLineItems) {
        try {
          lineItems = JSON.parse(inspectionLineItems);
        } catch {
          lineItems = [];
        }
      }

      if (lineItems.length === 0) {
        // Fallback: build simple line items from legacy data
        const baseAmount = agencyData?.flatRateAmount || 0;
        if (baseAmount > 0) {
          lineItems.push({ name: 'Inspection Fee', amount: baseAmount, details: '' });
        }
        totalAmount = invoice.totalAmount || baseAmount;
      }

      // Load business profile for PDF header
      let bp: Record<string, unknown> = {};
      try {
        const { getSystemConfig } = await import('../utils/systemConfig');
        bp = await getSystemConfig(user.uid);
      } catch {
        // system_settings may not exist yet
      }

      const invoiceDataForPdf: InvoiceData = {
        invoiceNumber: invoice.invoiceNumber || `INV-${invoice.id.slice(0, 6).toUpperCase()}`,
        date: invoice.date ? format(new Date(invoice.date), 'MMM d, yyyy') : format(new Date(), 'MMM d, yyyy'),
        businessName: (bp.businessName as string) ?? '',
        businessAddress: (bp.businessAddress as string) ?? '',
        businessPhone: (bp.businessPhone as string) ?? '',
        businessEmail: (bp.businessEmail as string) ?? '',
        ownerName: (bp.ownerName as string) ?? '',
        operationName: invoice.operationName,
        operationAddress,
        agencyName: invoice.agencyName,
        agencyAddress: agencyData?.billingAddress || '',
        lineItems,
        totalAmount,
        notes: inspectionData?.invoiceNotes || '',
      };

      const pdfBlob = generateInvoicePdf(invoiceDataForPdf);
      const fileName = `Invoice_${invoiceDataForPdf.invoiceNumber}_${invoice.operationName.replace(/\s+/g, '_')}.pdf`;

      // 6. Download locally
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      logger.error('Error generating invoice PDF:', error);
      Swal.fire({ text: 'Failed to generate invoice PDF.', icon: 'error' });
    } finally {
      setGeneratingPdf(null);
    }
  };

  const handleEmailInvoice = async (invoice: Invoice) => {
    if (!user) return;
    setGeneratingPdf(invoice.id);
    try {
      const inspectionData = await findInspectionById(invoice.inspectionId);
      const agencyData = invoice.agencyId ? await findAgencyById(invoice.agencyId) : null;
      const operationData = invoice.operationId ? await findOperationById(invoice.operationId) : null;

      let linkedMeals = 0;
      const linkedExpenses = inspectionData?.linkedExpenses;
      if (linkedExpenses && linkedExpenses.length > 0) {
        const allExpenses = await findAllExpenses();
        (typeof linkedExpenses === 'string' ? [linkedExpenses] : linkedExpenses).slice(0, 10).forEach((expId: string) => {
          const exp = allExpenses.find(e => e.id === expId);
          if (exp) linkedMeals += exp.amount || 0;
        });
      }

      let lineItems = [];
      const inspectionLineItems = inspectionData?.lineItems;
      if (inspectionLineItems) {
        try { lineItems = JSON.parse(inspectionLineItems); } catch { lineItems = []; }
      }
      if (lineItems.length === 0 && agencyData) {
        const baseAmount = agencyData.flatRateAmount || 0;
        if (baseAmount > 0) lineItems.push({ name: 'Inspection Fee', amount: baseAmount, details: '' });
      }

      // Load business profile for PDF header
      let bpEmail: Record<string, unknown> = {};
      try {
        const { getSystemConfig } = await import('../utils/systemConfig');
        bpEmail = await getSystemConfig(user.uid);
      } catch {
        // system_settings may not exist yet
      }

      const invoiceNumber = invoice.invoiceNumber || `INV-${invoice.id.slice(0, 6).toUpperCase()}`;
      const pdfBlob = generateInvoicePdf({
        invoiceNumber,
        date: invoice.date ? format(new Date(invoice.date), 'MMM d, yyyy') : format(new Date(), 'MMM d, yyyy'),
        businessName: (bpEmail.businessName as string) ?? '',
        businessAddress: (bpEmail.businessAddress as string) ?? '',
        businessPhone: (bpEmail.businessPhone as string) ?? '',
        businessEmail: (bpEmail.businessEmail as string) ?? '',
        ownerName: (bpEmail.ownerName as string) ?? '',
        operationName: invoice.operationName,
        operationAddress: operationData?.address || '',
        agencyName: invoice.agencyName,
        agencyAddress: agencyData?.billingAddress || '',
        lineItems,
        totalAmount: invoice.totalAmount,
        notes: inspectionData?.invoiceNotes || '',
      });

      setEmailModal({
        isOpen: true,
        agency: agencyData,
        operation: operationData,
        invoiceNumber,
        totalAmount: invoice.totalAmount,
        inspectionDate: invoice.inspectionDate || invoice.date,
        pdfBlob,
      });
    } catch (error) {
      logger.error('Error preparing invoice email:', error);
      Swal.fire({ text: 'Failed to prepare invoice email.', icon: 'error' });
    } finally {
      setGeneratingPdf(null);
    }
  };

  const handleEmailSent = async () => {
    if (!emailModal) return;
    const invoice = invoices.find(i =>
      (i.invoiceNumber && i.invoiceNumber === emailModal.invoiceNumber) ||
      `INV-${i.id.slice(0, 6).toUpperCase()}` === emailModal.invoiceNumber
    );
    if (invoice && invoice.status === 'Not Complete') {
      try {
        const updatedInvoice: Invoice = {
          ...invoice,
          status: 'Sent',
          sentDate: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          syncStatus: 'pending',
        };
        await saveInvoice(updatedInvoice);
        const updated = await findAllInvoices();
        setInvoices(updated);
        syncInspection(invoice.inspectionId).catch(() => {});
      } catch (error) {
        logger.error('Error updating invoice status after email:', error);
      }
    }
    setEmailModal(null);
  };

  const handleSaveToDrive = async (invoice: Invoice) => {
    if (!user) return;
    const token = googleAccessToken || sessionStorage.getItem('googleAccessToken');
    if (!token) {
      Swal.fire({ text: 'Sign in with Google to save to Drive.', icon: 'info' });
      return;
    }
    setSavingToDrive(invoice.id);
    try {
      const inspectionData = await findInspectionById(invoice.inspectionId);
      let agencyData: Agency | null = null;
      if (invoice.agencyId) {
        agencyData = await findAgencyById(invoice.agencyId);
      }
      let operationAddress = '';
      if (invoice.operationId) {
        const op = await findOperationById(invoice.operationId);
        if (op) operationAddress = op.address || '';
      }

      let lineItems: any[] = [];
      const inspectionLineItems = inspectionData?.lineItems;
      if (inspectionLineItems) {
        try { lineItems = JSON.parse(inspectionLineItems); } catch { lineItems = []; }
      }
      if (lineItems.length === 0) {
        const baseAmount = agencyData?.flatRateAmount || 0;
        if (baseAmount > 0) lineItems.push({ name: 'Inspection Fee', amount: baseAmount, details: '' });
      }

      const invoiceNumber = `INV-${invoice.id.slice(0, 6).toUpperCase()}`;
      const year = invoice.date ? new Date(invoice.date).getFullYear() : new Date().getFullYear();
      const fileName = `Invoice_${invoiceNumber}_${invoice.operationName.replace(/\s+/g, '_')}.pdf`;

      const pdfBlob = generateInvoicePdf({
        invoiceNumber,
        date: invoice.date ? format(new Date(invoice.date), 'MMM d, yyyy') : format(new Date(), 'MMM d, yyyy'),
        businessName: '',
        businessAddress: '',
        businessPhone: '',
        businessEmail: '',
        ownerName: '',
        operationName: invoice.operationName,
        operationAddress,
        agencyName: invoice.agencyName,
        agencyAddress: agencyData?.billingAddress || '',
        lineItems,
        totalAmount: invoice.totalAmount,
        notes: inspectionData?.invoiceNotes || '',
      });

      const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
      const result = await uploadToDrive(token, user.uid, file, invoice.agencyName, invoice.operationName, String(year));

      const updatedInvoice: Invoice = {
        ...invoice,
        pdfDriveId: result.id,
        updatedAt: new Date().toISOString(),
        syncStatus: 'pending',
      };
      await saveInvoice(updatedInvoice);

      const updated = await findAllInvoices();
      setInvoices(updated);

      Swal.fire({
        icon: 'success',
        title: 'Saved to Drive',
        html: `<a href="${result.webViewLink}" target="_blank" rel="noopener noreferrer" style="color:#2563eb">View in Drive</a>`,
        timer: 5000,
        showConfirmButton: false,
      });
    } catch (error) {
      logger.error('Error saving invoice to Drive:', error);
      Swal.fire({ text: 'Failed to save to Drive.', icon: 'error' });
    } finally {
      setSavingToDrive(null);
    }
  };

  return (
    <div className="animate-in fade-in duration-500">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight">Invoices</h1>
          <p className="mt-2 text-stone-500">Manage and track your generated invoices.</p>
        </div>

        <div className="flex bg-white rounded-xl border border-stone-200 p-1 shadow-sm">
          {(['All', 'Not Complete', 'Sent', 'Paid'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === f
                  ? 'bg-stone-100 text-stone-900 shadow-sm'
                  : 'text-stone-500 hover:text-stone-900 hover:bg-stone-50'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Year Selector + Summary */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          {availableYears.map(year => (
            <button
              key={year}
              onClick={() => setSelectedYear(year)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                selectedYear === year
                  ? 'bg-[#D49A6A] text-white shadow-sm'
                  : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
              }`}
            >
              {year}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-6">
          <div className="text-center">
            <p className="text-xs font-bold text-stone-400 uppercase tracking-wider">Awaiting</p>
            <p className="text-lg font-bold text-amber-600">${summaryTotals.awaitingPayment.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className="text-center">
            <p className="text-xs font-bold text-stone-400 uppercase tracking-wider">Paid</p>
            <p className="text-lg font-bold text-emerald-600">${summaryTotals.paid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className="text-center">
            <p className="text-xs font-bold text-stone-400 uppercase tracking-wider">Not Complete</p>
            <p className="text-lg font-bold text-stone-600">{summaryTotals.notCompleteCount}</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-stone-500">Loading invoices...</div>
      ) : (
        <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/50">
                  <th className="text-left py-4 px-6 text-xs font-bold text-stone-500 uppercase tracking-wider">Date</th>
                  <th className="text-left py-4 px-6 text-xs font-bold text-stone-500 uppercase tracking-wider">Operation / Agency</th>
                  <th className="text-right py-4 px-6 text-xs font-bold text-stone-500 uppercase tracking-wider">Amount</th>
                  <th className="text-center py-4 px-6 text-xs font-bold text-stone-500 uppercase tracking-wider">Status</th>
                  <th className="text-right py-4 px-6 text-xs font-bold text-stone-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredByYear.filter(inv => filter === 'All' || inv.status === filter).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-stone-500">No invoices found matching the filter.</td>
                  </tr>
                ) : (
                  filteredByYear.filter(inv => filter === 'All' || inv.status === filter).map(invoice => (
                    <tr key={invoice.id} className="hover:bg-stone-50/50 transition-colors">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2 text-stone-900 font-medium">
                          <Calendar size={16} className="text-stone-400" />
                          {format(new Date(invoice.date), 'MMM d, yyyy')}
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium text-stone-900 flex items-center gap-1.5">
                            <Building2 size={14} className="text-stone-400" />
                            {invoice.operationName}
                          </span>
                          <span className="text-sm text-stone-500 flex items-center gap-1.5">
                            <Receipt size={14} className="text-stone-400" />
                            {invoice.agencyName}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-right font-medium text-stone-900">
                        ${invoice.totalAmount.toFixed(2)}
                      </td>
                      <td className="py-4 px-6 text-center">
                        {invoice.status === 'Sent' ? (
                          <button
                            onClick={() => markPaid(invoice.id)}
                            className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
                          >
                            Mark Paid
                          </button>
                        ) : (
                          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                            invoice.status === 'Paid'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-stone-100 text-stone-600'
                          }`}>
                            {invoice.status}
                            {invoice.status === 'Paid' && invoice.paidDate && (
                              <span className="font-normal ml-1">
                                {format(new Date(invoice.paidDate), 'M/d')}
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleDownloadPdf(invoice)}
                            disabled={generatingPdf === invoice.id}
                            title="Download PDF"
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors bg-stone-100 px-3 py-1.5 rounded-lg hover:bg-stone-200 disabled:opacity-50"
                          >
                            {generatingPdf === invoice.id
                              ? <Loader size={14} className="animate-spin" />
                              : <FileDown size={14} />
                            }
                            PDF
                          </button>
                          <button
                            onClick={() => handleEmailInvoice(invoice)}
                            disabled={generatingPdf === invoice.id}
                            title="Email Invoice"
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors bg-stone-100 px-3 py-1.5 rounded-lg hover:bg-stone-200 disabled:opacity-50"
                          >
                            <Mail size={14} />
                            Email
                          </button>
                          {invoice.pdfDriveId ? (
                            <a
                              href={`https://drive.google.com/file/d/${invoice.pdfDriveId}/view`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="View in Drive"
                              className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100"
                            >
                              <Cloud size={14} />
                              Drive
                            </a>
                          ) : (
                            <button
                              onClick={() => handleSaveToDrive(invoice)}
                              disabled={savingToDrive === invoice.id}
                              title="Save to Drive"
                              className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors bg-stone-100 px-3 py-1.5 rounded-lg hover:bg-stone-200 disabled:opacity-50"
                            >
                              {savingToDrive === invoice.id
                                ? <Loader size={14} className="animate-spin" />
                                : <Cloud size={14} />
                              }
                              Drive
                            </button>
                          )}
                          <Link
                            to={`/inspections/${invoice.inspectionId}`}
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#D49A6A] hover:text-[#c28a5c] transition-colors bg-[#D49A6A]/10 px-3 py-1.5 rounded-lg hover:bg-[#D49A6A]/20"
                          >
                            View Source <ExternalLink size={14} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {emailModal?.isOpen && emailModal.agency && emailModal.operation && emailModal.pdfBlob && (
        <InvoiceEmailModal
          isOpen={true}
          onClose={() => setEmailModal(null)}
          agency={emailModal.agency}
          operation={emailModal.operation}
          invoiceNumber={emailModal.invoiceNumber}
          totalAmount={emailModal.totalAmount}
          inspectionDate={emailModal.inspectionDate}
          pdfBlob={emailModal.pdfBlob}
          onSent={handleEmailSent}
        />
      )}
    </div>
  );
}
