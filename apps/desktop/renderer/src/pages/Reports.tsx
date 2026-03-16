import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useDatabase } from '../hooks/useDatabase';
import { FileText, Download, Calendar, TrendingUp, DollarSign, Clock } from 'lucide-react';
import type { TaxReportData } from '../lib/pdfGenerator';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { logger } from '@dios/shared';
import Swal from 'sweetalert2';
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
import type { Invoice, Expense, Inspection } from '@dios/shared';

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

function EmptyChartState({ label, year }: { label: string; year: number }) {
  return (
    <div className="flex flex-col items-center justify-center h-48 text-[#a89b8c] gap-2">
      <TrendingUp size={32} className="text-[#d4a574]" />
      <p className="text-sm">No {label} data for {year}.</p>
      <p className="text-xs text-[#a89b8c]">Data will appear here as you record entries.</p>
    </div>
  );
}

export default function Reports() {
  const { user, googleAccessToken } = useAuth();
  const { findAll: findAllInvoices } = useDatabase<Invoice>({ table: 'invoices' });
  const { findAll: findAllExpenses } = useDatabase<Expense>({ table: 'expenses' });
  const { findAll: findAllInspections } = useDatabase<Inspection>({ table: 'inspections' });

  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [generating, setGenerating] = useState(false);

  const [monthlyData, setMonthlyData] = useState<MonthlyRevenueRow[]>([]);
  const [hoursData, setHoursData] = useState<HoursRow[]>([]);
  const [chartsLoading, setChartsLoading] = useState(true);

  const currentYear = new Date().getFullYear();
  const availableYears = Array.from({ length: 6 }, (_, i) => currentYear - 3 + i);

  const [totalMiles, setTotalMiles] = useState(0);
  const [irsMileageRate, setIrsMileageRate] = useState(0.70);

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

        // Invoices — cash basis: use paidDate for revenue attribution
        const invoicesData = await findAllInvoices();
        invoicesData.forEach(inv => {
          if (inv.status !== 'Paid') return;
          const paidDate = inv.paidDate || inv.date;
          if (!paidDate) return;
          const paidDateObj = new Date(paidDate);
          if (paidDateObj.getFullYear() !== selectedYear) return;
          const month = paidDateObj.getMonth();
          revenueByMonth[month] += inv.totalAmount || 0;
          hoursBilledByMonth[month] += (inv as any).hoursLogged || 0;
        });

        // Expenses
        try {
          const expensesData = await findAllExpenses();
          expensesData.forEach(exp => {
            if (!exp.date) return;
            const expDate = new Date(exp.date);
            if (expDate.getFullYear() !== selectedYear) return;
            const month = expDate.getMonth();
            expensesByMonth[month] += exp.amount || 0;
          });
        } catch {
          // expenses collection may not exist yet
        }

        // Hours logged + mileage from inspections
        let yearMiles = 0;
        try {
          const inspectionsData = await findAllInspections();
          inspectionsData.forEach(insp => {
            if (!insp.date) return;
            const inspYear = new Date(insp.date).getFullYear();
            if (inspYear !== selectedYear) return;
            const month = new Date(insp.date).getMonth();
            const detailedHours = (insp.prepHours || 0) + (insp.onsiteHours || 0) + (insp.reportHours || 0);
            const logged = detailedHours > 0 ? detailedHours : (insp.baseHoursLog || 0) + (insp.additionalHoursLog || 0);
            hoursLoggedByMonth[month] += logged;
            yearMiles += insp.calculatedMileage || 0;
          });
        } catch {
          // inspections may not exist
        }
        setTotalMiles(yearMiles);

        // Load IRS mileage rate from system settings
        try {
          const { getSystemConfig } = await import('../utils/systemConfig');
          const config = await getSystemConfig(user.uid);
          if (config.irsMileageRate) setIrsMileageRate(config.irsMileageRate as number);
        } catch {
          // system_settings may not exist
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
  }, [user, selectedYear, findAllInvoices, findAllExpenses, findAllInspections]);

  const hasRevenueData = monthlyData.some(r => r.Revenue > 0 || r.Expenses > 0);
  const hasHoursData = hoursData.some(r => r['Hours Logged'] > 0 || r['Hours Billed'] > 0);

  // ── Schedule C PDF generation ─────────────────────────────────────────────
  const handleGenerateScheduleC = async () => {
    if (!user) return;
    setGenerating(true);

    try {
      const startOfYear = new Date(selectedYear, 0, 1).toISOString();
      const endOfYear = new Date(selectedYear + 1, 0, 1).toISOString();

      // Cash-basis: filter by paidDate year
      const invoicesData = await findAllInvoices();
      let totalIncome = 0;
      invoicesData.forEach(inv => {
        if (inv.status !== 'Paid') return;
        const paidDate = inv.paidDate || inv.date;
        if (!paidDate) return;
        if (new Date(paidDate).getFullYear() !== selectedYear) return;
        totalIncome += inv.totalAmount || 0;
      });

      let totalExpenses = 0;
      const expensesByCategory: Record<string, number> = {};
      try {
        const expensesData = await findAllExpenses();
        expensesData.forEach(exp => {
          if (!exp.date) return;
          const expDate = new Date(exp.date);
          if (expDate < new Date(startOfYear) || expDate >= new Date(endOfYear)) return;
          const category = exp.category || 'Uncategorized';
          const amount = exp.amount || 0;
          expensesByCategory[category] = (expensesByCategory[category] || 0) + amount;
          totalExpenses += amount;
        });
      } catch {
        logger.warn('Expenses collection may not exist yet.');
      }

      const reportData = {
        year: selectedYear,
        totalIncome,
        expensesByCategory,
        totalExpenses,
        totalMiles,
        irsMileageRate,
        mileageDeduction: totalMiles * irsMileageRate,
      } as TaxReportData;

      let pdfBlob: Blob;
      try {
        const { generateTaxReportPdf } = await import('../lib/pdfGenerator');
        pdfBlob = generateTaxReportPdf(reportData);
      } catch {
        Swal.fire({ text: 'PDF generation is not yet available.', icon: 'info' });
        return;
      }
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
        const token = googleAccessToken || localStorage.getItem('googleAccessToken');
        if (token) {
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
      logger.error('Error generating tax report', error);
      Swal.fire({ text: 'Failed to generate Schedule C Export.', icon: 'error' });
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
          <h1 className="font-serif-display text-[36px] font-semibold text-[#2a2420] tracking-tight">Reports &amp; Exports</h1>
          <p className="mt-2 text-[#8b7355] font-medium">Generate tax documents, financial summaries, and performance charts.</p>
        </div>
        <div className="flex items-center gap-3">
          <Calendar size={16} className="text-[#a89b8c]" />
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="luxury-input rounded-2xl px-4 py-2 text-sm font-medium outline-none"
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
        <div className="luxury-card rounded-[24px] p-6 flex flex-col hover:shadow-md transition-shadow">
          <div className="w-12 h-12 bg-[#d4a574]/10 rounded-2xl flex items-center justify-center mb-6">
            <FileText size={24} className="text-[#d4a574]" />
          </div>
          <h2 className="text-xl font-bold text-[#2a2420] mb-2">Schedule C Export</h2>
          <p className="text-sm text-[#8b7355] mb-6 flex-1">
            Aggregate your paid invoices and recorded expenses for the selected tax year to generate a Schedule C summary report.
          </p>
          <button
            onClick={handleGenerateScheduleC}
            disabled={generating}
            className="w-full mt-2 py-2.5 luxury-btn text-white rounded-xl text-sm font-bold border-0 cursor-pointer transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
          >
            <Download size={16} />
            {generating ? 'Generating PDF…' : 'Generate PDF'}
          </button>
        </div>
        {/* Mileage Summary */}
        <div className="luxury-card rounded-[24px] p-6 flex flex-col hover:shadow-md transition-shadow">
          <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mb-6">
            <TrendingUp size={24} className="text-blue-500" />
          </div>
          <h2 className="text-xl font-bold text-[#2a2420] mb-2">Mileage Summary</h2>
          <div className="space-y-3 flex-1">
            <div className="flex justify-between text-sm">
              <span className="text-[#8b7355]">Total Miles</span>
              <span className="font-medium text-[#2a2420]">{totalMiles.toFixed(1)} mi</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#8b7355]">IRS Rate</span>
              <span className="font-medium text-[#2a2420]">${irsMileageRate.toFixed(2)}/mi</span>
            </div>
            <div className="flex justify-between text-sm pt-2 border-t border-[rgba(212,165,116,0.12)]">
              <span className="text-[#4a4038] font-medium">Mileage Deduction</span>
              <span className="font-bold text-[#2a2420]">${(totalMiles * irsMileageRate).toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Charts ──────────────────────────────────────────────────────────── */}
      <div className="space-y-6">

        {/* Monthly Revenue vs Expenses */}
        <div className="luxury-card rounded-[24px] p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-emerald-50 rounded-2xl flex items-center justify-center">
              <DollarSign size={20} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#2a2420]">Monthly Expenses vs. Revenue</h2>
              <p className="text-xs text-[#a89b8c]">{selectedYear} · Paid invoices &amp; recorded expenses</p>
            </div>
          </div>
          {chartsLoading ? (
            <div className="h-48 bg-[rgba(212,165,116,0.04)] rounded-2xl animate-pulse" />
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
                <Bar dataKey="Revenue" fill="#d4a574" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Expenses" fill="#d6d3d1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChartState label="revenue or expense" year={selectedYear} />
          )}
        </div>

        {/* Hours Logged vs Billed */}
        <div className="luxury-card rounded-[24px] p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-50 rounded-2xl flex items-center justify-center">
              <Clock size={20} className="text-blue-500" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#2a2420]">Hours Logged vs. Billed</h2>
              <p className="text-xs text-[#a89b8c]">{selectedYear} · Inspection hours logged &amp; invoice hours billed</p>
            </div>
          </div>
          {chartsLoading ? (
            <div className="h-48 bg-[rgba(212,165,116,0.04)] rounded-2xl animate-pulse" />
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
                <Bar dataKey="Hours Billed" fill="#d4a574" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChartState label="hours" year={selectedYear} />
          )}
        </div>

      </div>
    </div>
  );
}
