import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { FileText, Download } from 'lucide-react';
import { jsPDF } from 'jspdf';

interface Invoice {
  id: string;
  totalAmount: number;
  status: string;
  dateGenerated: string;
}

interface Expense {
  id: string;
  amount: number;
  date: string;
  category: string;
}

interface Inspection {
  id: string;
  milesDriven: number;
  date: string;
}

export default function Reports() {
  const { user } = useAuth();
  const [generating, setGenerating] = useState(false);
  const [year, setYear] = useState<number>(new Date().getFullYear());

  const handleGenerateScheduleC = async () => {
    if (!user) return;
    setGenerating(true);

    try {
      const startOfYear = new Date(year, 0, 1).toISOString();
      const endOfYear = new Date(year, 11, 31, 23, 59, 59).toISOString();

      // 1. Fetch Paid Invoices
      const invoicesRef = collection(db, `users/${user.uid}/invoices`);
      const qInvoices = query(
        invoicesRef,
        where('status', '==', 'Paid')
        // Firestore date range query is complex without indexes. We will fetch and filter client-side for simplicity.
      );
      const invoiceDocs = await getDocs(qInvoices);
      let totalRevenue = 0;
      invoiceDocs.forEach(doc => {
        const data = doc.data() as Invoice;
        if (data.dateGenerated >= startOfYear && data.dateGenerated <= endOfYear) {
          totalRevenue += data.totalAmount || 0;
        }
      });

      // 2. Fetch Expenses
      const expensesRef = collection(db, `users/${user.uid}/expenses`);
      const expenseDocs = await getDocs(expensesRef);
      let totalExpenses = 0;
      let expensesByCategory: Record<string, number> = {};

      expenseDocs.forEach(doc => {
        const data = doc.data() as Expense;
        if (data.date >= startOfYear && data.date <= endOfYear) {
           totalExpenses += data.amount || 0;
           const cat = data.category || 'Uncategorized';
           expensesByCategory[cat] = (expensesByCategory[cat] || 0) + (data.amount || 0);
        }
      });

      // 3. Fetch Mileage and Config
      let mileageRate = 0.67; // fallback
      const configDoc = await getDoc(doc(db, `users/${user.uid}/system_settings/config`));
      if (configDoc.exists()) {
        const configData = configDoc.data();
        if (configData.defaultMileageRate) {
          mileageRate = parseFloat(configData.defaultMileageRate);
        }
      }

      const inspectionsRef = collection(db, `users/${user.uid}/inspections`);
      const inspectionDocs = await getDocs(inspectionsRef);
      let totalMiles = 0;
      inspectionDocs.forEach(doc => {
        const data = doc.data() as Inspection;
        if (data.date >= startOfYear && data.date <= endOfYear) {
          totalMiles += data.milesDriven || 0;
        }
      });

      const mileageDeduction = totalMiles * mileageRate;

      // Generate PDF
      const docPdf = new jsPDF();
      let y = 20;

      docPdf.setFontSize(20);
      docPdf.setFont('helvetica', 'bold');
      docPdf.text(`Schedule C Data Export - ${year}`, 20, y);
      y += 15;

      docPdf.setFontSize(14);
      docPdf.text('Summary', 20, y);
      y += 10;

      docPdf.setFontSize(12);
      docPdf.setFont('helvetica', 'normal');
      docPdf.text(`Gross Receipts or Sales (Paid Invoices): $${totalRevenue.toFixed(2)}`, 20, y);
      y += 10;
      docPdf.text(`Total Business Expenses: $${totalExpenses.toFixed(2)}`, 20, y);
      y += 10;
      docPdf.text(`Business Mileage: ${totalMiles} miles (Deduction: $${mileageDeduction.toFixed(2)} @ $${mileageRate}/mi)`, 20, y);
      y += 15;

      docPdf.setFontSize(14);
      docPdf.setFont('helvetica', 'bold');
      docPdf.text('Expenses by Category', 20, y);
      y += 10;

      docPdf.setFontSize(12);
      docPdf.setFont('helvetica', 'normal');
      if (Object.keys(expensesByCategory).length === 0) {
        docPdf.text('No expenses recorded.', 20, y);
        y += 10;
      } else {
        Object.entries(expensesByCategory).forEach(([cat, amount]) => {
          docPdf.text(`${cat}: $${amount.toFixed(2)}`, 20, y);
          y += 8;
        });
      }

      y += 10;
      docPdf.setFontSize(14);
      docPdf.setFont('helvetica', 'bold');
      const netProfit = totalRevenue - totalExpenses - mileageDeduction;
      docPdf.text(`Estimated Net Profit: $${netProfit.toFixed(2)}`, 20, y);

      docPdf.save(`Schedule_C_Export_${year}.pdf`);

    } catch (error) {
      console.error("Error generating report", error);
      alert("Failed to generate report.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="animate-in fade-in duration-500">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight">Financial Reports</h1>
          <p className="mt-2 text-stone-500 text-sm">Generate tax documents and financial summaries.</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-8 shadow-sm border border-stone-100 max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <FileText size={24} className="text-[#D49A6A]" />
          <h2 className="text-xl font-bold text-stone-900">Schedule C Data Export</h2>
        </div>

        <p className="text-stone-500 text-sm mb-6">
          Generates a PDF summary of your Gross Receipts (Paid Invoices), Expenses by Category, and YTD Mileage Deduction for the selected tax year.
        </p>

        <div className="flex items-center gap-4 mb-8">
          <label className="text-sm font-bold text-stone-700">Tax Year:</label>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            className="bg-stone-50 border border-stone-200 rounded-xl px-4 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
          >
            {[...Array(5)].map((_, i) => {
              const y = new Date().getFullYear() - i;
              return <option key={y} value={y}>{y}</option>;
            })}
          </select>
        </div>

        <button
          onClick={handleGenerateScheduleC}
          disabled={generating}
          className="bg-[#D49A6A] hover:bg-[#c28a5c] text-white px-6 py-3 rounded-xl text-sm font-medium transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
        >
          <Download size={18} />
          {generating ? 'Generating PDF...' : 'Download Schedule C PDF'}
        </button>
      </div>
    </div>
  );
}
