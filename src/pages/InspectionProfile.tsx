import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { doc, onSnapshot, updateDoc, collection, getDocs, setDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { 
  ArrowLeft, Calendar, Clock, FileText, Receipt, CheckCircle, 
  MapPin, Building2, Save, Car
} from 'lucide-react';

interface Inspection {
  id: string;
  operationId: string;
  date: string;
  status: 'Scheduled' | 'In Progress' | 'Completed' | 'Cancelled';
  baseHoursLog: number;
  additionalHoursLog: number;
  milesDriven: number;
  notes?: string;
  isBundled?: boolean;
  totalTripDriveTime?: number;
  totalTripStops?: number;
  sharedDriveTime?: number;
  mealsAndExpenses?: number;
  perDiemDays?: number;
  customLineItemName?: string;
  customLineItemAmount?: number;
  invoiceNotes?: string;
  invoiceExceptions?: string;
  bundleId?: string;
}

interface Operation {
  id: string;
  name: string;
  agencyId: string;
  address: string;
  lat?: number;
  lng?: number;
}

interface Agency {
  id: string;
  name: string;
  flatRateBaseAmount: number;
  flatRateIncludedHours: number;
  additionalHourlyRate: number;
  mileageRate: number;
  travelTimeHourlyRate?: number;
  perDiemRate?: number;
}

import TasksWidget from '../components/TasksWidget';

export default function InspectionProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [agency, setAgency] = useState<Agency | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<Inspection['status']>('Scheduled');
  const [baseHoursLog, setBaseHoursLog] = useState(0);
  const [additionalHoursLog, setAdditionalHoursLog] = useState(0);
  const [milesDriven, setMilesDriven] = useState(0);
  const [isBundled, setIsBundled] = useState(false);
  const [totalTripDriveTime, setTotalTripDriveTime] = useState(0);
  const [totalTripStops, setTotalTripStops] = useState(1);
  const [mealsAndExpenses, setMealsAndExpenses] = useState(0);
  const [perDiemDays, setPerDiemDays] = useState(0);
  const [customLineItemName, setCustomLineItemName] = useState('');
  const [customLineItemAmount, setCustomLineItemAmount] = useState(0);
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [invoiceExceptions, setInvoiceExceptions] = useState('');

  useEffect(() => {
    if (!user || !id) return;

    const inspectionPath = `users/${user.uid}/inspections/${id}`;
    const unsubscribe = onSnapshot(
      doc(db, inspectionPath),
      async (docSnapshot) => {
        if (docSnapshot.exists()) {
          const data = { id: docSnapshot.id, ...docSnapshot.data() } as Inspection;
          setInspection(data);
          
          // Initialize form state
          setNotes(data.notes || '');
          setStatus(data.status);
          setBaseHoursLog(data.baseHoursLog || 0);
          setAdditionalHoursLog(data.additionalHoursLog || 0);
          setMilesDriven(data.milesDriven || 0);
          setIsBundled(data.isBundled || false);
          setTotalTripDriveTime(data.totalTripDriveTime || 0);
          setTotalTripStops(data.totalTripStops || 1);
          setMealsAndExpenses(data.mealsAndExpenses || 0);
          setPerDiemDays(data.perDiemDays || 0);
          setCustomLineItemName(data.customLineItemName || '');
          setCustomLineItemAmount(data.customLineItemAmount || 0);
          setInvoiceNotes(data.invoiceNotes || '');
          setInvoiceExceptions(data.invoiceExceptions || '');

          // Fetch operation
          if (data.operationId) {
            try {
              const opDoc = await getDocs(collection(db, `users/${user.uid}/operations`));
              const op = opDoc.docs.find(d => d.id === data.operationId);
              if (op) {
                const opData = { id: op.id, ...op.data() } as Operation;
                setOperation(opData);

                // Fetch agency
                if (opData.agencyId) {
                  const agencyDoc = await getDocs(collection(db, `users/${user.uid}/agencies`));
                  const ag = agencyDoc.docs.find(d => d.id === opData.agencyId);
                  if (ag) {
                    setAgency({ id: ag.id, ...ag.data() } as Agency);
                  }
                }
              }
            } catch (error) {
              console.error("Error fetching related data:", error);
            }
          }
        } else {
          navigate('/operations');
        }
        setLoading(false);
      },
      (error) => handleFirestoreError(error, OperationType.GET, inspectionPath)
    );

    return () => unsubscribe();
  }, [user, id, navigate]);

  const handleSave = async () => {
    if (!user || !id) return;
    setSaving(true);
    
    let sharedDriveTime = 0;
    if (isBundled && totalTripStops > 0) {
      sharedDriveTime = Math.round(totalTripDriveTime) / totalTripStops;
    }

    const inspectionPath = `users/${user.uid}/inspections/${id}`;
    try {
      await updateDoc(doc(db, inspectionPath), {
        notes,
        status,
        baseHoursLog,
        additionalHoursLog,
        milesDriven,
        isBundled,
        totalTripDriveTime,
        totalTripStops,
        sharedDriveTime,
        mealsAndExpenses,
        perDiemDays,
        customLineItemName,
        customLineItemAmount,
        invoiceNotes,
        invoiceExceptions
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, inspectionPath);
    } finally {
      setSaving(false);
    }
  };

  const calculateInvoiceTotal = () => {
    if (!agency) return 0;
    
    let total = agency.flatRateBaseAmount;
    
    // Additional hours
    if (additionalHoursLog > 0) {
      total += additionalHoursLog * agency.additionalHourlyRate;
    }
    
    // Drive time
    let driveTime = 0;
    if (isBundled && totalTripStops > 0) {
      driveTime = Math.round(totalTripDriveTime) / totalTripStops;
    } else {
      driveTime = totalTripDriveTime;
    }
    
    if (driveTime > 0) {
      const travelRate = agency.travelTimeHourlyRate || agency.additionalHourlyRate;
      total += driveTime * travelRate;
    }

    // Miles
    if (milesDriven > 0) {
      total += milesDriven * agency.mileageRate;
    }

    // Meals and Expenses
    if (mealsAndExpenses > 0) {
      total += mealsAndExpenses;
    }

    // Per Diem
    if (perDiemDays > 0) {
      const perDiemRate = agency.perDiemRate || 0;
      total += perDiemDays * perDiemRate;
    }

    // Custom Line Item
    if (customLineItemAmount > 0) {
      total += customLineItemAmount;
    }

    return total;
  };

  if (loading) {
    return <div className="p-8 text-center text-stone-500">Loading inspection details...</div>;
  }

  if (!inspection) return null;

  const invoiceTotal = calculateInvoiceTotal();
  const calculatedDriveTime = isBundled && totalTripStops > 0 ? Math.round(totalTripDriveTime) / totalTripStops : totalTripDriveTime;

  return (
    <div className="animate-in fade-in duration-500 pb-12">
      {/* Breadcrumbs & Header */}
      <div className="mb-6">
        <Link to={`/operations/${inspection.operationId}`} className="inline-flex items-center gap-2 text-sm font-medium text-stone-500 hover:text-stone-900 transition-colors mb-4">
          <ArrowLeft size={16} />
          Back to Operation
        </Link>
        
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight">
                Inspection: {new Date(inspection.date).toLocaleDateString()}
              </h1>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
              }`}>
                {status}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm text-stone-500">
              <span className="flex items-center gap-1.5"><Building2 size={16} /> {operation?.name || 'Unknown Operation'}</span>
              {agency && <span className="flex items-center gap-1.5"><Receipt size={16} /> {agency.name}</span>}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={handleSave}
              disabled={saving}
              className="bg-[#D49A6A] hover:bg-[#c28a5c] text-white px-6 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
            >
              <Save size={16} />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Details & Notes */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          {/* Status & Basic Info */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100">
            <h2 className="text-lg font-bold text-stone-900 mb-4">Inspection Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                >
                  <option value="Scheduled">Scheduled</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Date</label>
                <div className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm text-stone-700">
                  {new Date(inspection.date).toLocaleDateString()}
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100 flex-1 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <FileText size={18} className="text-[#D49A6A]" />
              <h2 className="text-lg font-bold text-stone-900">Inspection Notes</h2>
            </div>
            <textarea 
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full flex-1 min-h-[200px] resize-none bg-[#FDFCFB] border border-stone-200 border-dashed rounded-2xl p-4 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A]/50 transition-all"
              placeholder="Enter detailed notes about the inspection here..."
            ></textarea>
          </div>
          {/* Tasks */}
          <div className="min-h-[280px]">
            <TasksWidget inspectionId={id} title="Inspection Tasks" />
          </div>

          {/* Additional Billing Items */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100 flex-1 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <Receipt size={18} className="text-[#D49A6A]" />
              <h2 className="text-lg font-bold text-stone-900">Additional Billing Items</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Miles Driven</label>
                <input 
                  type="number" 
                  min="0"
                  step="1"
                  value={milesDriven}
                  onChange={(e) => setMilesDriven(parseInt(e.target.value) || 0)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Meals & Expenses ($)</label>
                <input 
                  type="number" 
                  min="0"
                  step="0.01"
                  value={mealsAndExpenses}
                  onChange={(e) => setMealsAndExpenses(parseFloat(e.target.value) || 0)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Per Diem (Days)</label>
                <input 
                  type="number" 
                  min="0"
                  step="1"
                  value={perDiemDays}
                  onChange={(e) => setPerDiemDays(parseInt(e.target.value) || 0)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                />
              </div>
            </div>

            <div className="border-t border-stone-100 pt-6 mb-6">
              <h3 className="text-sm font-bold text-stone-900 mb-4">Custom Line Item</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Item Description</label>
                  <input 
                    type="text" 
                    value={customLineItemName}
                    onChange={(e) => setCustomLineItemName(e.target.value)}
                    placeholder="e.g., Hotel Stay"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Amount ($)</label>
                  <input 
                    type="number" 
                    min="0"
                    step="0.01"
                    value={customLineItemAmount}
                    onChange={(e) => setCustomLineItemAmount(parseFloat(e.target.value) || 0)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-stone-100 pt-6 space-y-6">
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Invoice Notes</label>
                <textarea 
                  value={invoiceNotes}
                  onChange={(e) => setInvoiceNotes(e.target.value)}
                  className="w-full min-h-[80px] resize-none bg-stone-50 border border-stone-200 rounded-xl p-4 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                  placeholder="Notes to appear on the invoice..."
                ></textarea>
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Exceptions / Internal Notes</label>
                <textarea 
                  value={invoiceExceptions}
                  onChange={(e) => setInvoiceExceptions(e.target.value)}
                  className="w-full min-h-[80px] resize-none bg-stone-50 border border-stone-200 rounded-xl p-4 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                  placeholder="Internal notes or billing exceptions..."
                ></textarea>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Time & Billing */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {/* Hours Log */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100">
            <div className="flex items-center gap-2 mb-4">
              <Clock size={18} className="text-[#D49A6A]" />
              <h2 className="text-lg font-bold text-stone-900">Time Log</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Base Hours</label>
                <input 
                  type="number" 
                  min="0"
                  step="0.5"
                  value={baseHoursLog}
                  onChange={(e) => setBaseHoursLog(parseFloat(e.target.value) || 0)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Additional Hours</label>
                <input 
                  type="number" 
                  min="0"
                  step="0.5"
                  value={additionalHoursLog}
                  onChange={(e) => setAdditionalHoursLog(parseFloat(e.target.value) || 0)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                />
              </div>
            </div>
          </div>

          {/* Drive Time & Bundling */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100">
            <div className="flex items-center gap-2 mb-4">
              <Car size={18} className="text-[#D49A6A]" />
              <h2 className="text-lg font-bold text-stone-900">Drive Time</h2>
            </div>
            
            <div className="space-y-4">
              <label className="flex items-center gap-3 p-3 border border-stone-200 rounded-xl cursor-pointer hover:bg-stone-50 transition-colors">
                <input 
                  type="checkbox" 
                  checked={isBundled}
                  onChange={(e) => setIsBundled(e.target.checked)}
                  className="w-4 h-4 text-[#D49A6A] rounded border-stone-300 focus:ring-[#D49A6A]"
                />
                <span className="text-sm font-medium text-stone-700">Bundled Inspection Trip</span>
              </label>

              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">
                  {isBundled ? 'Total Trip Drive Time (Hours)' : 'Drive Time (Hours)'}
                </label>
                <input 
                  type="number" 
                  min="0"
                  step="0.5"
                  value={totalTripDriveTime}
                  onChange={(e) => setTotalTripDriveTime(parseFloat(e.target.value) || 0)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                />
              </div>

              {isBundled && (
                <div>
                  <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Number of Stops (Operators)</label>
                  <input 
                    type="number" 
                    min="1"
                    step="1"
                    value={totalTripStops}
                    onChange={(e) => setTotalTripStops(parseInt(e.target.value) || 1)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                  />
                </div>
              )}

              <div className="pt-3 border-t border-stone-100">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-stone-500">Calculated Drive Time:</span>
                  <span className="text-sm font-bold text-stone-900">{calculatedDriveTime.toFixed(2)} hrs</span>
                </div>
                {isBundled && (
                  <p className="text-[10px] text-stone-400 mt-1">
                    (Total drive time rounded to nearest hour, divided by {totalTripStops} stops)
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Invoice Summary */}
          <div className="bg-stone-900 rounded-3xl p-6 shadow-sm text-white">
            <div className="flex items-center gap-2 mb-4">
              <Receipt size={18} className="text-[#D49A6A]" />
              <h2 className="text-lg font-bold text-white">Invoice Estimate</h2>
            </div>
            
            {agency ? (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center text-stone-400">
                  <span>Base Rate ({agency.flatRateIncludedHours} hrs)</span>
                  <span className="text-white">${agency.flatRateBaseAmount.toFixed(2)}</span>
                </div>
                {additionalHoursLog > 0 && (
                  <div className="flex justify-between items-center text-stone-400">
                    <span>Add'l Hours ({additionalHoursLog} @ ${agency.additionalHourlyRate}/hr)</span>
                    <span className="text-white">${(additionalHoursLog * agency.additionalHourlyRate).toFixed(2)}</span>
                  </div>
                )}
                {calculatedDriveTime > 0 && (
                  <div className="flex justify-between items-center text-stone-400">
                    <span>Drive Time ({calculatedDriveTime.toFixed(2)} @ ${(agency.travelTimeHourlyRate || agency.additionalHourlyRate).toFixed(2)}/hr)</span>
                    <span className="text-white">${(calculatedDriveTime * (agency.travelTimeHourlyRate || agency.additionalHourlyRate)).toFixed(2)}</span>
                  </div>
                )}
                {milesDriven > 0 && (
                  <div className="flex justify-between items-center text-stone-400">
                    <span>Mileage ({milesDriven} @ ${(agency.mileageRate).toFixed(3)}/mi)</span>
                    <span className="text-white">${(milesDriven * agency.mileageRate).toFixed(2)}</span>
                  </div>
                )}
                {mealsAndExpenses > 0 && (
                  <div className="flex justify-between items-center text-stone-400">
                    <span>Meals & Expenses</span>
                    <span className="text-white">${mealsAndExpenses.toFixed(2)}</span>
                  </div>
                )}
                {perDiemDays > 0 && (
                  <div className="flex justify-between items-center text-stone-400">
                    <span>Per Diem ({perDiemDays} @ ${(agency.perDiemRate || 0).toFixed(2)}/day)</span>
                    <span className="text-white">${(perDiemDays * (agency.perDiemRate || 0)).toFixed(2)}</span>
                  </div>
                )}
                {customLineItemAmount > 0 && (
                  <div className="flex justify-between items-center text-stone-400">
                    <span>{customLineItemName || 'Custom Item'}</span>
                    <span className="text-white">${customLineItemAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="pt-3 border-t border-stone-700 flex justify-between items-center font-bold text-lg">
                  <span>Total</span>
                  <span className="text-[#D49A6A]">${invoiceTotal.toFixed(2)}</span>
                </div>
              </div>
            ) : (
              <div className="text-sm text-stone-400">Agency billing info not available.</div>
            )}
            
            <button className="w-full mt-6 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2">
              Generate Invoice
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
