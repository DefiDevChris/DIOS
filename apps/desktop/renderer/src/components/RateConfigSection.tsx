import { Plus, X, DollarSign } from 'lucide-react';
import type { DefaultLineItem } from '@dios/shared';

interface RateConfigSectionProps {
  isFlatRate: boolean;
  flatRateAmount: number;
  flatRateBaseAmount?: number;
  flatRateIncludedHours: number;
  flatRateOverageRate: number;
  hourlyRate: number;
  additionalHourlyRate?: number;
  driveTimeHourlyRate: number;
  mileageReimbursed: boolean;
  mileageRate: number;
  perDiemRate: number;
  defaultLineItems: DefaultLineItem[];
  onChange: (field: string, value: number | boolean | string) => void;
  onLineItemsChange: (items: DefaultLineItem[]) => void;
}

const labelClass = 'block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2';
const inputClass = 'w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all outline-none';

function toggleButtonClass(active: boolean): string {
  return `flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border ${
    active
      ? 'bg-[#D49A6A] text-white border-[#D49A6A] shadow-sm'
      : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
  }`;
}

export default function RateConfigSection({
  isFlatRate,
  flatRateAmount,
  flatRateBaseAmount = 0,
  flatRateIncludedHours,
  flatRateOverageRate,
  hourlyRate,
  additionalHourlyRate = 0,
  driveTimeHourlyRate,
  mileageReimbursed,
  mileageRate,
  perDiemRate,
  defaultLineItems,
  onChange,
  onLineItemsChange,
}: RateConfigSectionProps) {
  const handleNumericChange = (field: string, value: string) => {
    onChange(field, parseFloat(value) || 0);
  };

  const handleAddLineItem = () => {
    onLineItemsChange([...defaultLineItems, { name: '', amount: 0 }]);
  };

  const handleUpdateLineItem = (index: number, field: keyof DefaultLineItem, value: string | number) => {
    const updated = defaultLineItems.map((item, i) => {
      if (i !== index) return item;
      return {
        ...item,
        [field]: field === 'amount' ? (parseFloat(value as string) || 0) : value,
      };
    });
    onLineItemsChange(updated);
  };

  const handleRemoveLineItem = (index: number) => {
    onLineItemsChange(defaultLineItems.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      {/* Row 1: Flat Rate Toggle */}
      <div>
        <label className={labelClass}>Billing Type</label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChange('isFlatRate', true)}
            className={toggleButtonClass(isFlatRate)}
          >
            Flat Rate
          </button>
          <button
            type="button"
            onClick={() => onChange('isFlatRate', false)}
            className={toggleButtonClass(!isFlatRate)}
          >
            Hourly
          </button>
        </div>
      </div>

      {/* Conditional Row 2: Flat Rate fields */}
      {isFlatRate && (
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Flat Rate Amount ($)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={flatRateAmount}
              onChange={(e) => handleNumericChange('flatRateAmount', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Base Amount ($)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={flatRateBaseAmount}
              onChange={(e) => handleNumericChange('flatRateBaseAmount', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Included Hours</label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={flatRateIncludedHours}
              onChange={(e) => handleNumericChange('flatRateIncludedHours', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Overage Rate ($/hr)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={flatRateOverageRate}
              onChange={(e) => handleNumericChange('flatRateOverageRate', e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      )}

      {/* Row 2b: Hourly Rate fields (always shown; labeled "Additional" when flat rate is also active) */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>{isFlatRate ? 'Additional Hourly Rate ($/hr)' : 'Hourly Rate ($/hr)'}</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={isFlatRate ? additionalHourlyRate : hourlyRate}
            onChange={(e) => handleNumericChange(isFlatRate ? 'additionalHourlyRate' : 'hourlyRate', e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      {/* Row 3: Drive Time Rate */}
      <div>
        <label className={labelClass}>Drive Time Hourly Rate ($/hr)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={driveTimeHourlyRate}
          onChange={(e) => handleNumericChange('driveTimeHourlyRate', e.target.value)}
          className={inputClass}
        />
      </div>

      {/* Row 4: Mileage Toggle */}
      <div>
        <label className={labelClass}>Mileage Reimbursed</label>
        <div className="flex items-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => onChange('mileageReimbursed', true)}
            className={toggleButtonClass(mileageReimbursed)}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => onChange('mileageReimbursed', false)}
            className={toggleButtonClass(!mileageReimbursed)}
          >
            No
          </button>
        </div>
        {mileageReimbursed && (
          <div>
            <label className={labelClass}>Mileage Rate ($/mi)</label>
            <input
              type="number"
              min="0"
              step="0.001"
              value={mileageRate}
              onChange={(e) => handleNumericChange('mileageRate', e.target.value)}
              className={inputClass}
            />
          </div>
        )}
      </div>

      {/* Row 5: Per Diem */}
      <div>
        <label className={labelClass}>Per Diem Rate ($/day)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={perDiemRate}
          onChange={(e) => handleNumericChange('perDiemRate', e.target.value)}
          className={inputClass}
        />
      </div>

      {/* Row 6: Default Line Items */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-bold text-stone-500 uppercase tracking-wider flex items-center gap-2">
            <DollarSign size={14} className="text-[#D49A6A]" />
            Default Invoice Line Items
          </h4>
          <button
            type="button"
            onClick={handleAddLineItem}
            className="text-[#D49A6A] hover:text-[#c28a5c] text-sm font-medium flex items-center gap-1 transition-colors"
          >
            <Plus size={16} />
            Add
          </button>
        </div>

        {defaultLineItems.length === 0 ? (
          <div className="text-sm text-stone-400 py-4 text-center border border-dashed border-stone-200 rounded-xl">
            No default line items
          </div>
        ) : (
          <div className="space-y-2">
            {defaultLineItems.map((item, index) => (
              <div key={index} className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Item name"
                  value={item.name}
                  onChange={(e) => handleUpdateLineItem(index, 'name', e.target.value)}
                  className={`flex-1 ${inputClass}`}
                />
                <input
                  type="number"
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  value={item.amount}
                  onChange={(e) => handleUpdateLineItem(index, 'amount', e.target.value)}
                  className={`w-32 ${inputClass}`}
                />
                <button
                  type="button"
                  onClick={() => handleRemoveLineItem(index)}
                  className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                  title="Remove"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
