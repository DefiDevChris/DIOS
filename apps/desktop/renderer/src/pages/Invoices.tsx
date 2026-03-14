import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '@dios/shared/firebase';
import {
  collection, query, orderBy, onSnapshot, doc, updateDoc, getDoc, getDocs, where
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { logger } from '@dios/shared';
import { Receipt, Calendar, Building2, ExternalLink, FileDown, Loader } from 'lucide-react';
import { Link } from 'react-router';
import { format } from 'date-fns';
import { generateInvoicePdf } from '../lib/pdfGenerator';
import type { InvoiceData } from '@dios/shared';
import { queueFile } from '../lib/syncQueue';
import { useBackgroundSync } from '../contexts/BackgroundSyncContext';
import Swal from 'sweetalert2';

interface InvoiceRecord {
  id: string;
  inspectionId: string;
  operationId: string;
  operationName: string;
  agencyId: string;
  agencyName: string;
  date: string;
  inspectionDate: string;
  totalAmount: number;
  status: 'Not Complete' | 'Sent' | 'Paid';
  sentDate?: string;
  paidDate?: string;
}

export default function Invoices() {
  const { user, googleAccessToken } = useAuth();
  const { triggerSync } = useBackgroundSync();
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'All' | 'Not Complete' | 'Sent' | 'Paid'>('All');
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);

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
    if (!user) return;

    const invoicesPath = `users/${user.uid}/invoices`;
    const q = query(
      collection(db, invoicesPath),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const invoiceData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as InvoiceRecord[];

        setInvoices(invoiceData);
        setLoading(false);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, invoicesPath)
    );

    return () => unsubscribe();
  }, [user]);

  const markPaid = async (invoiceId: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, `users/${user.uid}/invoices/${invoiceId}`), {
        status: 'Paid',
        paidDate: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error updating invoice status', error);
    }
  };

  const handleDownloadPdf = async (invoice: InvoiceRecord) => {
    if (!user) return;
    setGeneratingPdf(invoice.id);

    try {
      // 1. Fetch inspection data
      const inspectionSnap = await getDoc(doc(db, `users/${user.uid}/inspections/${invoice.inspectionId}`));
      const inspectionData = inspectionSnap.exists() ? inspectionSnap.data() : {};

      // 2. Fetch agency data
      let agencyData: Record<string, any> = {};
      if (invoice.agencyId) {
        const agencySnap = await getDoc(doc(db, `users/${user.uid}/agencies/${invoice.agencyId}`));
        if (agencySnap.exists()) agencyData = agencySnap.data();
      }

      // 3. Fetch operation address
      let operationAddress = '';
      if (invoice.operationId) {
        const opSnap = await getDoc(doc(db, `users/${user.uid}/operations/${invoice.operationId}`));
        if (opSnap.exists()) operationAddress = opSnap.data().address || '';
      }

      // 4. Sum any linked expenses for meals totals
      let linkedMeals = 0;
      if (inspectionData.linkedExpenses && inspectionData.linkedExpenses.length > 0) {
        const expSnap = await getDocs(
          query(collection(db, `users/${user.uid}/expenses`), where('__name__', 'in', inspectionData.linkedExpenses.slice(0, 10)))
        );
        expSnap.forEach(d => { linkedMeals += d.data().amount || 0; });
      }

      // 5. Build line items using stored lineItems or fallback
      let lineItems = [];
      let totalAmount = invoice.totalAmount;

      if (inspectionData.lineItems) {
        try {
          lineItems = JSON.parse(inspectionData.lineItems);
        } catch {
          lineItems = [];
        }
      }

      if (lineItems.length === 0) {
        // Fallback: build simple line items from legacy data
        const baseAmount = agencyData.flatRateBaseAmount || 0;
        if (baseAmount > 0) {
          lineItems.push({ name: 'Inspection Fee', amount: baseAmount, details: '' });
        }
        totalAmount = invoice.totalAmount || baseAmount;
      }

      const invoiceData: InvoiceData = {
        invoiceNumber: `INV-${invoice.id.slice(0, 6).toUpperCase()}`,
        date: invoice.date ? format(new Date(invoice.date), 'MMM d, yyyy') : format(new Date(), 'MMM d, yyyy'),
        businessName: '',
        businessAddress: '',
        businessPhone: '',
        businessEmail: '',
        ownerName: '',
        operationName: invoice.operationName,
        operationAddress,
        agencyName: invoice.agencyName,
        agencyAddress: agencyData.billingAddress || '',
        lineItems,
        totalAmount,
        notes: inspectionData.invoiceNotes || '',
      };

      const pdfBlob = generateInvoicePdf(invoiceData);
      const year = invoice.date ? new Date(invoice.date).getFullYear() : new Date().getFullYear();
      const fileName = `Invoice_${invoiceData.invoiceNumber}_${invoice.operationName.replace(/\s+/g, '_')}.pdf`;

      // 6. Download locally
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // 7. Queue for Google Drive upload to Reports/{YYYY} folder
      const token = googleAccessToken || localStorage.getItem('googleAccessToken');
      if (token && token !== 'dummy') {
        await queueFile(pdfBlob, {
          fileName,
          year,
          uid: user.uid,
          folderName: 'Reports',
          firestoreDocPath: `users/${user.uid}/invoices/${invoice.id}`,
          firestoreField: 'pdfDriveId',
        });
        triggerSync();
      }
    } catch (error) {
      logger.error('Error generating invoice PDF:', error);
      Swal.fire({ text: 'Failed to generate invoice PDF.', icon: 'error' });
    } finally {
      setGeneratingPdf(null);
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
    </div>
  );
}
