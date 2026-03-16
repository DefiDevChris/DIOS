import { render, screen, fireEvent } from '@testing-library/react'
import InspectionProgressBar from './InspectionProgressBar'

const STEP_LABELS = ['Scheduled', 'Prep', 'Inspected', 'Report', 'Invoiced', 'Paid']

describe('InspectionProgressBar', () => {
  it('renders all 6 step labels', () => {
    const onStepClick = vi.fn()
    render(<InspectionProgressBar currentStatus="Scheduled" onStepClick={onStepClick} />)

    for (const label of STEP_LABELS) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('highlights correct steps when currentStatus is Inspected', () => {
    const onStepClick = vi.fn()
    render(<InspectionProgressBar currentStatus="Inspected" onStepClick={onStepClick} />)

    const scheduled = screen.getByText('Scheduled')
    const prep = screen.getByText('Prep')
    const inspected = screen.getByText('Inspected')

    expect(scheduled).toHaveClass('text-[#d4a574]')
    expect(prep).toHaveClass('text-[#d4a574]')
    expect(inspected).toHaveClass('text-[#d4a574]')

    const report = screen.getByText('Report')
    const invoiced = screen.getByText('Invoiced')
    const paid = screen.getByText('Paid')

    expect(report).toHaveClass('text-[#a89b8c]')
    expect(invoiced).toHaveClass('text-[#a89b8c]')
    expect(paid).toHaveClass('text-[#a89b8c]')
  })

  it('fires onStepClick for clickable steps at or before current', () => {
    const onStepClick = vi.fn()
    render(<InspectionProgressBar currentStatus="Inspected" onStepClick={onStepClick} />)

    fireEvent.click(screen.getByText('Scheduled').closest('div[class*="flex flex-col"]')!)
    expect(onStepClick).toHaveBeenCalledWith('Scheduled')

    fireEvent.click(screen.getByText('Prep').closest('div[class*="flex flex-col"]')!)
    expect(onStepClick).toHaveBeenCalledWith('Prep')

    fireEvent.click(screen.getByText('Inspected').closest('div[class*="flex flex-col"]')!)
    expect(onStepClick).toHaveBeenCalledWith('Inspected')

    expect(onStepClick).toHaveBeenCalledTimes(3)
  })

  it('does NOT fire onStepClick for future steps', () => {
    const onStepClick = vi.fn()
    render(<InspectionProgressBar currentStatus="Inspected" onStepClick={onStepClick} />)

    fireEvent.click(screen.getByText('Report').closest('div[class*="flex flex-col"]')!)
    fireEvent.click(screen.getByText('Invoiced').closest('div[class*="flex flex-col"]')!)
    fireEvent.click(screen.getByText('Paid').closest('div[class*="flex flex-col"]')!)

    expect(onStepClick).not.toHaveBeenCalled()
  })

  it('disabled prop adds opacity class', () => {
    const onStepClick = vi.fn()
    const { container } = render(
      <InspectionProgressBar currentStatus="Scheduled" onStepClick={onStepClick} disabled />
    )

    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.className).toContain('opacity-40')
    expect(wrapper.className).toContain('pointer-events-none')
  })

  it('null currentStatus renders all steps as future', () => {
    const onStepClick = vi.fn()
    render(<InspectionProgressBar currentStatus={null} onStepClick={onStepClick} />)

    for (const label of STEP_LABELS) {
      expect(screen.getByText(label)).toHaveClass('text-[#a89b8c]')
    }
  })

  it('renders with Paid status showing all steps completed', () => {
    const onStepClick = vi.fn()
    render(<InspectionProgressBar currentStatus="Paid" onStepClick={onStepClick} />)

    for (const label of STEP_LABELS) {
      expect(screen.getByText(label)).toHaveClass('text-[#d4a574]')
    }
  })
})
