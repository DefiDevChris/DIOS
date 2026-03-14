import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { db } from '@dios/shared/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { ClipboardCheck, Search, Calendar, ChevronRight, MapPin, Clock } from 'lucide-react';

interface Inspection {
  id: string;
  operationId: string;
  date: string;
  status: 'Scheduled' | 'In Progress' | 'Completed' | 'Cancelled';
  baseHoursLog?: number;
  additionalHoursLog?: number;
  milesDriven?: number;
  scope?: string;
}

interface Operation {
  id: string;
  name: string;
  agencyId: string;
}

interface Agency {
  id: string;
  name: string;
}

const STATUS_COLORS: Record<string, string> = {
  'Scheduled': 'bg-blue-100 text-blue-700',
  'In Progress': 'bg-amber-100 text-amber-700',
  'Completed': 'bg-emerald-100 text-emerald-700',
  'Cancelled': 'bg-stone-100 text-stone-600',
};

export default function Inspections() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    if (!user) return;

    const opsUnsub = onSnapshot(
      collection(db, `users/${user.uid}/operations`),
      (snapshot) => {
        setOperations(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Operation)));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/operations`)
    );

    const agenciesUnsub = onSnapshot(
      collection(db, `users/${user.uid}/agencies`),
      (snapshot) => {
        setAgencies(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Agency)));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/agencies`)
    );

    const inspPath = `users/${user.uid}/inspections`;
    const inspUnsub = onSnapshot(
      query(collection(db, inspPath), orderBy('date', 'desc')),
      (snapshot) => {
        setInspections(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Inspection)));
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, inspPath);
        setLoading(false);
      }
    );

    return () => {
      opsUnsub();
      agenciesUnsub();
      inspUnsub();
    };
  }, [user]);

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

  const statusCounts = inspections.reduce((acc, insp) => {
    acc[insp.status] = (acc[insp.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight">Inspections</h1>
          <p className="mt-2 text-stone-500 text-sm">View and manage all inspection records.</p>
        </div>
      </div>

      {/* Summary Cards */}
      {!loading && inspections.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {(['Scheduled', 'In Progress', 'Completed', 'Cancelled'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}
              className={`bg-white rounded-2xl p-4 border text-left transition-all hover:shadow-md ${
                statusFilter === s ? 'border-[#D49A6A] ring-2 ring-[#D49A6A]/20' : 'border-stone-100'
              }`}
            >
              <div className="text-2xl font-extrabold text-stone-900">{statusCounts[s] || 0}</div>
              <div className={`text-xs font-bold uppercase tracking-wider mt-1 ${
                s === 'Scheduled' ? 'text-blue-600'
                : s === 'In Progress' ? 'text-amber-600'
                : s === 'Completed' ? 'text-emerald-600'
                : 'text-stone-500'
              }`}>{s}</div>
            </button>
          ))}
        </div>
      )}

      <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden flex flex-col min-h-[500px]">
        {/* Toolbar */}
        <div className="p-4 border-b border-stone-100 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-stone-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
            <input
              type="text"
              placeholder="Search by operation, scope, or date..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-stone-200 focus:border-[#D49A6A] focus:ring-2 focus:ring-[#D49A6A]/20 rounded-xl py-2 pl-10 pr-4 text-sm transition-all"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white border border-stone-200 focus:border-[#D49A6A] focus:ring-2 focus:ring-[#D49A6A]/20 rounded-xl py-2 px-3 text-sm transition-all"
          >
            <option value="all">All Statuses</option>
            <option value="Scheduled">Scheduled</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
            <option value="Cancelled">Cancelled</option>
          </select>
          <div className="text-sm text-stone-500 font-medium shrink-0">
            {filtered.length} {filtered.length === 1 ? 'Inspection' : 'Inspections'}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-stone-500">Loading inspections...</div>
        ) : inspections.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="w-16 h-16 bg-stone-50 rounded-2xl flex items-center justify-center mb-4 border border-stone-100">
              <ClipboardCheck size={32} className="text-stone-300" />
            </div>
            <h3 className="text-lg font-bold text-stone-900 mb-1">No inspections yet</h3>
            <p className="text-stone-500 text-sm max-w-sm mx-auto">
              Inspections can be created from an operation's profile page.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-stone-500">
            <Search size={32} className="text-stone-300 mb-3" />
            <p>No inspections match your search.</p>
          </div>
        ) : (
          <div className="divide-y divide-stone-100 flex-1 overflow-y-auto">
            {filtered.map((insp) => {
              const op = getOperation(insp.operationId);
              const agencyName = getAgencyName(op?.agencyId);
              const totalHours = (insp.baseHoursLog || 0) + (insp.additionalHoursLog || 0);

              return (
                <div
                  key={insp.id}
                  className="p-4 sm:p-5 hover:bg-stone-50/50 transition-colors group cursor-pointer"
                  onClick={() => navigate(`/inspections/${insp.id}`)}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="text-base font-bold text-stone-900 group-hover:text-[#D49A6A] transition-colors truncate">
                          {op?.name || 'Unknown Operation'}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${STATUS_COLORS[insp.status] || 'bg-stone-100 text-stone-600'}`}>
                          {insp.status}
                        </span>
                        {agencyName && (
                          <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold uppercase tracking-wider shrink-0">
                            {agencyName}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-500">
                        <span className="flex items-center gap-1.5">
                          <Calendar size={13} className="text-stone-400" />
                          {new Date(insp.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </span>
                        {totalHours > 0 && (
                          <span className="flex items-center gap-1.5">
                            <Clock size={13} className="text-stone-400" />
                            {totalHours}h total
                          </span>
                        )}
                        {(insp.milesDriven || 0) > 0 && (
                          <span className="flex items-center gap-1.5">
                            <MapPin size={13} className="text-stone-400" />
                            {insp.milesDriven} mi
                          </span>
                        )}
                        {insp.scope && (
                          <span className="text-stone-400 truncate max-w-xs">{insp.scope}</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-stone-300 group-hover:text-[#D49A6A] transition-colors shrink-0" />
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
