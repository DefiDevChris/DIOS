import { render, screen, fireEvent } from '@testing-library/react'
import StepModal from './StepModal'
import type { ChecklistItem } from '@dios/shared'

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  step: 'Prep' as const,
  checklistItems: [] as ChecklistItem[],
  checklistEnabled: false,
  onComplete: vi.fn(),
}

function renderModal(overrides: Partial<typeof defaultProps> = {}) {
  const props = { ...defaultProps, ...overrides, onClose: vi.fn(), onComplete: vi.fn(), ...overrides }
  return { ...render(<StepModal {...props} />), props }
}

describe('StepModal', () => {
  it('returns null when isOpen is false', () => {
    const { container } = render(<StepModal {...defaultProps} isOpen={false} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders title "Complete Prep" for step Prep', () => {
    renderModal({ step: 'Prep' })
    expect(screen.getByText('Complete Prep')).toBeInTheDocument()
  })

  it('renders title "Complete Inspection" for step Inspected', () => {
    renderModal({ step: 'Inspected' })
    expect(screen.getByText('Complete Inspection')).toBeInTheDocument()
  })

  it('renders title "Complete Report" for step Report', () => {
    renderModal({ step: 'Report' })
    expect(screen.getByText('Complete Report')).toBeInTheDocument()
  })

  it('shows checklist when checklistEnabled and items provided', () => {
    const items: ChecklistItem[] = [
      { item: 'Review documents', checked: false },
      { item: 'Check facility', checked: false },
    ]
    renderModal({ checklistEnabled: true, checklistItems: items })

    expect(screen.getByText('Review documents')).toBeInTheDocument()
    expect(screen.getByText('Check facility')).toBeInTheDocument()
    expect(screen.getByText('Checklist')).toBeInTheDocument()
  })

  it('hours input changes value', () => {
    renderModal()
    const input = screen.getByPlaceholderText('0') as HTMLInputElement
    fireEvent.change(input, { target: { value: '2.5' } })
    expect(input.value).toBe('2.5')
  })

  it('Complete button disabled when hours <= 0', () => {
    renderModal()
    const completeBtn = screen.getByText('Complete')
    expect(completeBtn).toBeDisabled()
  })

  it('Complete button disabled when checklist not all checked', () => {
    const items: ChecklistItem[] = [
      { item: 'Item A', checked: false },
      { item: 'Item B', checked: true },
    ]
    renderModal({ checklistEnabled: true, checklistItems: items })

    const hoursInput = screen.getByPlaceholderText('0')
    fireEvent.change(hoursInput, { target: { value: '2' } })

    const completeBtn = screen.getByText('Complete')
    expect(completeBtn).toBeDisabled()
  })

  it('Complete button enabled when hours > 0 and all checked', () => {
    const items: ChecklistItem[] = [
      { item: 'Item A', checked: true },
      { item: 'Item B', checked: true },
    ]
    renderModal({ checklistEnabled: true, checklistItems: items })

    const hoursInput = screen.getByPlaceholderText('0')
    fireEvent.change(hoursInput, { target: { value: '3' } })

    const completeBtn = screen.getByText('Complete')
    expect(completeBtn).not.toBeDisabled()
  })

  it('Cancel button calls onClose', () => {
    const { props } = renderModal()
    fireEvent.click(screen.getByText('Cancel'))
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('close button (X) calls onClose', () => {
    const { props } = renderModal()
    const header = screen.getByText('Complete Prep').closest('div[class*="flex justify-between"]')!
    const closeButton = header.querySelector('button')!
    fireEvent.click(closeButton)
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })
})
