import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, query, getDocs, where } from 'firebase/firestore';
import { FileText, Download, Calendar } from 'lucide-react';
import { generateTaxReportPdf, TaxReportData } from '../lib/pdfGenerator';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';

export default function Reports() {
  const { user } = useAuth();
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [generating, setGenerating] = useState(false);

  const availableYears = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  const handleGenerateScheduleC = async () => {
    if (!user) return;
    setGenerating(true);

    try {
      const startOfYear = new Date(selectedYear, 0, 1).toISOString();
      const endOfYear = new Date(selectedYear + 1, 0, 1).toISOString();

      // 1. Fetch Income (Paid Invoices)
      const invoicesPath = `users/${user.uid}/invoices`;
      const invoicesRef = collection(db, invoicesPath);
      const qInvoices = query(
        invoicesRef,
        where('date', '>=', startOfYear),
        where('date', '<', endOfYear),
        where('status', '==', 'Paid')
      );

      const invoiceDocs = await getDocs(qInvoices);
      let totalIncome = 0;
      invoiceDocs.forEach(doc => {
        totalIncome += doc.data().totalAmount || 0;
      });

      // 2. Fetch Expenses (Assuming an expenses collection exists, querying similarly)
      // Since it's a stub requirement, we will try to fetch, if none, we default to 0
      let totalExpenses = 0;
      const expensesByCategory: Record<string, number> = {};

      try {
        const expensesPath = `users/${user.uid}/expenses`;
        const expensesRef = collection(db, expensesPath);
        const qExpenses = query(
          expensesRef,
          where('date', '>=', startOfYear),
          where('date', '<', endOfYear)
        );
        const expenseDocs = await getDocs(qExpenses);

        expenseDocs.forEach(doc => {
          const data = doc.data();
          const category = data.category || 'Uncategorized';
          const amount = data.amount || 0;

          if (!expensesByCategory[category]) {
            expensesByCategory[category] = 0;
          }
          expensesByCategory[category] += amount;
          totalExpenses += amount;
        });
      } catch (e) {
        console.warn('Expenses collection might not exist yet, defaulting to 0.');
      }

      const reportData: TaxReportData = {
        year: selectedYear,
        totalIncome,
        expensesByCategory,
        totalExpenses
      };

      const pdfBlob = await generateTaxReportPdf(reportData);
      const fileName = `Schedule_C_Export_${selectedYear}.pdf`;

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
            console.error('File System Access API error:', err);
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
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      try {
        const token = localStorage.getItem('googleAccessToken');
        if (token && token !== 'dummy') {
          const metadata = {
            name: fileName,
            mimeType: 'application/pdf',
          };

          const form = new FormData();
          form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
          form.append('file', pdfBlob);

          await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`
            },
            body: form
          });
        }
      } catch (err) {
        console.warn("Google Drive upload skipped or failed:", err);
      }

    } catch (error) {
      console.error('Error generating tax report', error);
      alert('Failed to generate Schedule C Export.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="animate-in fade-in duration-500">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight">Reports & Exports</h1>
        <p className="mt-2 text-stone-500">Generate tax documents and financial summaries.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

        {/* Schedule C Export Card */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-200 flex flex-col hover:shadow-md transition-shadow">
          <div className="w-12 h-12 bg-[#D49A6A]/10 rounded-2xl flex items-center justify-center mb-6">
            <FileText size={24} className="text-[#D49A6A]" />
          </div>
          <h2 className="text-xl font-bold text-stone-900 mb-2">Schedule C Export</h2>
          <p className="text-sm text-stone-500 mb-6 flex-1">
            Aggregate your paid invoices and recorded expenses for the selected tax year to generate a Schedule C summary report.
          </p>

          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Tax Year</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all appearance-none"
                >
                  {availableYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={handleGenerateScheduleC}
              disabled={generating}
              className="w-full mt-2 py-2.5 bg-[#D49A6A] hover:bg-[#c28a5c] text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            >
              <Download size={16} />
              {generating ? 'Generating PDF...' : 'Generate PDF'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
