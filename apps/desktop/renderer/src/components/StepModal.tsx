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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

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
    <div className="luxury-modal-backdrop z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="luxury-modal-card rounded-[28px] w-full max-w-md overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-5 flex justify-between items-center">
          <h2 className="font-serif-display text-2xl font-semibold text-[#2a2420]">
            {STEP_TITLES[step]}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-[#a89b8c] hover:text-[#2a2420] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="luxury-divider mx-6" />

        {/* Body */}
        <div className="p-6 space-y-5 flex-1 overflow-y-auto">
          {showChecklist && (
            <div>
              <label className="block text-xs font-bold text-[#8b7355] uppercase tracking-wider mb-2 font-body">
                Checklist
              </label>
              <div className="space-y-2.5">
                {checklist.map((ci, index) => (
                  <button
                    type="button"
                    key={index}
                    onClick={() => handleToggleItem(index)}
                    className="flex items-center gap-3 cursor-pointer w-full text-left"
                  >
                    <span
                      className={`luxury-check-orb${ci.checked ? ' checked' : ''}`}
                    />
                    <span className="text-sm text-[#7a6b5a] font-body">{ci.item}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[#8b7355] uppercase tracking-wider mb-2 font-body">
              {HOURS_LABELS[step]}
            </label>
            <input
              type="number"
              step="0.5"
              min="0"
              value={hours || ''}
              onChange={(e) => setHours(parseFloat(e.target.value) || 0)}
              placeholder="0"
              className="w-full luxury-input rounded-2xl px-4 py-3 text-sm font-body outline-none"
            />
          </div>
        </div>

        <div className="luxury-divider mx-6" />

        {/* Footer */}
        <div className="px-6 py-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="luxury-btn-secondary px-6 py-3 rounded-2xl text-[15px] font-bold border-0 cursor-pointer font-body"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isDisabled}
            onClick={handleComplete}
            className="luxury-btn text-white px-8 py-3 rounded-2xl text-[15px] font-bold border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed font-body"
          >
            Complete
          </button>
        </div>
      </div>
    </div>
  )
}
