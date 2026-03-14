import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { db } from '@dios/shared/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { logger } from '@dios/shared';
import { geocodeAndSaveOperation } from '../utils/geocodingUtils';
import { ensureOperationFolder } from '../lib/driveSync';
import { Plus, Edit2, Trash2, Building2, MapPin, Phone, Mail, Search, X, Briefcase, ChevronRight, Upload } from 'lucide-react';
import Papa from 'papaparse';
import Swal from 'sweetalert2';

interface Agency {
  id: string;
  name: string;
  operationTypes: string;
}

interface Operation {
  id: string;
  name: string;
  address: string;
  contactName: string;
  phone: string;
  email: string;
  agencyId: string;
  operationType: string;
  clientId: string;
  status: 'active' | 'inactive';
  notes: string;
  lat?: number;
  lng?: number;
}

export default function Operations() {
  const { user, googleAccessToken, isLocalUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [operations, setOperations] = useState<Operation[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOp, setEditingOp] = useState<Operation | null>(null);
  const [opToDelete, setOpToDelete] = useState<string | null>(null);

  // Import State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importData, setImportData] = useState<any[]>([]);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importMapping, setImportMapping] = useState<Record<string, string>>({
    name: '',
    address: '',
    contactName: '',
    phone: '',
    email: '',
    operationType: '',
    clientId: '',
  });
  const [importAgencyId, setImportAgencyId] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    contactName: '',
    phone: '',
    email: '',
    agencyId: '',
    operationType: '',
    clientId: '',
    status: 'active' as 'active' | 'inactive',
    notes: '',
  });

  useEffect(() => {
    if (!user || isLocalUser || !db) {
      setLoading(false);
      return;
    }

    // Fetch Agencies for the dropdown
    const agenciesPath = `users/${user.uid}/agencies`;
    const unsubAgencies = onSnapshot(
      collection(db, agenciesPath),
      (snapshot) => {
        const agenciesData: Agency[] = [];
        snapshot.forEach((doc) => {
          agenciesData.push({ id: doc.id, name: doc.data().name, operationTypes: doc.data().operationTypes || '["crop","handler"]' });
        });
        setAgencies(agenciesData);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, agenciesPath)
    );

    // Fetch Operations
    const opsPath = `users/${user.uid}/operations`;
    const unsubOps = onSnapshot(
      collection(db, opsPath),
      (snapshot) => {
        const opsData: Operation[] = [];
        snapshot.forEach((doc) => {
          opsData.push(doc.data() as Operation);
        });
        setOperations(opsData);
        setLoading(false);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, opsPath)
    );

    return () => {
      unsubAgencies();
      unsubOps();
    };
  }, [user, isLocalUser]);

  // Auto-open "Add Operation" modal when navigated here with ?new=1
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('new') === '1') {
      setIsModalOpen(true);
      setEditingOp(null);
    }
  }, [location.search]);

  const handleOpenModal = (op?: Operation) => {
    if (op) {
      setEditingOp(op);
      setFormData({
        name: op.name,
        address: op.address,
        contactName: op.contactName,
        phone: op.phone,
        email: op.email,
        agencyId: op.agencyId,
        operationType: op.operationType || '',
        clientId: op.clientId || '',
        status: op.status,
        notes: op.notes,
      });
    } else {
      setEditingOp(null);
      setFormData({
        name: '',
        address: '',
        contactName: '',
        phone: '',
        email: '',
        agencyId: agencies.length > 0 ? agencies[0].id : '',
        operationType: '',
        clientId: '',
        status: 'active',
        notes: '',
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingOp(null);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || isLocalUser || !db) {
      Swal.fire({ text: 'Cannot save operation in offline mode.', icon: 'warning' });
      return;
    }

    const opId = editingOp ? editingOp.id : doc(collection(db, `users/${user.uid}/operations`)).id;
    const path = `users/${user.uid}/operations/${opId}`;
    
    const opData: Operation = {
      id: opId,
      ...formData
    };

    try {
      await setDoc(doc(db, path), opData, { merge: true });
      handleCloseModal();

      // Fire-and-forget background geocoding whenever an address is present
      // and coordinates are not yet stored (new op) or address may have changed.
      if (opData.address && (!editingOp || editingOp.address !== opData.address)) {
        geocodeAndSaveOperation(user.uid, opId, opData.address).catch(err =>
          logger.error('Background geocoding failed:', err)
        );
      }

      // Fire-and-forget: create Google Drive folder for new operations
      if (!editingOp) {
        const token = googleAccessToken || localStorage.getItem('googleAccessToken');
        if (token && token !== 'dummy') {
          const agencyName = agencies.find(a => a.id === formData.agencyId)?.name || 'Unknown Agency';
          ensureOperationFolder(token, user.uid, agencyName, formData.name).catch(err => {
            logger.error('Failed to create Drive folder for operation:', err);
          });
        }
      }
    } catch (error) {
      handleFirestoreError(error, editingOp ? OperationType.UPDATE : OperationType.CREATE, path);
      Swal.fire({ text: 'Failed to save operation. Please try again.', icon: 'error' });
    }
  };

  const handleDelete = (opId: string) => {
    setOpToDelete(opId);
  };

  const confirmDelete = async () => {
    if (!user || !opToDelete || isLocalUser || !db) {
      Swal.fire({ text: 'Cannot delete operation in offline mode.', icon: 'warning' });
      return;
    }
    
    const path = `users/${user.uid}/operations/${opToDelete}`;
    try {
      await deleteDoc(doc(db, path));
      setOpToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
      Swal.fire({ text: 'Failed to delete operation.', icon: 'error' });
    }
  };

  const handleImportMappingChange = (field: string, header: string) => {
    setImportMapping(prev => ({ ...prev, [field]: header }));
  };

  const handleConfirmImport = async () => {
    if (!user || !importAgencyId || isLocalUser || !db) {
      Swal.fire({ text: 'Cannot import operations in offline mode.', icon: 'warning' });
      return;
    }

    try {
      // Instead of writeBatch (since we don't have it imported and setDoc is easy), we'll use Promise.all
      // Note: For very large CSVs, a batch is better, but this works fine for typical sizes.
      const importPromises = importData.map(row => {
        const opId = doc(collection(db, `users/${user.uid}/operations`)).id;
        const opData: Operation = {
          id: opId,
          name: importMapping.name ? (row[importMapping.name] || '') : '',
          address: importMapping.address ? (row[importMapping.address] || '') : '',
          contactName: importMapping.contactName ? (row[importMapping.contactName] || '') : '',
          phone: importMapping.phone ? (row[importMapping.phone] || '') : '',
          email: importMapping.email ? (row[importMapping.email] || '') : '',
          agencyId: importAgencyId,
          operationType: importMapping.operationType ? (row[importMapping.operationType] || '') : '',
          clientId: importMapping.clientId ? (row[importMapping.clientId] || '') : '',
          status: 'active',
          notes: 'Imported from CSV',
        };

        // Only import if we at least have a name
        if (opData.name.trim()) {
          return setDoc(doc(db, `users/${user.uid}/operations/${opId}`), opData);
        }
        return Promise.resolve();
      });

      await Promise.all(importPromises);
      setIsImportModalOpen(false);
      setImportData([]);
      setImportHeaders([]);
      Swal.fire({ text: `Successfully imported ${importData.length} operations.`, icon: 'success', timer: 2000, showConfirmButton: false });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/operations`);
      Swal.fire({ text: 'Failed to import operations. Please try again.', icon: 'error' });
    }
  };

  const filteredOperations = operations.filter(op => 
    op.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    op.contactName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    op.address.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getAgencyName = (agencyId: string) => {
    return agencies.find(a => a.id === agencyId)?.name || 'Unknown Agency';
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data && results.data.length > 0) {
          const headers = results.meta.fields || [];
          setImportHeaders(headers);
          setImportData(results.data);

          // Auto-map columns if possible
          const newMapping: Record<string, string> = {
            name: '',
            address: '',
            contactName: '',
            phone: '',
            email: '',
            operationType: '',
            clientId: '',
          };

          headers.forEach(h => {
            const lower = h.toLowerCase();
            if (lower.includes('name') && !lower.includes('contact')) newMapping.name = h;
            if (lower.includes('address') || lower.includes('street')) newMapping.address = h;
            if (lower.includes('contact')) newMapping.contactName = h;
            if (lower.includes('phone') || lower.includes('tel')) newMapping.phone = h;
            if (lower.includes('email')) newMapping.email = h;
            if (lower.includes('type') || lower === 'operationtype') newMapping.operationType = h;
            if (lower.includes('client') && lower.includes('id')) newMapping.clientId = h;
          });

          setImportMapping(newMapping);
          setImportAgencyId(agencies.length > 0 ? agencies[0].id : '');
          setIsImportModalOpen(true);
        }
      },
      error: (error) => {
        logger.error('Error parsing CSV:', error);
        Swal.fire({ text: 'Failed to parse CSV file.', icon: 'error' });
      }
    });

    // Reset file input
    if (e.target) e.target.value = '';
  };

  return (
    <div className="animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight">Operations Directory</h1>
          <p className="mt-2 text-stone-500 text-sm">Manage farms, processors, and businesses you inspect.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="bg-white border border-[#D49A6A] text-[#D49A6A] hover:bg-[#D49A6A]/10 cursor-pointer px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors shadow-sm whitespace-nowrap">
            <Upload size={18} />
            Import CSV
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileUpload}
            />
          </label>
          <button
            onClick={() => handleOpenModal()}
            className="bg-[#D49A6A] hover:bg-[#c28a5c] text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors shadow-sm whitespace-nowrap"
          >
            <Plus size={18} />
            Add Operation
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden flex flex-col min-h-[500px]">
        {/* Toolbar */}
        <div className="p-4 border-b border-stone-100 flex items-center gap-4 bg-stone-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
            <input 
              type="text" 
              placeholder="Search operations by name, contact, or address..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-stone-200 focus:border-[#D49A6A] focus:ring-2 focus:ring-[#D49A6A]/20 rounded-xl py-2 pl-10 pr-4 text-sm transition-all"
            />
          </div>
          <div className="text-sm text-stone-500 font-medium">
            {filteredOperations.length} {filteredOperations.length === 1 ? 'Operation' : 'Operations'}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-stone-500">Loading operations...</div>
        ) : operations.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="w-16 h-16 bg-stone-50 rounded-2xl flex items-center justify-center mb-4 border border-stone-100">
              <Building2 size={32} className="text-stone-300" />
            </div>
            <h3 className="text-lg font-bold text-stone-900 mb-1">No operations found</h3>
            <p className="text-stone-500 text-sm max-w-sm mx-auto mb-6">
              Get started by adding your first farm or business to the directory.
            </p>
            <button 
              onClick={() => handleOpenModal()}
              className="text-[#D49A6A] font-medium hover:text-[#c28a5c] transition-colors"
            >
              + Add Operation
            </button>
          </div>
        ) : filteredOperations.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-stone-500">
            <Search size={32} className="text-stone-300 mb-3" />
            <p>No operations match your search.</p>
          </div>
        ) : (
          <div className="divide-y divide-stone-100 flex-1 overflow-y-auto">
            {filteredOperations.map((op) => (
              <div key={op.id} className="p-4 sm:p-6 hover:bg-stone-50/50 transition-colors group">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  
                  <div 
                    className="flex-1 min-w-0 cursor-pointer" 
                    onClick={() => navigate(`/operations/${op.id}`)}
                  >
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-lg font-bold text-stone-900 truncate group-hover:text-[#D49A6A] transition-colors">{op.name}</h3>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        op.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-600'
                      }`}>
                        {op.status}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                        <Briefcase size={10} />
                        {getAgencyName(op.agencyId)}
                      </span>
                      {op.operationType && (
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold uppercase tracking-wider">
                          {op.operationType}
                        </span>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 mt-3">
                      <div className="flex items-start gap-2 text-sm text-stone-600">
                        <MapPin size={16} className="text-stone-400 shrink-0 mt-0.5" />
                        <span className="truncate">{op.address || 'No address provided'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-stone-600">
                        <Phone size={16} className="text-stone-400 shrink-0" />
                        <span className="truncate">{op.phone || 'No phone'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-stone-600">
                        <Mail size={16} className="text-stone-400 shrink-0" />
                        <span className="truncate">{op.email || 'No email'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleOpenModal(op); }}
                      className="p-2 text-stone-400 hover:text-[#D49A6A] bg-white hover:bg-[#D49A6A]/10 rounded-lg transition-colors border border-stone-200 hover:border-transparent"
                      title="Edit"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDelete(op.id); }}
                      className="p-2 text-stone-400 hover:text-red-600 bg-white hover:bg-red-50 rounded-lg transition-colors border border-stone-200 hover:border-transparent"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                    <button 
                      onClick={() => navigate(`/operations/${op.id}`)}
                      className="p-2 text-stone-400 hover:text-stone-900 bg-white hover:bg-stone-100 rounded-lg transition-colors border border-stone-200 hover:border-transparent ml-2"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>

                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-stone-100 flex justify-between items-center bg-stone-50/50 shrink-0">
              <h2 className="text-lg font-bold text-stone-900">
                {editingOp ? 'Edit Operation' : 'Add New Operation'}
              </h2>
              <button 
                onClick={handleCloseModal}
                className="text-stone-400 hover:text-stone-600 transition-colors p-1"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <form id="operation-form" onSubmit={handleSave} className="space-y-6">
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Operation Name</label>
                    <input 
                      type="text" 
                      name="name"
                      required
                      value={formData.name}
                      onChange={handleChange}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                      placeholder="e.g., Smith Family Organic Farm"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Address</label>
                    <input 
                      type="text" 
                      name="address"
                      value={formData.address}
                      onChange={handleChange}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                      placeholder="123 Farm Road, City, State ZIP"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Contact Name</label>
                    <input 
                      type="text" 
                      name="contactName"
                      value={formData.contactName}
                      onChange={handleChange}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                      placeholder="e.g., Jane Smith"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Certifying Agency</label>
                    <select
                      name="agencyId"
                      required
                      value={formData.agencyId}
                      onChange={handleChange}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                    >
                      <option value="" disabled>Select an agency...</option>
                      {agencies.map(agency => (
                        <option key={agency.id} value={agency.id}>{agency.name}</option>
                      ))}
                    </select>
                    {agencies.length === 0 && (
                      <p className="text-xs text-amber-600 mt-1">Please add an agency in Settings first.</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Operation Type</label>
                    <select
                      name="operationType"
                      value={formData.operationType}
                      onChange={handleChange}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                    >
                      <option value="">Select type...</option>
                      {(() => {
                        const selectedAgency = agencies.find(a => a.id === formData.agencyId);
                        const types: string[] = selectedAgency
                          ? (() => { try { return JSON.parse(selectedAgency.operationTypes); } catch { return ['crop', 'handler']; } })()
                          : ['crop', 'handler'];
                        return types.map((t: string) => (
                          <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                        ));
                      })()}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Client ID</label>
                    <input
                      type="text"
                      name="clientId"
                      value={formData.clientId}
                      onChange={handleChange}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                      placeholder="e.g., VFO-001"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Phone</label>
                    <input 
                      type="tel" 
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                      placeholder="(555) 123-4567"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Email</label>
                    <input 
                      type="email" 
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                      placeholder="jane@example.com"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Status</label>
                    <select
                      name="status"
                      value={formData.status}
                      onChange={handleChange}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                  
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Internal Notes</label>
                    <textarea 
                      name="notes"
                      value={formData.notes}
                      onChange={handleChange}
                      rows={3}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all resize-none"
                      placeholder="Gate code, dogs on property, specific directions..."
                    />
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
                form="operation-form"
                disabled={agencies.length === 0}
                className="bg-[#D49A6A] hover:bg-[#c28a5c] text-white px-6 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save Operation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-stone-100 flex justify-between items-center bg-stone-50/50 shrink-0">
              <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2">
                <Upload size={20} className="text-[#D49A6A]" />
                Import Operations
              </h2>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="text-stone-400 hover:text-stone-600 transition-colors p-1"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              <div className="mb-6">
                <p className="text-sm text-stone-600 mb-4">
                  Found {importData.length} rows in the CSV. Please map the columns below and select an agency for these operations.
                </p>

                <div className="mb-6">
                  <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Target Certifying Agency</label>
                  <select
                    value={importAgencyId}
                    onChange={(e) => setImportAgencyId(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                  >
                    <option value="" disabled>Select an agency...</option>
                    {agencies.map(agency => (
                      <option key={agency.id} value={agency.id}>{agency.name}</option>
                    ))}
                  </select>
                </div>

                <h3 className="text-sm font-bold text-stone-900 mb-3">Map CSV Columns</h3>
                <div className="space-y-4">
                  {[
                    { key: 'name', label: 'Operation Name *' },
                    { key: 'contactName', label: 'Contact Name' },
                    { key: 'address', label: 'Address' },
                    { key: 'phone', label: 'Phone' },
                    { key: 'email', label: 'Email' },
                    { key: 'operationType', label: 'Operation Type' },
                    { key: 'clientId', label: 'Client ID' }
                  ].map(field => (
                    <div key={field.key} className="flex items-center gap-4">
                      <div className="w-1/3 text-sm font-medium text-stone-700">{field.label}</div>
                      <select
                        value={importMapping[field.key]}
                        onChange={(e) => handleImportMappingChange(field.key, e.target.value)}
                        className="flex-1 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
                      >
                        <option value="">-- Ignore --</option>
                        {importHeaders.map(header => (
                          <option key={header} value={header}>{header}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-stone-100 bg-stone-50/50 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-200/50 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={!importAgencyId || !importMapping.name}
                className="bg-[#D49A6A] hover:bg-[#c28a5c] text-white px-6 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Import {importData.length} Operations
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {opToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
                <Trash2 size={24} className="text-red-500" />
              </div>
              <h2 className="text-xl font-bold text-stone-900 mb-2">Delete Operation?</h2>
              <p className="text-sm text-stone-500">
                Are you sure you want to delete this operation? This action cannot be undone.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-stone-100 bg-stone-50/50 flex justify-end gap-3 shrink-0">
              <button 
                type="button"
                onClick={() => setOpToDelete(null)}
                className="px-4 py-2 text-sm font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-200/50 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete}
                className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
