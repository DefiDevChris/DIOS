import { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useDatabase } from '../hooks/useDatabase';
import { useBackgroundSync } from '../contexts/BackgroundSyncContext';
import { useSheetsSync } from '../hooks/useSheetsSync';
import { configStore, logger } from '@dios/shared';
import { Table2, Download, ExternalLink, FileSpreadsheet, Loader, Maximize2, X, FolderOpen } from 'lucide-react';
import Swal from 'sweetalert2';

interface SelectedSheet {
  id: string;
  name: string;
  url: string;
}

// Type definitions for useDatabase
interface Inspection {
  id: string;
  date?: string;
  status?: string;
  operationId?: string;
  baseHoursLog?: number;
  additionalHoursLog?: number;
  milesDriven?: number;
}

interface Invoice {
  id: string;
  date?: string;
  operationName?: string;
  agencyName?: string;
  totalAmount?: number;
  status?: string;
}

interface Expense {
  id: string;
  date?: string;
  vendor?: string;
  category?: string;
  amount?: number;
  notes?: string;
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
  const { user, googleAccessToken, isLocalUser } = useAuth();
  const [selectedSheet, setSelectedSheet] = useState<SelectedSheet | null>(null);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [iframeError, setIframeError] = useState(false);

  // Master sheet sync
  const { isSyncing, sheetUrl, lastSyncError } = useSheetsSync();
  const { sheetQueueSize } = useBackgroundSync();

  // Database hooks for exports
  const { findAll: findAllInspections } = useDatabase<Inspection>({ table: 'inspections' });
  const { findAll: findAllInvoices } = useDatabase<Invoice>({ table: 'invoices' });
  const { findAll: findAllExpenses } = useDatabase<Expense>({ table: 'expenses' });

  const token = googleAccessToken || sessionStorage.getItem('googleAccessToken');
  // The Google Picker requires a browser API key — use the Firebase apiKey which is
  // a browser key for the same GCP project (not the Maps key).
  const apiKey = configStore.getConfig()?.firebaseConfig?.apiKey ?? '';

