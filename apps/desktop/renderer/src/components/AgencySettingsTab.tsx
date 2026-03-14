import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2, X } from 'lucide-react';
import Swal from 'sweetalert2';
import type { Agency, DefaultLineItem, RateConfig } from '@dios/shared';
import RateConfigSection from './RateConfigSection';
import ChecklistEditor from './ChecklistEditor';

interface AgencySettingsTabProps {
  agency: Agency;
  onSave: (agency: Agency) => void;
  onDelete: (agencyId: string) => void;
  isNew?: boolean;
}

const labelClass = 'block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2';
const inputClass = 'w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-colors outline-none';

function safeParseJson<T>(json: string, fallback: T): T {
  try {
    const parsed = JSON.parse(json);
    return parsed as T;
  } catch {
    return fallback;
  }
}

function buildDefaultRateConfig(): RateConfig {
  return {
    isFlatRate: true,
    flatRateAmount: 0,
    flatRateIncludedHours: 0,
    flatRateOverageRate: 0,
    hourlyRate: 0,
    driveTimeHourlyRate: 0,
    mileageReimbursed: false,
    mileageRate: 0,
    perDiemRate: 0,
  };
}

export default function AgencySettingsTab({ agency, onSave, onDelete, isNew }: AgencySettingsTabProps) {
  const [form, setForm] = useState<Agency>({ ...agency });
  const [perTypeOpen, setPerTypeOpen] = useState(false);
  const [addingType, setAddingType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');

  const operationTypes: string[] = safeParseJson(form.operationTypes, []);
  const ratesByType: Record<string, RateConfig> = safeParseJson(form.ratesByType, {});
  const defaultLineItems: DefaultLineItem[] = safeParseJson(form.defaultLineItems, []);
  const prepChecklistItems: string[] = safeParseJson(form.prepChecklistItems, []);
  const reportChecklistItems: string[] = safeParseJson(form.reportChecklistItems, []);

  const updateField = <K extends keyof Agency>(field: K, value: Agency[K]) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleRateChange = (field: string, value: number | boolean | string) => {
    setForm(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleLineItemsChange = (items: DefaultLineItem[]) => {
    updateField('defaultLineItems', JSON.stringify(items));
  };

  const handlePerTypeRateChange = (typeName: string, field: string, value: number | boolean | string) => {
    const updated = {
      ...ratesByType,
      [typeName]: {
        ...(ratesByType[typeName] ?? buildDefaultRateConfig()),
        [field]: value,
      },
    };
    updateField('ratesByType', JSON.stringify(updated));
  };

  const handlePerTypeLineItemsChange = (typeName: string, items: DefaultLineItem[]) => {
    const currentConfig = ratesByType[typeName] ?? buildDefaultRateConfig();
    const updated = {
      ...ratesByType,
      [typeName]: {
        ...currentConfig,
        defaultLineItems: items,
      },
    };
    updateField('ratesByType', JSON.stringify(updated));
  };

  const handleAddOperationType = () => {
    const name = newTypeName.trim();
    if (!name || operationTypes.includes(name)) return;
    const updatedTypes = [...operationTypes, name];
    const updatedRates = {
      ...ratesByType,
      [name]: buildDefaultRateConfig(),
    };
    setForm(prev => ({
      ...prev,
      operationTypes: JSON.stringify(updatedTypes),
      ratesByType: JSON.stringify(updatedRates),
    }));
    setNewTypeName('');
    setAddingType(false);
  };

  const handleRemoveOperationType = (typeName: string) => {
    const updatedTypes = operationTypes.filter(t => t !== typeName);
    const { [typeName]: _removed, ...rest } = ratesByType;
    setForm(prev => ({
      ...prev,
      operationTypes: JSON.stringify(updatedTypes),
      ratesByType: JSON.stringify(rest),
    }));
  };

  const handleTogglePerTypeRates = (enabled: boolean) => {
    updateField('perTypeRatesEnabled', enabled);
  };

  const handleSave = () => {
    onSave({
      ...form,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleDeleteClick = async () => {
    const result = await Swal.fire({
      title: 'Delete Agency?',
      text: 'This will permanently delete this agency and all associated settings. This action cannot be undone.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#78716c',
      confirmButtonText: 'Yes, delete it',
    });
    if (result.isConfirmed) {
      onDelete(agency.id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Section 1: Agency Information */}
      <div className="bg-white rounded-2xl border border-stone-100 p-6 space-y-4">
        <h3 className="text-lg font-bold text-stone-800 mb-4">Agency Information</h3>
        <div>
          <label className={labelClass}>Agency Name</label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            className={inputClass}
            placeholder="e.g., MCIA"
          />
        </div>
        <div>
          <label className={labelClass}>Billing Address</label>
          <textarea
            value={form.billingAddress}
            onChange={(e) => updateField('billingAddress', e.target.value)}
            rows={3}
            className={`${inputClass} resize-none`}
            placeholder="123 Main St&#10;City, State 12345"
          />
        </div>
      </div>

      {/* Section 2: Billing Rates */}
      <div className="bg-white rounded-2xl border border-stone-100 p-6 space-y-4">
        <h3 className="text-lg font-bold text-stone-800 mb-4">Billing Rates</h3>
        <RateConfigSection
          isFlatRate={form.isFlatRate}
          flatRateAmount={form.flatRateAmount}
          flatRateIncludedHours={form.flatRateIncludedHours}
          flatRateOverageRate={form.flatRateOverageRate}
          hourlyRate={form.hourlyRate}
          driveTimeHourlyRate={form.driveTimeHourlyRate}
          mileageReimbursed={form.mileageReimbursed}
          mileageRate={form.mileageRate}
          perDiemRate={form.perDiemRate}
          defaultLineItems={defaultLineItems}
          onChange={handleRateChange}
          onLineItemsChange={handleLineItemsChange}
        />
      </div>

      {/* Section 3: Per-Type Rates (collapsible) */}
      <div className="bg-white rounded-2xl border border-stone-100 p-6 space-y-4">
        <button
          type="button"
          onClick={() => setPerTypeOpen(prev => !prev)}
          className="flex items-center gap-2 w-full text-left"
        >
          {perTypeOpen ? <ChevronDown size={20} className="text-stone-400" /> : <ChevronRight size={20} className="text-stone-400" />}
          <h3 className="text-lg font-bold text-stone-800">Per-Type Rates</h3>
        </button>

        {perTypeOpen && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <label className={labelClass}>Different rates per operation type</label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleTogglePerTypeRates(true)}
                  className={`px-3 py-1 rounded-xl text-xs font-medium transition-colors ${
                    form.perTypeRatesEnabled
                      ? 'bg-[#D49A6A] text-white'
                      : 'bg-stone-100 text-stone-600'
                  }`}
                >
                  Enabled
                </button>
                <button
                  type="button"
                  onClick={() => handleTogglePerTypeRates(false)}
                  className={`px-3 py-1 rounded-xl text-xs font-medium transition-colors ${
                    !form.perTypeRatesEnabled
                      ? 'bg-[#D49A6A] text-white'
                      : 'bg-stone-100 text-stone-600'
                  }`}
                >
                  Disabled
                </button>
              </div>
            </div>

            {form.perTypeRatesEnabled && (
              <div className={`space-y-6 ${!form.perTypeRatesEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
                {operationTypes.map((typeName) => {
                  const typeRates = ratesByType[typeName] ?? buildDefaultRateConfig();
                  const typeLineItems: DefaultLineItem[] = (typeRates as RateConfig & { defaultLineItems?: DefaultLineItem[] }).defaultLineItems ?? [];
                  return (
                    <div key={typeName} className="border border-stone-200 rounded-xl p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-stone-700">{typeName}</h4>
                        <button
                          type="button"
                          onClick={() => handleRemoveOperationType(typeName)}
                          className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
                        >
                          Remove Type
                        </button>
                      </div>
                      <RateConfigSection
                        isFlatRate={typeRates.isFlatRate}
                        flatRateAmount={typeRates.flatRateAmount}
                        flatRateIncludedHours={typeRates.flatRateIncludedHours}
                        flatRateOverageRate={typeRates.flatRateOverageRate}
                        hourlyRate={typeRates.hourlyRate}
                        driveTimeHourlyRate={typeRates.driveTimeHourlyRate}
                        mileageReimbursed={typeRates.mileageReimbursed}
                        mileageRate={typeRates.mileageRate}
                        perDiemRate={typeRates.perDiemRate}
                        defaultLineItems={typeLineItems}
                        onChange={(field, value) => handlePerTypeRateChange(typeName, field, value)}
                        onLineItemsChange={(items) => handlePerTypeLineItemsChange(typeName, items)}
                      />
                    </div>
                  );
                })}

                {addingType ? (
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      value={newTypeName}
                      onChange={(e) => setNewTypeName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddOperationType(); } }}
                      className={`flex-1 ${inputClass}`}
                      placeholder="e.g., Annual Inspection"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleAddOperationType}
                      disabled={!newTypeName.trim()}
                      className="px-4 py-2.5 bg-[#D49A6A] hover:bg-[#c28a5c] text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAddingType(false); setNewTypeName(''); }}
                      className="p-2 text-stone-400 hover:text-stone-600 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingType(true)}
                    className="text-sm font-medium text-[#D49A6A] hover:text-[#c28a5c] transition-colors flex items-center gap-1.5"
                  >
                    <Plus size={16} />
                    Add Type
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section 4: Billing Contact */}
      <div className="bg-white rounded-2xl border border-stone-100 p-6 space-y-4">
        <h3 className="text-lg font-bold text-stone-800 mb-4">Billing Contact</h3>
        <div>
          <label className={labelClass}>Contact Name</label>
          <input
            type="text"
            value={form.billingContactName}
            onChange={(e) => updateField('billingContactName', e.target.value)}
            className={inputClass}
            placeholder="e.g., Jane Smith"
          />
        </div>
        <div>
          <label className={labelClass}>Billing Email</label>
          <input
            type="email"
            value={form.billingEmail}
            onChange={(e) => updateField('billingEmail', e.target.value)}
            className={inputClass}
            placeholder="billing@agency.com"
          />
        </div>
      </div>

      {/* Section 5: Email Template */}
      <div className="bg-white rounded-2xl border border-stone-100 p-6 space-y-4">
        <h3 className="text-lg font-bold text-stone-800 mb-4">Email Template</h3>
        <div>
          <label className={labelClass}>Subject</label>
          <input
            type="text"
            value={form.emailTemplateSubject}
            onChange={(e) => updateField('emailTemplateSubject', e.target.value)}
            className={inputClass}
            placeholder="{operatorName} Invoice"
          />
        </div>
        <div>
          <label className={labelClass}>Body</label>
          <textarea
            value={form.emailTemplateBody}
            onChange={(e) => updateField('emailTemplateBody', e.target.value)}
            rows={6}
            className={`${inputClass} resize-none`}
            placeholder="Dear {agencyContact},&#10;&#10;Please find attached the invoice for..."
          />
        </div>
        <p className="text-xs text-stone-400">
          Available variables: <span className="font-mono text-stone-500">{'{agencyContact}'}</span>, <span className="font-mono text-stone-500">{'{agencyName}'}</span>, <span className="font-mono text-stone-500">{'{operatorName}'}</span>, <span className="font-mono text-stone-500">{'{inspectionDate}'}</span>, <span className="font-mono text-stone-500">{'{invoiceNumber}'}</span>, <span className="font-mono text-stone-500">{'{totalAmount}'}</span>, <span className="font-mono text-stone-500">{'{signature}'}</span>
        </p>
      </div>

      {/* Section 6: Prep Checklist */}
      <div className="bg-white rounded-2xl border border-stone-100 p-6 space-y-4">
        <h3 className="text-lg font-bold text-stone-800 mb-4">Prep Checklist</h3>
        <ChecklistEditor
          title="Prep Checklist"
          enabled={form.prepChecklistEnabled}
          onToggle={(enabled) => updateField('prepChecklistEnabled', enabled)}
          items={prepChecklistItems}
          onItemsChange={(items) => updateField('prepChecklistItems', JSON.stringify(items))}
        />
      </div>

      {/* Section 7: Report Checklist */}
      <div className="bg-white rounded-2xl border border-stone-100 p-6 space-y-4">
        <h3 className="text-lg font-bold text-stone-800 mb-4">Report Checklist</h3>
        <ChecklistEditor
          title="Report Checklist"
          enabled={form.reportChecklistEnabled}
          onToggle={(enabled) => updateField('reportChecklistEnabled', enabled)}
          items={reportChecklistItems}
          onItemsChange={(items) => updateField('reportChecklistItems', JSON.stringify(items))}
        />
      </div>

      {/* Section 8: Google Drive */}
      <div className="bg-white rounded-2xl border border-stone-100 p-6 space-y-4">
        <h3 className="text-lg font-bold text-stone-800 mb-4">Google Drive</h3>
        <div>
          <label className={labelClass}>Drive Folder ID</label>
          <input
            type="text"
            value={form.driveFolderId ?? ''}
            onChange={(e) => updateField('driveFolderId', e.target.value)}
            className={`${inputClass} font-mono`}
            placeholder="e.g., 1A2B3C4D5E6F..."
          />
        </div>
      </div>

      {/* Section 9: Danger Zone */}
      {!isNew && (
        <div className="bg-white rounded-2xl border-2 border-red-200 p-6 space-y-4">
          <h3 className="text-lg font-bold text-red-700 mb-4">Danger Zone</h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-stone-700">Delete this agency</p>
              <p className="text-xs text-stone-500 mt-1">Once deleted, this agency and its settings cannot be recovered.</p>
            </div>
            <button
              type="button"
              onClick={handleDeleteClick}
              className="px-4 py-2 bg-white border border-red-200 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50 transition-colors flex items-center gap-2"
            >
              <Trash2 size={16} />
              Delete Agency
            </button>
          </div>
        </div>
      )}

      {/* Footer: Save Button */}
      <div className="flex justify-end pt-2 pb-4">
        <button
          type="button"
          onClick={handleSave}
          className="bg-[#D49A6A] text-white hover:bg-[#c28a5c] px-6 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm"
        >
          Save Changes
        </button>
      </div>
    </div>
  );
}
