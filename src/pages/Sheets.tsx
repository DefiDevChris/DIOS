import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Table2, Download, ExternalLink, FileSpreadsheet, Loader } from 'lucide-react';

export default function Sheets() {
  const { user, googleAccessToken } = useAuth();
  const [exporting, setExporting] = useState<string | null>(null);

  const token = googleAccessToken || localStorage.getItem('googleAccessToken');

  const createGoogleSheet = async (title: string, rows: string[][]) => {
    if (!token || token === 'dummy') {
      alert('Please sign in with Google to create Sheets.');
      return;
    }
    // Create the spreadsheet via Sheets API
    const body = {
      properties: { title },
      sheets: [{ properties: { title: 'Data' }, data: [{ rowData: rows.map(row => ({ values: row.map(v => ({ userEnteredValue: { stringValue: v } })) })) }] }],
    };
    const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Sheets API error: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return data.spreadsheetUrl as string;
  };

  const exportInspections = async () => {
    if (!user) return;
    setExporting('inspections');
    try {
      const docs = await getDocs(collection(db, `users/${user.uid}/inspections`));
      const header = ['ID', 'Date', 'Status', 'Operation ID', 'Base Hours', 'Additional Hours', 'Miles Driven'];
      const rows: string[][] = [header];
      docs.forEach(d => {
        const data = d.data();
        rows.push([
          d.id,
          data.date || '',
          data.status || '',
          data.operationId || '',
          String(data.baseHoursLog || 0),
          String(data.additionalHoursLog || 0),
          String(data.milesDriven || 0),
        ]);
      });
      const url = await createGoogleSheet(`DIOS Inspections Export – ${new Date().toLocaleDateString()}`, rows);
      if (url) window.open(url, '_blank');
    } catch (err: any) {
      console.error('Export failed:', err);
      alert(`Export failed: ${err.message}`);
    } finally {
      setExporting(null);
    }
  };

  const exportInvoices = async () => {
    if (!user) return;
    setExporting('invoices');
    try {
      const docs = await getDocs(collection(db, `users/${user.uid}/invoices`));
      const header = ['ID', 'Date', 'Operation', 'Agency', 'Amount', 'Status'];
      const rows: string[][] = [header];
      docs.forEach(d => {
        const data = d.data();
        rows.push([
          d.id,
          data.date ? new Date(data.date).toLocaleDateString() : '',
          data.operationName || '',
          data.agencyName || '',
          String(data.totalAmount || 0),
          data.status || '',
        ]);
      });
      const url = await createGoogleSheet(`DIOS Invoices Export – ${new Date().toLocaleDateString()}`, rows);
      if (url) window.open(url, '_blank');
    } catch (err: any) {
      console.error('Export failed:', err);
      alert(`Export failed: ${err.message}`);
    } finally {
      setExporting(null);
    }
  };

  const exportExpenses = async () => {
    if (!user) return;
    setExporting('expenses');
    try {
      const docs = await getDocs(collection(db, `users/${user.uid}/expenses`));
      const header = ['ID', 'Date', 'Vendor', 'Category', 'Amount', 'Notes'];
      const rows: string[][] = [header];
      docs.forEach(d => {
        const data = d.data();
        rows.push([
          d.id,
          data.date || '',
          data.vendor || '',
          data.category || '',
          String(data.amount || 0),
          data.notes || '',
        ]);
      });
      const url = await createGoogleSheet(`DIOS Expenses Export – ${new Date().toLocaleDateString()}`, rows);
      if (url) window.open(url, '_blank');
    } catch (err: any) {
      console.error('Export failed:', err);
      alert(`Export failed: ${err.message}`);
    } finally {
      setExporting(null);
    }
  };

  const exports = [
    {
      key: 'inspections',
      title: 'Inspections',
      description: 'Export all inspection records with dates, statuses, hours logged, and mileage into a Google Sheet.',
      icon: FileSpreadsheet,
      handler: exportInspections,
    },
    {
      key: 'invoices',
      title: 'Invoices',
      description: 'Export all invoice records with operation names, agency details, amounts, and payment statuses.',
      icon: Table2,
      handler: exportInvoices,
    },
    {
      key: 'expenses',
      title: 'Expenses',
      description: 'Export all expense records with vendor details, categories, and amounts for accounting review.',
      icon: Download,
      handler: exportExpenses,
    },
  ];

  return (
    <div className="animate-in fade-in duration-500">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-stone-100">
          <Table2 size={24} className="text-[#D49A6A]" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight">Google Sheets</h1>
          <p className="text-stone-500 text-sm mt-1">Export your data directly to Google Sheets.</p>
        </div>
      </div>

      {!token || token === 'dummy' ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800 mb-6">
          Please sign in with Google to enable Sheets export.
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {exports.map(({ key, title, description, icon: Icon, handler }) => (
          <div key={key} className="bg-white rounded-3xl p-6 border border-stone-100 shadow-sm flex flex-col hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-[#D49A6A]/10 rounded-2xl flex items-center justify-center mb-4">
              <Icon size={24} className="text-[#D49A6A]" />
            </div>
            <h2 className="text-lg font-bold text-stone-900 mb-2">{title}</h2>
            <p className="text-sm text-stone-500 flex-1 mb-6">{description}</p>
            <button
              onClick={handler}
              disabled={!!exporting}
              className="w-full py-2.5 bg-[#D49A6A] hover:bg-[#c28a5c] text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            >
              {exporting === key
                ? <><Loader size={16} className="animate-spin" /> Exporting...</>
                : <><ExternalLink size={16} /> Export to Sheets</>
              }
            </button>
          </div>
        ))}
      </div>

      <div className="mt-8 bg-stone-50 rounded-3xl p-6 border border-stone-200">
        <h3 className="text-sm font-bold text-stone-700 mb-2">How it works</h3>
        <p className="text-sm text-stone-500">
          Clicking "Export to Sheets" will create a new Google Spreadsheet in your Google Drive with all your DIOS data. The sheet will open in a new tab so you can review, share, or further analyze your data. You must be signed in with Google to use this feature.
        </p>
      </div>
    </div>
  );
}