  const openPicker = useCallback(async () => {
    if (!token) {
      Swal.fire({ text: 'Please sign in with Google to use the Sheets picker.', icon: 'info' });
      return;
    }
    setPickerLoading(true);
    try {
      await loadGapiScript();
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Google Picker SDK failed to load')), 10000);
        window.gapi.load('picker', () => { clearTimeout(timeout); resolve(); });
      });

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
      logger.error('Picker failed to open:', err);
      Swal.fire({ text: 'Failed to open the Google Picker. Please try again.', icon: 'error' });
    } finally {
      setPickerLoading(false);
    }
  }, [token, apiKey]);

  const createGoogleSheet = async (title: string, rows: string[][]) => {
    if (!token) {
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
    if (!user) return;
    setExporting('inspections');
    try {
      const inspections = await findAllInspections();
      const header = ['ID', 'Date', 'Status', 'Operation ID', 'Base Hours', 'Additional Hours', 'Miles Driven'];
      const rows: string[][] = [header];
      inspections.forEach(i => {
        rows.push([
          i.id,
          i.date || '',
          i.status || '',
          i.operationId || '',
          String(i.baseHoursLog || 0),
          String(i.additionalHoursLog || 0),
          String(i.milesDriven || 0),
        ]);
      });
      const url = await createGoogleSheet(`DIOS Inspections Export – ${new Date().toLocaleDateString()}`, rows);
      if (url) window.open(url, '_blank');
    } catch (err: unknown) {
      logger.error('Export failed:', err);
      Swal.fire({ text: `Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`, icon: 'error' });
    } finally {
      setExporting(null);
    }
  };

  const exportInvoices = async () => {
    if (!user) return;
    setExporting('invoices');
    try {
      const invoices = await findAllInvoices();
      const header = ['ID', 'Date', 'Operation', 'Agency', 'Amount', 'Status'];
      const rows: string[][] = [header];
      invoices.forEach(inv => {
        rows.push([
          inv.id,
          inv.date ? new Date(inv.date).toLocaleDateString() : '',
          inv.operationName || '',
          inv.agencyName || '',
          String(inv.totalAmount || 0),
          inv.status || '',
        ]);
      });
      const url = await createGoogleSheet(`DIOS Invoices Export – ${new Date().toLocaleDateString()}`, rows);
      if (url) window.open(url, '_blank');
    } catch (err: unknown) {
      logger.error('Export failed:', err);
      Swal.fire({ text: `Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`, icon: 'error' });
    } finally {
      setExporting(null);
    }
  };

  const exportExpenses = async () => {
    if (!user) return;
    setExporting('expenses');
    try {
      const expenses = await findAllExpenses();
      const header = ['ID', 'Date', 'Vendor', 'Category', 'Amount', 'Notes'];
      const rows: string[][] = [header];
      expenses.forEach(exp => {
        rows.push([
          exp.id,
          exp.date || '',
          exp.vendor || '',
          exp.category || '',
          String(exp.amount || 0),
          exp.notes || '',
        ]);
      });
      const url = await createGoogleSheet(`DIOS Expenses Export – ${new Date().toLocaleDateString()}`, rows);
      if (url) window.open(url, '_blank');
    } catch (err: unknown) {
      logger.error('Export failed:', err);
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
      {isLocalUser && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
          <span className="text-amber-500 mt-0.5">⚠️</span>
          <div>
            <p className="font-medium text-amber-800">Google Sheets requires cloud setup</p>
            <p className="text-sm text-amber-700 mt-0.5">You're running in local mode. Configure Firebase and Google OAuth in Settings → Data &amp; Integrations to enable Sheets access.</p>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 luxury-card rounded-2xl flex items-center justify-center">
          <Table2 size={24} className="text-[#d4a574]" />
        </div>
        <div>
          <h1 className="font-serif-display text-[36px] font-semibold text-[#2a2420] tracking-tight">Google Sheets</h1>
          <p className="text-[#8b7355] text-sm font-medium mt-1">Select, view, and export data to Google Sheets.</p>
        </div>
      </div>

      {(!token) && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800 mb-6">
          Please sign in with Google to use Sheets features.
        </div>
      )}

      {/* Master Inspection Sheet */}
      {!isLocalUser && (
        <div className="luxury-card rounded-[24px] p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
                background: 'linear-gradient(135deg, rgba(16,185,129,0.1) 0%, rgba(5,150,105,0.05) 100%)',
                border: '1px solid rgba(16,185,129,0.2)',
              }}>
                <FileSpreadsheet size={20} className="text-emerald-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[#2a2420]">Master Sheet</h2>
                <p className="text-sm text-[#8b7355] mt-0.5">
                  {isSyncing
                    ? 'Syncing...'
                    : lastSyncError
                      ? <span className="text-red-600">{lastSyncError}</span>
                      : 'Syncs automatically — inspections, operators, and expenses.'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isSyncing && <Loader size={16} className="animate-spin text-[#d4a574]" />}
              {sheetQueueSize > 0 && (
                <span className="text-xs font-bold text-amber-600 px-2.5 py-1 bg-amber-50 rounded-full border border-amber-200">
                  {sheetQueueSize} pending
                </span>
              )}
              {sheetUrl && (
                <a
                  href={sheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-white border border-[rgba(212,165,116,0.15)] text-[#4a4038] rounded-xl text-sm font-medium hover:bg-[rgba(212,165,116,0.04)] transition-colors flex items-center gap-2"
                >
                  <ExternalLink size={14} /> Open in Sheets
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Google Picker Section */}
      <div className="luxury-card rounded-[24px] p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-[#2a2420]">Open Existing Sheet</h2>
            <p className="text-sm text-[#8b7355] mt-0.5">
              Pick a Google Sheet from your Drive to embed it for quick data entry or roster management.
            </p>
          </div>
          <button
            onClick={openPicker}
            disabled={pickerLoading || !token}
            className="px-5 py-2.5 luxury-btn text-white rounded-xl text-sm font-bold border-0 cursor-pointer transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50 shrink-0"
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
              <span className="text-sm font-medium text-[#4a4038] truncate mr-4">{selectedSheet.name}</span>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={selectedSheet.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open in new tab"
                  className="p-2 text-[#a89b8c] hover:text-[#d4a574] hover:bg-amber-50 rounded-lg transition-colors"
                >
                  <Maximize2 size={15} />
                </a>
                <button
                  onClick={() => { setSelectedSheet(null); setIframeError(false); }}
                  title="Close"
                  className="p-2 text-[#a89b8c] hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <X size={15} />
                </button>
              </div>
            </div>
            {iframeError ? (
              <div className="bg-[rgba(212,165,116,0.04)] border border-[rgba(212,165,116,0.15)] rounded-2xl p-8 flex flex-col items-center justify-center text-center">
                <FileSpreadsheet size={36} className="text-[#d4a574] mb-3" />
                <p className="text-sm font-medium text-[#4a4038] mb-1">Unable to embed this sheet</p>
                <p className="text-xs text-[#8b7355] mb-4 max-w-xs">
                  Google Sheets may block embedding in iframes. Open it directly in Google Drive to edit.
                </p>
                <a
                  href={selectedSheet.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 luxury-btn text-white rounded-xl text-sm font-bold border-0 cursor-pointer transition-colors flex items-center gap-2"
                >
                  <ExternalLink size={14} /> Open in Google Sheets
                </a>
              </div>
            ) : embeddedUrl ? (
              <iframe
                key={selectedSheet.id}
                src={embeddedUrl}
                title={selectedSheet.name}
                className="w-full rounded-2xl border border-[rgba(212,165,116,0.15)]"
                style={{ height: '600px' }}
                onError={() => setIframeError(true)}
                allow="clipboard-read; clipboard-write"
              />
            ) : null}
          </div>
        )}

        {!selectedSheet && (
          <div className="mt-2 bg-[rgba(212,165,116,0.04)] rounded-2xl p-8 flex flex-col items-center justify-center text-center border border-[rgba(212,165,116,0.12)]">
            <Table2 size={32} className="text-[#d4a574] mb-3" />
            <p className="text-sm text-[#8b7355]">No sheet selected. Click "Select from Drive" to choose a spreadsheet.</p>
          </div>
        )}
      </div>

      {/* Export Section */}
      <div className="mb-3">
        <h2 className="text-lg font-bold text-[#2a2420] mb-1">Export to New Sheet</h2>
        <p className="text-sm text-[#8b7355]">Create a new Google Spreadsheet from your DIOS data.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {exports.map(({ key, title, description, icon: Icon, handler }) => (
          <div key={key} className="luxury-card rounded-[24px] p-6 flex flex-col hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-[#d4a574]/10 rounded-2xl flex items-center justify-center mb-4">
              <Icon size={24} className="text-[#d4a574]" />
            </div>
            <h3 className="text-lg font-bold text-[#2a2420] mb-2">{title}</h3>
            <p className="text-sm text-[#8b7355] flex-1 mb-6">{description}</p>
            <button
              onClick={handler}
              disabled={!!exporting || !token}
              className="w-full py-2.5 luxury-btn text-white rounded-xl text-sm font-bold border-0 cursor-pointer transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
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
