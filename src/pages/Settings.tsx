import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { Plus, Edit2, Trash2, Building2, DollarSign, Clock, MapPin, X, Car, Shield, FolderSync } from 'lucide-react';
import { configStore } from '../lib/configStore';
import { requestLocalFolder, getStoredLocalFolder } from '../lib/localFsSync';

interface Agency {
  id: string;
  name: string;
  billingAddress: string;
  flatRateBaseAmount: number;
  flatRateIncludedHours: number;
  additionalHourlyRate: number;
  mileageRate: number;
  travelTimeHourlyRate?: number;
  perDiemRate?: number;
}

export default function Settings() {
  const { user } = useAuth();
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAgency, setEditingAgency] = useState<Agency | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    billingAddress: '',
    flatRateBaseAmount: 0,
    flatRateIncludedHours: 0,
    additionalHourlyRate: 0,
    mileageRate: 0,
    travelTimeHourlyRate: 0,
    perDiemRate: 0,
  });

  const [localFolderLinked, setLocalFolderLinked] = useState(false);

  useEffect(() => {
    getStoredLocalFolder().then(handle => {
      if (handle) {
        setLocalFolderLinked(true);
      }
    });
  }, []);

  useEffect(() => {
    if (!user) return;

    const path = `users/${user.uid}/agencies`;
    const unsubscribe = onSnapshot(
      collection(db, path),
      (snapshot) => {
        const agenciesData: Agency[] = [];
        snapshot.forEach((doc) => {
          agenciesData.push(doc.data() as Agency);
        });
        setAgencies(agenciesData);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const handleOpenModal = (agency?: Agency) => {
    if (agency) {
      setEditingAgency(agency);
      setFormData({
        name: agency.name,
        billingAddress: agency.billingAddress,
        flatRateBaseAmount: agency.flatRateBaseAmount,
        flatRateIncludedHours: agency.flatRateIncludedHours,
        additionalHourlyRate: agency.additionalHourlyRate,
        mileageRate: agency.mileageRate,
        travelTimeHourlyRate: agency.travelTimeHourlyRate || 0,
        perDiemRate: agency.perDiemRate || 0,
      });
    } else {
      setEditingAgency(null);
      setFormData({
        name: '',
        billingAddress: '',
        flatRateBaseAmount: 0,
        flatRateIncludedHours: 0,
        additionalHourlyRate: 0,
        mileageRate: 0,
        travelTimeHourlyRate: 0,
        perDiemRate: 0,
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingAgency(null);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const agencyId = editingAgency ? editingAgency.id : doc(collection(db, `users/${user.uid}/agencies`)).id;
    const path = `users/${user.uid}/agencies/${agencyId}`;
    
    const agencyData: Agency = {
      id: agencyId,
      ...formData
    };

    try {
      await setDoc(doc(db, path), agencyData);
      handleCloseModal();
    } catch (error) {
      handleFirestoreError(error, editingAgency ? OperationType.UPDATE : OperationType.CREATE, path);
    }
  };

  const handleDelete = async (agencyId: string) => {
    if (!user || !window.confirm('Are you sure you want to delete this agency?')) return;
    
    const path = `users/${user.uid}/agencies/${agencyId}`;
    try {
      await deleteDoc(doc(db, path));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const handleClearIntegrations = () => {
    configStore.clearConfig();
    window.location.reload();
  };

  const handleLinkLocalFolder = async () => {
    const handle = await requestLocalFolder();
    if (handle) {
      setLocalFolderLinked(true);
    }
  };

  return (
    <div className="animate-in fade-in duration-500">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight">Settings</h1>
          <p className="mt-2 text-stone-500 text-sm">Manage your agencies and billing rates.</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="bg-[#D49A6A] hover:bg-[#c28a5c] text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
        >
          <Plus size={18} />
          Add Agency
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-stone-100 flex items-center gap-3 bg-stone-50/50">
          <Building2 className="text-[#D49A6A]" size={20} />
          <h2 className="text-lg font-bold text-stone-900">Agencies</h2>
        </div>
        
        {loading ? (
          <div className="p-8 text-center text-stone-500">Loading agencies...</div>
        ) : agencies.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center">
            <div className="w-16 h-16 bg-stone-50 rounded-2xl flex items-center justify-center mb-4 border border-stone-100">
              <Building2 size={32} className="text-stone-300" />
            </div>
            <h3 className="text-lg font-bold text-stone-900 mb-1">No agencies yet</h3>
            <p className="text-stone-500 text-sm max-w-sm mx-auto mb-6">
              Add your first agency to configure billing rates, mileage, and generate invoices.
            </p>
            <button 
              onClick={() => handleOpenModal()}
              className="text-[#D49A6A] font-medium hover:text-[#c28a5c] transition-colors"
            >
              + Add your first agency
            </button>
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {agencies.map((agency) => (
              <div key={agency.id} className="p-6 hover:bg-stone-50/50 transition-colors">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-stone-900">{agency.name}</h3>
                    <div className="flex items-start gap-1.5 mt-1 text-stone-500 text-sm">
                      <MapPin size={16} className="shrink-0 mt-0.5" />
                      <span className="whitespace-pre-line">{agency.billingAddress}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => handleOpenModal(agency)}
                      className="p-2 text-stone-400 hover:text-[#D49A6A] bg-white hover:bg-[#D49A6A]/10 rounded-lg transition-colors border border-stone-200 hover:border-transparent"
                      title="Edit"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      onClick={() => handleDelete(agency.id)}
                      className="p-2 text-stone-400 hover:text-red-600 bg-white hover:bg-red-50 rounded-lg transition-colors border border-stone-200 hover:border-transparent"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 mt-6">
                  <div className="bg-stone-50 rounded-xl p-3 border border-stone-100">
                    <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <DollarSign size={12} /> Base Rate
                    </div>
                    <div className="text-stone-900 font-medium">${agency.flatRateBaseAmount.toFixed(2)}</div>
                  </div>
                  <div className="bg-stone-50 rounded-xl p-3 border border-stone-100">
                    <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Clock size={12} /> Included Hrs
                    </div>
                    <div className="text-stone-900 font-medium">{agency.flatRateIncludedHours} hrs</div>
                  </div>
                  <div className="bg-stone-50 rounded-xl p-3 border border-stone-100">
                    <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <DollarSign size={12} /> Extra Hr
                    </div>
                    <div className="text-stone-900 font-medium">${agency.additionalHourlyRate.toFixed(2)}/hr</div>
                  </div>
                  <div className="bg-stone-50 rounded-xl p-3 border border-stone-100">
                    <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <MapPin size={12} /> Mileage
                    </div>
                    <div className="text-stone-900 font-medium">${agency.mileageRate.toFixed(2)}/mi</div>
                  </div>
                  <div className="bg-stone-50 rounded-xl p-3 border border-stone-100">
                    <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Car size={12} /> Travel Time
                    </div>
                    <div className="text-stone-900 font-medium">${(agency.travelTimeHourlyRate || 0).toFixed(2)}/hr</div>
                  </div>
                  <div className="bg-stone-50 rounded-xl p-3 border border-stone-100">
                    <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <DollarSign size={12} /> Per Diem
                    </div>
                    <div className="text-stone-900 font-medium">${(agency.perDiemRate || 0).toFixed(2)}/day</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden mt-8">
        <div className="px-6 py-5 border-b border-stone-100 flex items-center gap-3 bg-stone-50/50">
          <FolderSync className="text-[#D49A6A]" size={20} />
          <h2 className="text-lg font-bold text-stone-900">Local File Mirroring</h2>
        </div>

        <div className="p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-stone-900">Link Local Folder</h3>
              <p className="text-sm text-stone-600 mt-1 max-w-xl">
                Select a folder on your computer to automatically save a copy of all uploaded documents. This mirrors the Google Drive folder structure locally.
              </p>
            </div>

            <div className="flex items-center gap-3">
              {localFolderLinked && (
                <span className="text-sm text-emerald-600 font-medium px-3 py-1 bg-emerald-50 rounded-full border border-emerald-100">
                  Linked Successfully
                </span>
              )}
              <button
                onClick={handleLinkLocalFolder}
                className="px-4 py-2 bg-white border border-stone-200 text-stone-700 rounded-xl text-sm font-medium hover:bg-stone-50 transition-colors shrink-0"
              >
                {localFolderLinked ? 'Change Local Folder' : 'Link Local Folder'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden mt-8">
        <div className="px-6 py-5 border-b border-stone-100 flex items-center gap-3 bg-stone-50/50">
          <Shield className="text-[#D49A6A]" size={20} />
          <h2 className="text-lg font-bold text-stone-900">Integrations</h2>
        </div>

        <div className="p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-stone-900">Bring Your Own Backend (BYOB)</h3>
              <p className="text-sm text-stone-600 mt-1 max-w-xl">
                You are currently connected to your own private Firebase project and Google Maps integration. If you need to change your API keys or switch environments, you can reset your integration settings here.
              </p>
            </div>

            <button
              onClick={() => setShowClearConfirm(true)}
              className="px-4 py-2 bg-white border border-red-200 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50 transition-colors shrink-0"
            >
              Reset Integration Keys
            </button>
          </div>

          {showClearConfirm && (
            <div className="mt-4 p-4 bg-red-50 rounded-xl border border-red-100 animate-in fade-in">
              <p className="text-sm text-red-800 font-medium mb-3">
                Are you sure? This will remove your API keys from this browser and return you to the Setup Wizard. You will need to re-enter your credentials to access your data.
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleClearIntegrations}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                >
                  Yes, Reset Keys
                </button>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="px-4 py-2 bg-white border border-stone-200 text-stone-600 rounded-lg text-sm font-medium hover:bg-stone-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-stone-100 flex justify-between items-center bg-stone-50/50 shrink-0">
              <h2 className="text-lg font-bold text-stone-900">
                {editingAgency ? 'Edit Agency' : 'Add New Agency'}
              </h2>
              <button 
                onClick={handleCloseModal}
                className="text-stone-400 hover:text-stone-600 transition-colors p-1"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <form id="agency-form" onSubmit={handleSave} className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Agency Name</label>
                    <input 
                      type="text" 
                      name="name"
                      required
                      value={formData.name}
                      onChange={handleChange}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                      placeholder="e.g., MCIA"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Billing Address</label>
                    <textarea 
                      name="billingAddress"
                      required
                      value={formData.billingAddress}
                      onChange={handleChange}
                      rows={3}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all resize-none"
                      placeholder="123 Main St&#10;City, State 12345"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-stone-100">
                  <h3 className="text-sm font-bold text-stone-900 mb-4 flex items-center gap-2">
                    <DollarSign size={16} className="text-[#D49A6A]" />
                    Billing Rates
                  </h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Flat Rate Base ($)</label>
                      <input 
                        type="number" 
                        name="flatRateBaseAmount"
                        required
                        min="0"
                        step="0.01"
                        value={formData.flatRateBaseAmount}
                        onChange={handleChange}
                        className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Included Hours</label>
                      <input 
                        type="number" 
                        name="flatRateIncludedHours"
                        required
                        min="0"
                        step="0.5"
                        value={formData.flatRateIncludedHours}
                        onChange={handleChange}
                        className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Extra Hourly Rate ($)</label>
                      <input 
                        type="number" 
                        name="additionalHourlyRate"
                        required
                        min="0"
                        step="0.01"
                        value={formData.additionalHourlyRate}
                        onChange={handleChange}
                        className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Mileage Rate ($/mi)</label>
                      <input 
                        type="number" 
                        name="mileageRate"
                        required
                        min="0"
                        step="0.001"
                        value={formData.mileageRate}
                        onChange={handleChange}
                        className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Travel Time Rate ($/hr)</label>
                      <input 
                        type="number" 
                        name="travelTimeHourlyRate"
                        required
                        min="0"
                        step="0.01"
                        value={formData.travelTimeHourlyRate}
                        onChange={handleChange}
                        className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Per Diem Rate ($/day)</label>
                      <input 
                        type="number" 
                        name="perDiemRate"
                        required
                        min="0"
                        step="0.01"
                        value={formData.perDiemRate}
                        onChange={handleChange}
                        className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                      />
                    </div>
                  </div>
                </div>
              </form>
            </div>
            
            <div className="px-6 py-4 border-t border-stone-100 bg-stone-50/50 flex justify-end gap-3 shrink-0">
              <button 
                type="button"
                onClick={handleCloseModal}
                className="px-4 py-2 text-sm font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-200/50 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button 
                type="submit"
                form="agency-form"
                className="bg-[#D49A6A] hover:bg-[#c28a5c] text-white px-6 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm"
              >
                Save Agency
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
