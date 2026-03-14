import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import {
  collection, query, orderBy, onSnapshot, doc, updateDoc, getDoc, getDocs, where
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { Receipt, Calendar, Building2, ExternalLink, FileDown, Loader } from 'lucide-react';
import { Link } from 'react-router';
import { format } from 'date-fns';
import { generateInvoicePdf, InvoiceData } from '../lib/pdfGenerator';
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
  status: 'Unpaid' | 'Paid';
}

export default function Invoices() {
  const { user, googleAccessToken } = useAuth();
  const { triggerSync } = useBackgroundSync();
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'All' | 'Unpaid' | 'Paid'>('All');
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null);

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

  const toggleStatus = async (invoiceId: string, currentStatus: string) => {
    if (!user) return;
    const newStatus = currentStatus === 'Unpaid' ? 'Paid' : 'Unpaid';
    try {
      await updateDoc(doc(db, `users/${user.uid}/invoices/${invoiceId}`), {
        status: newStatus
      });
    } catch (error) {
      console.error("Error updating invoice status", error);
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

      // 5. Calculate invoice totals using the same logic as InspectionProfile
      const baseHours = inspectionData.baseHoursLog || 0;
      const additionalHours = inspectionData.additionalHoursLog || 0;
      const milesDriven = inspectionData.milesDriven || 0;
      const isBundled = inspectionData.isBundled || false;
      const totalTripDriveTime = inspectionData.totalTripDriveTime || 0;
      const totalTripStops = inspectionData.totalTripStops || 1;
      const mealsAndExpenses = (inspectionData.mealsAndExpenses || 0) + linkedMeals;
      const perDiemDays = inspectionData.perDiemDays || 0;
      const customLineItemName = inspectionData.customLineItemName || '';
      const customLineItemAmount = inspectionData.customLineItemAmount || 0;

      const driveTime = isBundled && totalTripStops > 0
        ? Math.round(totalTripDriveTime) / totalTripStops
        : totalTripDriveTime;

      const baseAmount = agencyData.flatRateBaseAmount || 0;
      const additionalHourlyRate = agencyData.additionalHourlyRate || 0;
      const travelRate = agencyData.travelTimeHourlyRate || additionalHourlyRate;
      const mileageRate = agencyData.mileageRate || 0.67;
      const perDiemRate = agencyData.perDiemRate || 0;

      const calculatedTotal =
        baseAmount +
        additionalHours * additionalHourlyRate +
        driveTime * travelRate +
        milesDriven * mileageRate +
        mealsAndExpenses +
        perDiemDays * perDiemRate +
        customLineItemAmount;

      const invoiceData: InvoiceData = {
        invoiceNumber: `INV-${invoice.id.slice(0, 6).toUpperCase()}`,
        date: invoice.date ? format(new Date(invoice.date), 'MMM d, yyyy') : format(new Date(), 'MMM d, yyyy'),
        operationName: invoice.operationName,
        operationAddress,
        agencyName: invoice.agencyName,
        baseAmount,
        baseHours: agencyData.flatRateIncludedHours || baseHours,
        additionalHours,
        additionalHourlyRate,
        driveTime,
        travelRate,
        milesDriven,
        mileageRate,
        mealsAndExpenses,
        perDiemDays,
        perDiemRate,
        customLineItemName,
        customLineItemAmount,
        totalAmount: calculatedTotal || invoice.totalAmount,
        notes: inspectionData.invoiceNotes || '',
      };

      const pdfBlob = await generateInvoicePdf(invoiceData);
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
      console.error('Error generating invoice PDF:', error);
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
          {(['All', 'Unpaid', 'Paid'] as const).map((f) => (
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
                {invoices.filter(inv => filter === 'All' || inv.status === filter).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-stone-500">No invoices found matching the filter.</td>
                  </tr>
                ) : (
                  invoices.filter(inv => filter === 'All' || inv.status === filter).map(invoice => (
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
                        <button
                          onClick={() => toggleStatus(invoice.id, invoice.status)}
                          className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider transition-colors ${
                            invoice.status === 'Paid'
                              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                              : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                          }`}
                        >
                          {invoice.status}
                        </button>
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
