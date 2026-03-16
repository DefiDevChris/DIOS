import React from 'react'
import {
  CalendarCheck,
  ClipboardCheck,
  Search,
  FileText,
  Receipt,
  Coins,
  Check,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react'

interface Step {
  readonly id: string
  readonly label: string
  readonly icon: LucideIcon
}

const STEPS: readonly Step[] = [
  { id: 'Scheduled', label: 'Scheduled', icon: CalendarCheck },
  { id: 'Prep', label: 'Prep', icon: ClipboardCheck },
  { id: 'Inspected', label: 'Inspected', icon: Search },
  { id: 'Report', label: 'Report', icon: FileText },
  { id: 'Invoiced', label: 'Invoiced', icon: Receipt },
  { id: 'Paid', label: 'Paid', icon: Coins },
] as const

interface InspectionProgressBarProps {
  currentStatus: string | null
  onStepClick: (step: string) => void
  disabled?: boolean
}

function getStepState(
  stepIndex: number,
  currentStepIndex: number
): 'completed' | 'current' | 'future' {
  if (currentStepIndex < 0) return 'future'
  if (stepIndex < currentStepIndex) return 'completed'
  if (stepIndex === currentStepIndex) return 'current'
  return 'future'
}

function isClickable(stepIndex: number, currentStepIndex: number): boolean {
  if (currentStepIndex < 0) return false
  return stepIndex <= currentStepIndex
}

function getCircleClasses(state: 'completed' | 'current' | 'future'): string {
  const base = 'w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all'

  switch (state) {
    case 'completed':
      return `${base} border-[#d4a574] text-[#d4a574] bg-white`
    case 'current':
      return `${base} border-[#d4a574] ring-4 ring-[#d4a574]/10 bg-white text-[#d4a574]`
    case 'future':
      return `${base} border-[rgba(212,165,116,0.15)] text-[#a89b8c] bg-white`
  }
}

function getLabelClasses(state: 'completed' | 'current' | 'future'): string {
  const base = 'text-xs font-medium mt-1 text-center'

  switch (state) {
    case 'completed':
    case 'current':
      return `${base} text-[#d4a574]`
    case 'future':
      return `${base} text-[#a89b8c]`
  }
}

export default function InspectionProgressBar({
  currentStatus,
  onStepClick,
  disabled = false,
}: InspectionProgressBarProps) {
  const currentStepIndex = currentStatus
    ? STEPS.findIndex((s) => s.id === currentStatus)
    : -1

  return (
    <div
      className={`bg-[rgba(212,165,116,0.03)] rounded-2xl border border-[rgba(212,165,116,0.12)] p-4${
        disabled ? ' opacity-40 pointer-events-none' : ''
      }`}
    >
      <div className="flex items-center justify-center gap-2">
        {STEPS.map((step, index) => {
          const state = getStepState(index, currentStepIndex)
          const clickable = isClickable(index, currentStepIndex)
          const Icon = state === 'completed' ? Check : step.icon

          return (
            <React.Fragment key={step.id}>
              <div
                className={`flex flex-col items-center ${
                  clickable ? 'cursor-pointer' : 'cursor-default'
                }`}
                onClick={() => {
                  if (clickable) {
                    onStepClick(step.id)
                  }
                }}
              >
                <div className={getCircleClasses(state)}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className={getLabelClasses(state)}>{step.label}</span>
              </div>

              {index < STEPS.length - 1 && (
                <ChevronRight className="text-[#d4a574] w-5 h-5 flex-shrink-0" />
              )}
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}
