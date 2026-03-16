import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { ClipboardCheck, Search, Calendar, ChevronRight, MapPin, Clock, Download } from 'lucide-react';
import { generateCsv, downloadCsv } from '../utils/csvExport';
import { useDatabase } from '../hooks/useDatabase';
import type { Inspection, Operation, Agency } from '@dios/shared/types';

// Extended Inspection with scope field used in UI
type ExtendedInspection = Inspection & {
  scope?: string;
};

const STATUS_COLORS: Record<string, string> = {
  'Scheduled': 'bg-blue-100 text-blue-700',
  'Prep': 'bg-amber-100 text-amber-700',
  'Inspected': 'bg-purple-100 text-purple-700',
  'Report': 'bg-orange-100 text-orange-700',
  'Invoiced': 'bg-cyan-100 text-cyan-700',
  'Paid': 'bg-emerald-100 text-emerald-700',
  'Cancelled': 'bg-[rgba(212,165,116,0.06)] text-[#7a6b5a]',
};

export default function Inspections() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Database hooks
  const { findAll: findAllInspections } = useDatabase<ExtendedInspection>({ table: 'inspections' });
  const { findAll: findAllOperations } = useDatabase<Operation>({ table: 'operations' });
  const { findAll: findAllAgencies } = useDatabase<Agency>({ table: 'agencies' });

  const [inspections, setInspections] = useState<ExtendedInspection[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const [inspectionsData, operationsData, agenciesData] = await Promise.all([
          findAllInspections(),
          findAllOperations(),
          findAllAgencies(),
        ]);

        // Sort inspections by date desc
        const sortedInspections = inspectionsData.sort((a, b) => b.date.localeCompare(a.date));

        setInspections(sortedInspections);
        setOperations(operationsData);
        setAgencies(agenciesData);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'inspections');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, findAllInspections, findAllOperations, findAllAgencies]);

  const getOperation = (operationId: string) => operations.find(o => o.id === operationId);
  const getAgencyName = (agencyId?: string) => agencies.find(a => a.id === agencyId)?.name;

  const filtered = inspections.filter(insp => {
    const op = getOperation(insp.operationId);
    const matchesSearch =
      !searchTerm ||
      op?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      insp.date.includes(searchTerm) ||
      insp.status.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (insp.scope || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || insp.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleExportCsv = () => {
    const exportData = filtered.map(insp => {
      const op = getOperation(insp.operationId);
      return {
        date: insp.date,
        operation: op?.name || 'Unknown',
        agency: getAgencyName(op?.agencyId) || 'Unknown',
        status: insp.status,
      };
    });
    const csv = generateCsv(
      exportData,
      ['date', 'operation', 'agency', 'status'],
      { date: 'Date', operation: 'Operation', agency: 'Agency', status: 'Status' }
    );
    downloadCsv(csv, `inspections-${new Date().getFullYear()}.csv`);
  };

  const statusCounts = inspections.reduce((acc, insp) => {
    acc[insp.status] = (acc[insp.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-8 gap-4">
        <div>
          <h1 className="font-serif-display text-[36px] font-semibold text-[#2a2420] tracking-tight">Inspections</h1>
          <p className="mt-2 text-[#8b7355] text-sm font-medium">View and manage all inspection records.</p>
        </div>
      </div>

      {/* Summary Cards */}
      {!loading && inspections.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          {(['Scheduled', 'Prep', 'Inspected', 'Report', 'Invoiced', 'Paid', 'Cancelled'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}
              className={`luxury-card rounded-[20px] p-3 border text-left transition-all hover:shadow-md ${
                statusFilter === s ? 'border-[#d4a574] ring-2 ring-[#d4a574]/20' : 'border-[rgba(212,165,116,0.12)]'
              }`}
            >
              <div className="text-xl font-extrabold text-[#2a2420]">{statusCounts[s] || 0}</div>
              <div className={`text-[10px] font-bold uppercase tracking-wider mt-1 ${
                s === 'Scheduled' ? 'text-blue-600'
                : s === 'Prep' ? 'text-amber-600'
                : s === 'Inspected' ? 'text-purple-600'
                : s === 'Report' ? 'text-orange-600'
                : s === 'Invoiced' ? 'text-cyan-600'
                : s === 'Paid' ? 'text-emerald-600'
                : 'text-[#8b7355]'
              }`}>{s}</div>
            </button>
          ))}
        </div>
      )}

      <div className="luxury-card rounded-[24px] overflow-hidden flex flex-col min-h-[500px]">
        {/* Toolbar */}
        <div className="p-4 border-b border-[rgba(212,165,116,0.12)] flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-[rgba(212,165,116,0.04)]">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a89b8c]" size={18} />
            <input
              type="text"
              placeholder="Search by operation, scope, or date..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full luxury-input rounded-2xl py-2 pl-10 pr-4 text-sm outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="luxury-input rounded-2xl py-2 px-3 text-sm outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="Scheduled">Scheduled</option>
            <option value="Prep">Prep</option>
            <option value="Inspected">Inspected</option>
            <option value="Report">Report</option>
            <option value="Invoiced">Invoiced</option>
            <option value="Paid">Paid</option>
            <option value="Cancelled">Cancelled</option>
          </select>
          <button
            onClick={handleExportCsv}
            disabled={filtered.length === 0}
            className="px-3 py-2 bg-white border border-[rgba(212,165,116,0.15)] text-[#7a6b5a] rounded-xl text-sm font-medium hover:bg-[rgba(212,165,116,0.04)] transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <Download size={16} />
            Export
          </button>
          <div className="text-sm text-[#8b7355] font-medium shrink-0">
            {filtered.length} {filtered.length === 1 ? 'Inspection' : 'Inspections'}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-[#8b7355]">Loading inspections...</div>
        ) : inspections.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="w-16 h-16 bg-[rgba(212,165,116,0.04)] rounded-2xl flex items-center justify-center mb-4 border border-[rgba(212,165,116,0.12)]">
              <ClipboardCheck size={32} className="text-[#d4a574]" />
            </div>
            <h3 className="text-lg font-bold text-[#2a2420] mb-1">No inspections yet</h3>
            <p className="text-[#8b7355] text-sm max-w-sm mx-auto">
              Inspections can be created from an operation's profile page.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-[#8b7355]">
            <Search size={32} className="text-[#d4a574] mb-3" />
            <p>No inspections match your search.</p>
          </div>
        ) : (
          <div className="divide-y divide-[rgba(212,165,116,0.12)] flex-1 overflow-y-auto">
            {filtered.map((insp) => {
              const op = getOperation(insp.operationId);
              const agencyName = getAgencyName(op?.agencyId);
              const totalHours = (insp.baseHoursLog || 0) + (insp.additionalHoursLog || 0);

              return (
                <div
                  key={insp.id}
                  className="p-4 sm:p-5 hover:bg-[rgba(212,165,116,0.04)] transition-colors group cursor-pointer"
                  onClick={() => navigate(`/inspections/${insp.id}`)}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="text-base font-bold text-[#2a2420] group-hover:text-[#d4a574] transition-colors truncate">
                          {op?.name || 'Unknown Operation'}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${STATUS_COLORS[insp.status] || 'bg-[rgba(212,165,116,0.06)] text-[#7a6b5a]'}`}>
                          {insp.status}
                        </span>
                        {agencyName && (
                          <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold uppercase tracking-wider shrink-0">
                            {agencyName}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#8b7355]">
                        <span className="flex items-center gap-1.5">
                          <Calendar size={13} className="text-[#a89b8c]" />
                          {new Date(insp.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </span>
                        {totalHours > 0 && (
                          <span className="flex items-center gap-1.5">
                            <Clock size={13} className="text-[#a89b8c]" />
                            {totalHours}h total
                          </span>
                        )}
                        {(insp.milesDriven || 0) > 0 && (
                          <span className="flex items-center gap-1.5">
                            <MapPin size={13} className="text-[#a89b8c]" />
                            {insp.milesDriven} mi
                          </span>
                        )}
                        {insp.scope && (
                          <span className="text-[#a89b8c] truncate max-w-xs">{insp.scope}</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-[#a89b8c] group-hover:text-[#d4a574] transition-colors shrink-0" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
