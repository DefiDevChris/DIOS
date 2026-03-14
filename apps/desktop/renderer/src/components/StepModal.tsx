import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import type { ChecklistItem } from '@dios/shared'

interface StepModalProps {
  isOpen: boolean
  onClose: () => void
  step: 'Prep' | 'Inspected' | 'Report'
  checklistItems: ChecklistItem[]
  checklistEnabled: boolean
  onComplete: (data: { hours: number; checklist: ChecklistItem[] }) => void
}

const STEP_TITLES: Record<StepModalProps['step'], string> = {
  Prep: 'Complete Prep',
  Inspected: 'Complete Inspection',
  Report: 'Complete Report',
}

const HOURS_LABELS: Record<StepModalProps['step'], string> = {
  Prep: 'Prep Hours',
  Inspected: 'Onsite Hours',
  Report: 'Report Writing Hours',
}

export default function StepModal({
  isOpen,
  onClose,
  step,
  checklistItems,
  checklistEnabled,
  onComplete,
}: StepModalProps) {
  const [hours, setHours] = useState(0)
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])

  useEffect(() => {
    if (isOpen) {
      setHours(0)
      setChecklist(checklistItems.map((ci) => ({ ...ci })))
    }
  }, [isOpen, checklistItems])

  if (!isOpen) {
    return null
  }

  const showChecklist = checklistEnabled && checklist.length > 0
  const allChecked = checklist.every((ci) => ci.checked)
  const isDisabled = hours <= 0 || (showChecklist && !allChecked)

  function handleToggleItem(index: number) {
    setChecklist((prev) =>
      prev.map((ci, i) =>
        i === index ? { ...ci, checked: !ci.checked } : ci
      )
    )
  }

  function handleComplete() {
    onComplete({ hours, checklist })
    setHours(0)
    setChecklist([])
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-100 flex justify-between items-center bg-stone-50/50">
          <h2 className="text-xl font-bold text-stone-900">
            {STEP_TITLES[step]}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {showChecklist && (
            <div>
              <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">
                Checklist
              </label>
              <div className="space-y-2">
                {checklist.map((ci, index) => (
                  <label
                    key={index}
                    className="flex items-center gap-3 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={ci.checked}
                      onChange={() => handleToggleItem(index)}
                      className="w-4 h-4 rounded border-stone-300 text-[#D49A6A] focus:ring-[#D49A6A]"
                    />
                    <span className="text-sm text-stone-700">{ci.item}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">
              {HOURS_LABELS[step]}
            </label>
            <input
              type="number"
              step="0.5"
              min="0"
              value={hours || ''}
              onChange={(e) => setHours(parseFloat(e.target.value) || 0)}
              placeholder="0"
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-stone-100 bg-stone-50/50 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-stone-600 hover:bg-stone-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isDisabled}
            onClick={handleComplete}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-[#D49A6A] text-white hover:bg-[#c28a5c] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            Complete
          </button>
        </div>
      </div>
    </div>
  )
}
