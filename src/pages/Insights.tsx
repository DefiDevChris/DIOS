import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { BarChart3, TrendingUp, FileText, Building2, Receipt, CheckCircle } from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const PIE_COLORS = ['#34d399', '#60a5fa', '#fbbf24', '#d6d3d1'];

interface Stats {
  totalOperations: number;
  activeOperations: number;
  totalInspections: number;
  scheduledInspections: number;
  completedInspections: number;
  inProgressInspections: number;
  totalInvoices: number;
  paidInvoices: number;
  unpaidInvoices: number;
  totalPaidRevenue: number;
  totalUnpaidRevenue: number;
}

interface MonthlyRevRow {
  month: string;
  Revenue: number;
}

function EmptyChartState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-48 text-stone-400 gap-2">
      <BarChart3 size={32} className="text-stone-200" />
      <p className="text-sm">No {label} data for this period.</p>
      <p className="text-xs text-stone-300">Data will appear here as you record entries.</p>
    </div>
  );
}

export default function Insights() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [monthlyRevenue, setMonthlyRevenue] = useState<MonthlyRevRow[]>([]);

  const availableYears = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  useEffect(() => {
    if (!user) return;

    const fetchStats = async () => {
      setLoading(true);
      try {
        const startOfYear = new Date(selectedYear, 0, 1).toISOString();
        const endOfYear = new Date(selectedYear + 1, 0, 1).toISOString();

        // Operations
        const opsDocs = await getDocs(collection(db, `users/${user.uid}/operations`));
        const totalOperations = opsDocs.size;
        const activeOperations = opsDocs.docs.filter(d => d.data().status === 'active').length;

        // Inspections
        const inspDocs = await getDocs(collection(db, `users/${user.uid}/inspections`));
        const allInspections = inspDocs.docs.map(d => d.data());
        const totalInspections = allInspections.length;
        const scheduledInspections = allInspections.filter(i => i.status === 'Scheduled').length;
        const completedInspections = allInspections.filter(i => i.status === 'Completed').length;
        const inProgressInspections = allInspections.filter(i => i.status === 'In Progress').length;

        // Invoices for selected year
        const invQuery = query(
          collection(db, `users/${user.uid}/invoices`),
          where('date', '>=', startOfYear),
          where('date', '<', endOfYear)
        );
        const invDocs = await getDocs(invQuery);
        const allInvoices = invDocs.docs.map(d => d.data());
        const totalInvoices = allInvoices.length;
        const paidInvoices = allInvoices.filter(i => i.status === 'Paid').length;
        const unpaidInvoices = allInvoices.filter(i => i.status === 'Unpaid').length;
        const totalPaidRevenue = allInvoices.filter(i => i.status === 'Paid').reduce((s, i) => s + (i.totalAmount || 0), 0);
        const totalUnpaidRevenue = allInvoices.filter(i => i.status === 'Unpaid').reduce((s, i) => s + (i.totalAmount || 0), 0);

        // Monthly revenue breakdown
        const revenueByMonth = new Array(12).fill(0);
        allInvoices.filter(i => i.status === 'Paid').forEach(i => {
          if (!i.date) return;
          const month = new Date(i.date).getMonth();
          revenueByMonth[month] += i.totalAmount || 0;
        });
        setMonthlyRevenue(
          MONTH_LABELS.map((label, idx) => ({
            month: label,
            Revenue: Math.round(revenueByMonth[idx] * 100) / 100,
          }))
        );

        setStats({
          totalOperations,
          activeOperations,
          totalInspections,
          scheduledInspections,
          completedInspections,
          inProgressInspections,
          totalInvoices,
          paidInvoices,
          unpaidInvoices,
          totalPaidRevenue,
          totalUnpaidRevenue,
        });
      } catch (error) {
        console.error('Error fetching insights:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [user, selectedYear]);

  const inspectionPieData = stats
    ? [
        { name: 'Completed', value: stats.completedInspections },
        { name: 'Scheduled', value: stats.scheduledInspections },
        { name: 'In Progress', value: stats.inProgressInspections },
        {
          name: 'Other',
          value: Math.max(
            0,
            stats.totalInspections - stats.completedInspections - stats.scheduledInspections - stats.inProgressInspections
          ),
        },
      ].filter(d => d.value > 0)
    : [];

  const hasRevenueChart = monthlyRevenue.some(r => r.Revenue > 0);

  const currencyFormatter = (value: number) =>
    `$${value.toLocaleString('en-US', { minimumFractionDigits: 0 })}`;

  return (
    <div className="animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-stone-100">
              <BarChart3 size={24} className="text-[#D49A6A]" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight">Insights</h1>
              <p className="text-stone-500 text-sm mt-1">Business analytics and performance metrics.</p>
            </div>
          </div>
        </div>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(Number(e.target.value))}
          className="bg-white border border-stone-200 rounded-xl px-4 py-2 text-sm font-medium text-stone-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#D49A6A]/20"
        >
          {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[0, 1, 2].map(i => (
              <div key={i} className="bg-stone-100 rounded-3xl h-36 animate-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-stone-100 rounded-3xl h-64 animate-pulse" />
            <div className="bg-stone-100 rounded-3xl h-64 animate-pulse" />
          </div>
        </div>
      ) : stats ? (
        <div className="space-y-6">

          {/* ── Revenue KPI cards ──────────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-stone-900 rounded-3xl p-6 text-white">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={18} className="text-[#D49A6A]" />
                <span className="text-sm font-medium text-stone-400">Paid Revenue ({selectedYear})</span>
              </div>
              <div className="text-4xl font-extrabold text-white">
                ${stats.totalPaidRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div className="mt-2 text-sm text-stone-400">
                {stats.paidInvoices} paid invoice{stats.paidInvoices !== 1 ? 's' : ''}
              </div>
            </div>
            <div className="bg-white rounded-3xl p-6 border border-stone-100 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Receipt size={18} className="text-amber-500" />
                <span className="text-sm font-medium text-stone-500">Outstanding ({selectedYear})</span>
              </div>
              <div className="text-4xl font-extrabold text-amber-600">
                ${stats.totalUnpaidRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div className="mt-2 text-sm text-stone-400">
                {stats.unpaidInvoices} unpaid invoice{stats.unpaidInvoices !== 1 ? 's' : ''}
              </div>
            </div>
            <div className="bg-white rounded-3xl p-6 border border-stone-100 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <FileText size={18} className="text-stone-400" />
                <span className="text-sm font-medium text-stone-500">Total Invoiced ({selectedYear})</span>
              </div>
              <div className="text-4xl font-extrabold text-stone-900">
                ${(stats.totalPaidRevenue + stats.totalUnpaidRevenue).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div className="mt-2 text-sm text-stone-400">
                {stats.totalInvoices} total invoice{stats.totalInvoices !== 1 ? 's' : ''}
              </div>
            </div>
          </div>

          {/* ── Charts row ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Inspection Completion Rate — Pie chart */}
            <div className="bg-white rounded-3xl p-6 border border-stone-100 shadow-sm">
              <div className="flex items-center gap-2 mb-6">
                <CheckCircle size={18} className="text-[#D49A6A]" />
                <h2 className="text-base font-bold text-stone-900">Inspection Completion Rates</h2>
              </div>
              {inspectionPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={inspectionPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {inspectionPieData.map((_, index) => (
                        <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name: string) => [`${value} (${stats.totalInspections > 0 ? Math.round((value / stats.totalInspections) * 100) : 0}%)`, name]}
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e7e5e4', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChartState label="inspection" />
              )}
              <div className="pt-4 border-t border-stone-100 flex justify-between text-sm mt-2">
                <span className="text-stone-500">Total Inspections</span>
                <span className="font-extrabold text-stone-900 text-lg">{stats.totalInspections}</span>
              </div>
            </div>

            {/* Monthly Revenue — Bar chart */}
            <div className="bg-white rounded-3xl p-6 border border-stone-100 shadow-sm">
              <div className="flex items-center gap-2 mb-6">
                <TrendingUp size={18} className="text-[#D49A6A]" />
                <h2 className="text-base font-bold text-stone-900">Monthly Revenue ({selectedYear})</h2>
              </div>
              {hasRevenueChart ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={monthlyRevenue} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#78716c' }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={currencyFormatter} tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} width={65} />
                    <Tooltip
                      formatter={(value: number) => currencyFormatter(value)}
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e7e5e4', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}
                    />
                    <Bar dataKey="Revenue" fill="#D49A6A" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChartState label="revenue" />
              )}
            </div>

          </div>

          {/* ── Operations & Inspection detail cards ───────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Inspections progress bars */}
            <div className="bg-white rounded-3xl p-6 border border-stone-100 shadow-sm">
              <div className="flex items-center gap-2 mb-6">
                <CheckCircle size={18} className="text-[#D49A6A]" />
                <h2 className="text-base font-bold text-stone-900">Inspections Breakdown (All Time)</h2>
              </div>
              <div className="space-y-4">
                {[
                  { label: 'Completed', count: stats.completedInspections, total: stats.totalInspections, color: 'bg-emerald-400' },
                  { label: 'Scheduled', count: stats.scheduledInspections, total: stats.totalInspections, color: 'bg-blue-400' },
                  { label: 'In Progress', count: stats.inProgressInspections, total: stats.totalInspections, color: 'bg-amber-400' },
                  {
                    label: 'Other',
                    count: Math.max(0, stats.totalInspections - stats.completedInspections - stats.scheduledInspections - stats.inProgressInspections),
                    total: stats.totalInspections,
                    color: 'bg-stone-300',
                  },
                ].map(({ label, count, total, color }) => (
                  <div key={label}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-stone-700">{label}</span>
                      <span className="font-bold text-stone-900">{count}</span>
                    </div>
                    <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${color} rounded-full transition-all duration-500`}
                        style={{ width: total > 0 ? `${(count / total) * 100}%` : '0%' }}
                      />
                    </div>
                  </div>
                ))}
                <div className="pt-3 border-t border-stone-100 flex justify-between items-center text-sm">
                  <span className="text-stone-500">Total Inspections</span>
                  <span className="font-extrabold text-stone-900 text-lg">{stats.totalInspections}</span>
                </div>
              </div>
            </div>

            {/* Operations directory */}
            <div className="bg-white rounded-3xl p-6 border border-stone-100 shadow-sm">
              <div className="flex items-center gap-2 mb-6">
                <Building2 size={18} className="text-[#D49A6A]" />
                <h2 className="text-base font-bold text-stone-900">Operations Directory</h2>
              </div>
              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-stone-50 rounded-2xl">
                  <div>
                    <div className="text-sm font-medium text-stone-500">Active Operations</div>
                    <div className="text-3xl font-extrabold text-stone-900">{stats.activeOperations}</div>
                  </div>
                  <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center">
                    <Building2 size={24} className="text-emerald-600" />
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 bg-stone-50 rounded-2xl">
                  <div>
                    <div className="text-sm font-medium text-stone-500">Total Operations</div>
                    <div className="text-3xl font-extrabold text-stone-900">{stats.totalOperations}</div>
                  </div>
                  <div className="w-14 h-14 rounded-2xl bg-stone-200 flex items-center justify-center">
                    <Building2 size={24} className="text-stone-600" />
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 bg-stone-50 rounded-2xl">
                  <div>
                    <div className="text-sm font-medium text-stone-500">Avg. Inspections / Operation</div>
                    <div className="text-3xl font-extrabold text-stone-900">
                      {stats.totalOperations > 0 ? (stats.totalInspections / stats.totalOperations).toFixed(1) : '0'}
                    </div>
                  </div>
                  <div className="w-14 h-14 rounded-2xl bg-[#D49A6A]/10 flex items-center justify-center">
                    <BarChart3 size={24} className="text-[#D49A6A]" />
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      ) : (
        <div className="text-center py-16 text-stone-500">No data available.</div>
      )}
    </div>
  );
}
