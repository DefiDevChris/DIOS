import { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { configStore } from '../lib/configStore';
import { Table2, Download, ExternalLink, FileSpreadsheet, Loader, Maximize2, X, FolderOpen } from 'lucide-react';
import Swal from 'sweetalert2';

interface SelectedSheet {
  id: string;
  name: string;
  url: string;
}

// Dynamically load the Google API JS script (gapi)
function loadGapiScript(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window.gapi !== 'undefined') {
      resolve();
      return;
    }
    const existing = document.getElementById('google-api-script');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      return;
    }
    const script = document.createElement('script');
    script.id = 'google-api-script';
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
}

export default function Sheets() {
  const { user, googleAccessToken } = useAuth();
  const [selectedSheet, setSelectedSheet] = useState<SelectedSheet | null>(null);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [iframeError, setIframeError] = useState(false);

  const token = googleAccessToken || localStorage.getItem('googleAccessToken');
  const apiKey = configStore.getConfig()?.googleMapsApiKey ?? '';

  const openPicker = useCallback(async () => {
    if (!token || token === 'dummy') {
      Swal.fire({ text: 'Please sign in with Google to use the Sheets picker.', icon: 'info' });
      return;
    }
    setPickerLoading(true);
    try {
      await loadGapiScript();
      await new Promise<void>((resolve) => window.gapi.load('picker', resolve));

      const view = new window.google.picker.DocsView()
        .setMimeTypes('application/vnd.google-apps.spreadsheet')
        .setIncludeFolders(false);

      const picker = new window.google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(token)
        .setDeveloperKey(apiKey)
        .setTitle('Select a Google Sheet')
        .setCallback((data: GooglePickerData) => {
          if (data.action === window.google.picker.Action.PICKED && data.docs.length > 0) {
            const doc = data.docs[0];
            setSelectedSheet({ id: doc.id, name: doc.name, url: doc.url });
            setIframeError(false);
          }
        })
        .build();

      picker.setVisible(true);
    } catch (err) {
      console.error('Picker failed to open:', err);
      Swal.fire({ text: 'Failed to open the Google Picker. Please try again.', icon: 'error' });
    } finally {
      setPickerLoading(false);
    }
  }, [token, apiKey]);

  const createGoogleSheet = async (title: string, rows: string[][]) => {
    if (!token || token === 'dummy') {
      Swal.fire({ text: 'Please sign in with Google to create Sheets.', icon: 'info' });
      return;
    }
    const body = {
      properties: { title },
      sheets: [{
        properties: { title: 'Data' },
        data: [{
          rowData: rows.map(row => ({
            values: row.map(v => ({ userEnteredValue: { stringValue: v } })),
          })),
        }],
      }],
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
    if (!user || !db) return;
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
    } catch (err: unknown) {
      console.error('Export failed:', err);
      Swal.fire({ text: `Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`, icon: 'error' });
    } finally {
      setExporting(null);
    }
  };

  const exportInvoices = async () => {
    if (!user || !db) return;
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
    } catch (err: unknown) {
      console.error('Export failed:', err);
      Swal.fire({ text: `Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`, icon: 'error' });
    } finally {
      setExporting(null);
    }
  };

  const exportExpenses = async () => {
    if (!user || !db) return;
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
    } catch (err: unknown) {
      console.error('Export failed:', err);
      Swal.fire({ text: `Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`, icon: 'error' });
    } finally {
      setExporting(null);
    }
  };

  const exports = [
    { key: 'inspections', title: 'Inspections', description: 'Export all inspection records with dates, statuses, hours logged, and mileage.', icon: FileSpreadsheet, handler: exportInspections },
    { key: 'invoices', title: 'Invoices', description: 'Export all invoice records with operation names, agency details, amounts, and statuses.', icon: Table2, handler: exportInvoices },
    { key: 'expenses', title: 'Expenses', description: 'Export all expense records with vendor details, categories, and amounts.', icon: Download, handler: exportExpenses },
  ];

  // Build the embedded sheet URL for iframe
  const embeddedUrl = selectedSheet
    ? `https://docs.google.com/spreadsheets/d/${selectedSheet.id}/edit?usp=sharing&rm=minimal`
    : null;

  return (
    <div className="animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-stone-100">
          <Table2 size={24} className="text-[#D49A6A]" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight">Google Sheets</h1>
          <p className="text-stone-500 text-sm mt-1">Select, view, and export data to Google Sheets.</p>
        </div>
      </div>

      {(!token || token === 'dummy') && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800 mb-6">
          Please sign in with Google to use Sheets features.
        </div>
      )}

      {/* Google Picker Section */}
      <div className="bg-white rounded-3xl border border-stone-100 shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-stone-900">Open Existing Sheet</h2>
            <p className="text-sm text-stone-500 mt-0.5">
              Pick a Google Sheet from your Drive to embed it for quick data entry or roster management.
            </p>
          </div>
          <button
            onClick={openPicker}
            disabled={pickerLoading || !token || token === 'dummy'}
            className="px-5 py-2.5 bg-[#D49A6A] hover:bg-[#c28a5c] text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50 shrink-0"
          >
            {pickerLoading
              ? <><Loader size={16} className="animate-spin" /> Loading…</>
              : <><FolderOpen size={16} /> Select from Drive</>
            }
          </button>
        </div>

        {/* Embedded iframe */}
        {selectedSheet && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-stone-700 truncate mr-4">{selectedSheet.name}</span>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={selectedSheet.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open in new tab"
                  className="p-2 text-stone-400 hover:text-[#D49A6A] hover:bg-amber-50 rounded-lg transition-colors"
                >
                  <Maximize2 size={15} />
                </a>
                <button
                  onClick={() => { setSelectedSheet(null); setIframeError(false); }}
                  title="Close"
                  className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <X size={15} />
                </button>
              </div>
            </div>
            {iframeError ? (
              <div className="bg-stone-50 border border-stone-200 rounded-2xl p-8 flex flex-col items-center justify-center text-center">
                <FileSpreadsheet size={36} className="text-stone-300 mb-3" />
                <p className="text-sm font-medium text-stone-700 mb-1">Unable to embed this sheet</p>
                <p className="text-xs text-stone-500 mb-4 max-w-xs">
                  Google Sheets may block embedding in iframes. Open it directly in Google Drive to edit.
                </p>
                <a
                  href={selectedSheet.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-[#D49A6A] hover:bg-[#c28a5c] text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <ExternalLink size={14} /> Open in Google Sheets
                </a>
              </div>
            ) : embeddedUrl ? (
              <iframe
                key={selectedSheet.id}
                src={embeddedUrl}
                title={selectedSheet.name}
                className="w-full rounded-2xl border border-stone-200"
                style={{ height: '600px' }}
                onError={() => setIframeError(true)}
                allow="clipboard-read; clipboard-write"
              />
            ) : null}
          </div>
        )}

        {!selectedSheet && (
          <div className="mt-2 bg-stone-50 rounded-2xl p-8 flex flex-col items-center justify-center text-center border border-stone-100">
            <Table2 size={32} className="text-stone-300 mb-3" />
            <p className="text-sm text-stone-500">No sheet selected. Click "Select from Drive" to choose a spreadsheet.</p>
          </div>
        )}
      </div>

      {/* Export Section */}
      <div className="mb-3">
        <h2 className="text-lg font-bold text-stone-900 mb-1">Export to New Sheet</h2>
        <p className="text-sm text-stone-500">Create a new Google Spreadsheet from your DIOS data.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {exports.map(({ key, title, description, icon: Icon, handler }) => (
          <div key={key} className="bg-white rounded-3xl p-6 border border-stone-100 shadow-sm flex flex-col hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-[#D49A6A]/10 rounded-2xl flex items-center justify-center mb-4">
              <Icon size={24} className="text-[#D49A6A]" />
            </div>
            <h3 className="text-lg font-bold text-stone-900 mb-2">{title}</h3>
            <p className="text-sm text-stone-500 flex-1 mb-6">{description}</p>
            <button
              onClick={handler}
              disabled={!!exporting || !token || token === 'dummy'}
              className="w-full py-2.5 bg-[#D49A6A] hover:bg-[#c28a5c] text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            >
              {exporting === key
                ? <><Loader size={16} className="animate-spin" /> Exporting…</>
                : <><ExternalLink size={16} /> Export to Sheets</>
              }
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
