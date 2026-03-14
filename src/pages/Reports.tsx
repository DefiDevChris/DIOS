import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, query, getDocs, where } from 'firebase/firestore';
import { FileText, Download, Calendar, TrendingUp, DollarSign, Clock } from 'lucide-react';
import { generateTaxReportPdf, TaxReportData } from '../lib/pdfGenerator';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface MonthlyRevenueRow {
  month: string;
  Revenue: number;
  Expenses: number;
}

interface HoursRow {
  month: string;
  'Hours Logged': number;
  'Hours Billed': number;
}

function EmptyChartState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-48 text-stone-400 gap-2">
      <TrendingUp size={32} className="text-stone-200" />
      <p className="text-sm">No {label} data for {new Date().getFullYear()}.</p>
      <p className="text-xs text-stone-300">Data will appear here as you record entries.</p>
    </div>
  );
}

export default function Reports() {
  const { user } = useAuth();
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [generating, setGenerating] = useState(false);

  const [monthlyData, setMonthlyData] = useState<MonthlyRevenueRow[]>([]);
  const [hoursData, setHoursData] = useState<HoursRow[]>([]);
  const [chartsLoading, setChartsLoading] = useState(true);

  const availableYears = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  // ── Fetch chart data ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    const fetchChartData = async () => {
      setChartsLoading(true);
      try {
        const startOfYear = new Date(selectedYear, 0, 1).toISOString();
        const endOfYear = new Date(selectedYear + 1, 0, 1).toISOString();

        // Revenue by month
        const revenueByMonth = new Array(12).fill(0);
        const expensesByMonth = new Array(12).fill(0);
        const hoursLoggedByMonth = new Array(12).fill(0);
        const hoursBilledByMonth = new Array(12).fill(0);

        // Invoices
        const invDocs = await getDocs(
          query(
            collection(db, `users/${user.uid}/invoices`),
            where('date', '>=', startOfYear),
            where('date', '<', endOfYear),
            where('status', '==', 'Paid')
          )
        );
        invDocs.forEach(d => {
          const data = d.data();
          const month = new Date(data.date).getMonth();
          revenueByMonth[month] += data.totalAmount || 0;
          // Estimate billed hours from invoice if available
          hoursBilledByMonth[month] += data.hoursLogged || 0;
        });

        // Expenses
        try {
          const expDocs = await getDocs(
            query(
              collection(db, `users/${user.uid}/expenses`),
              where('date', '>=', startOfYear),
              where('date', '<', endOfYear)
            )
          );
          expDocs.forEach(d => {
            const data = d.data();
            const month = new Date(data.date).getMonth();
            expensesByMonth[month] += data.amount || 0;
          });
        } catch {
          // expenses collection may not exist yet
        }

        // Hours logged from inspections
        try {
          const inspDocs = await getDocs(
            collection(db, `users/${user.uid}/inspections`)
          );
          inspDocs.forEach(d => {
            const data = d.data();
            if (!data.date) return;
            const month = new Date(data.date).getMonth();
            const logged = (data.baseHoursLog || 0) + (data.additionalHoursLog || 0);
            hoursLoggedByMonth[month] += logged;
          });
        } catch {
          // inspections may not exist
        }

        const merged: MonthlyRevenueRow[] = MONTH_LABELS.map((label, i) => ({
          month: label,
          Revenue: Math.round(revenueByMonth[i] * 100) / 100,
          Expenses: Math.round(expensesByMonth[i] * 100) / 100,
        }));

        const hours: HoursRow[] = MONTH_LABELS.map((label, i) => ({
          month: label,
          'Hours Logged': Math.round(hoursLoggedByMonth[i] * 10) / 10,
          'Hours Billed': Math.round(hoursBilledByMonth[i] * 10) / 10,
        }));

        setMonthlyData(merged);
        setHoursData(hours);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'reports');
      } finally {
        setChartsLoading(false);
      }
    };

    fetchChartData();
  }, [user, selectedYear]);

  const hasRevenueData = monthlyData.some(r => r.Revenue > 0 || r.Expenses > 0);
  const hasHoursData = hoursData.some(r => r['Hours Logged'] > 0 || r['Hours Billed'] > 0);

  // ── Schedule C PDF generation ─────────────────────────────────────────────
  const handleGenerateScheduleC = async () => {
    if (!user) return;
    setGenerating(true);

    try {
      const startOfYear = new Date(selectedYear, 0, 1).toISOString();
      const endOfYear = new Date(selectedYear + 1, 0, 1).toISOString();

      const invoicesRef = collection(db, `users/${user.uid}/invoices`);
      const qInvoices = query(
        invoicesRef,
        where('date', '>=', startOfYear),
        where('date', '<', endOfYear),
        where('status', '==', 'Paid')
      );
      const invoiceDocs = await getDocs(qInvoices);
      let totalIncome = 0;
      invoiceDocs.forEach(doc => { totalIncome += doc.data().totalAmount || 0; });

      let totalExpenses = 0;
      const expensesByCategory: Record<string, number> = {};
      try {
        const expensesRef = collection(db, `users/${user.uid}/expenses`);
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
          expensesByCategory[category] = (expensesByCategory[category] || 0) + amount;
          totalExpenses += amount;
        });
      } catch {
        console.warn('Expenses collection may not exist yet.');
      }

      const reportData: TaxReportData = { year: selectedYear, totalIncome, expensesByCategory, totalExpenses };
      const pdfBlob = await generateTaxReportPdf(reportData);
      const fileName = `Schedule_C_Export_${selectedYear}.pdf`;

      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: fileName,
            types: [{ description: 'PDF Document', accept: { 'application/pdf': ['.pdf'] } }],
          });
          const writable = await handle.createWritable();
          await writable.write(pdfBlob);
          await writable.close();
        } catch (err: any) {
          if (err.name !== 'AbortError') {
            const url = URL.createObjectURL(pdfBlob);
            const a = document.createElement('a');
            a.href = url; a.download = fileName;
            document.body.appendChild(a); a.click();
            document.body.removeChild(a); URL.revokeObjectURL(url);
          }
        }
      } else {
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
      }

      try {
        const token = localStorage.getItem('googleAccessToken');
        if (token && token !== 'dummy') {
          const metadata = { name: fileName, mimeType: 'application/pdf' };
          const form = new FormData();
          form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
          form.append('file', pdfBlob);
          await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: form,
          });
        }
      } catch { /* Drive upload optional */ }

    } catch (error) {
      console.error('Error generating tax report', error);
      alert('Failed to generate Schedule C Export.');
    } finally {
      setGenerating(false);
    }
  };

  // ── Shared tooltip formatter ──────────────────────────────────────────────
  const currencyFormatter = (value: number) =>
    `$${value.toLocaleString('en-US', { minimumFractionDigits: 0 })}`;

  return (
    <div className="animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight">Reports &amp; Exports</h1>
          <p className="mt-2 text-stone-500">Generate tax documents, financial summaries, and performance charts.</p>
        </div>
        <div className="flex items-center gap-3">
          <Calendar size={16} className="text-stone-400" />
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="bg-white border border-stone-200 rounded-xl px-4 py-2 text-sm font-medium text-stone-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#D49A6A]/20"
          >
            {availableYears.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Top action cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {/* Schedule C Export */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100 flex flex-col hover:shadow-md transition-shadow">
          <div className="w-12 h-12 bg-[#D49A6A]/10 rounded-2xl flex items-center justify-center mb-6">
            <FileText size={24} className="text-[#D49A6A]" />
          </div>
          <h2 className="text-xl font-bold text-stone-900 mb-2">Schedule C Export</h2>
          <p className="text-sm text-stone-500 mb-6 flex-1">
            Aggregate your paid invoices and recorded expenses for the selected tax year to generate a Schedule C summary report.
          </p>
          <button
            onClick={handleGenerateScheduleC}
            disabled={generating}
            className="w-full mt-2 py-2.5 bg-[#D49A6A] hover:bg-[#c28a5c] text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
          >
            <Download size={16} />
            {generating ? 'Generating PDF…' : 'Generate PDF'}
          </button>
        </div>
      </div>

      {/* ── Charts ──────────────────────────────────────────────────────────── */}
      <div className="space-y-6">

        {/* Monthly Revenue vs Expenses */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-emerald-50 rounded-2xl flex items-center justify-center">
              <DollarSign size={20} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900">Monthly Expenses vs. Revenue</h2>
              <p className="text-xs text-stone-400">{selectedYear} · Paid invoices &amp; recorded expenses</p>
            </div>
          </div>
          {chartsLoading ? (
            <div className="h-48 bg-stone-50 rounded-2xl animate-pulse" />
          ) : hasRevenueData ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#78716c' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={currencyFormatter} tick={{ fontSize: 11, fill: '#78716c' }} axisLine={false} tickLine={false} width={70} />
                <Tooltip
                  formatter={(value: number) => currencyFormatter(value)}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e7e5e4', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }} />
                <Bar dataKey="Revenue" fill="#D49A6A" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Expenses" fill="#d6d3d1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChartState label="revenue or expense" />
          )}
        </div>

        {/* Hours Logged vs Billed */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-50 rounded-2xl flex items-center justify-center">
              <Clock size={20} className="text-blue-500" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900">Hours Logged vs. Billed</h2>
              <p className="text-xs text-stone-400">{selectedYear} · Inspection hours logged &amp; invoice hours billed</p>
            </div>
          </div>
          {chartsLoading ? (
            <div className="h-48 bg-stone-50 rounded-2xl animate-pulse" />
          ) : hasHoursData ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={hoursData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#78716c' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#78716c' }} axisLine={false} tickLine={false} unit=" hrs" width={60} />
                <Tooltip
                  formatter={(value: number) => `${value} hrs`}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e7e5e4', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }} />
                <Bar dataKey="Hours Logged" fill="#60a5fa" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Hours Billed" fill="#D49A6A" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChartState label="hours" />
          )}
        </div>

      </div>
    </div>
  );
}
