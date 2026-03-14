import { render, screen, fireEvent } from '@testing-library/react'
import RateConfigSection from './RateConfigSection'
import type { DefaultLineItem } from '@dios/shared'

const defaultProps = {
  isFlatRate: true,
  flatRateAmount: 500,
  flatRateIncludedHours: 8,
  flatRateOverageRate: 50,
  hourlyRate: 75,
  driveTimeHourlyRate: 40,
  mileageReimbursed: false,
  mileageRate: 0.655,
  perDiemRate: 50,
  defaultLineItems: [] as DefaultLineItem[],
  onChange: vi.fn(),
  onLineItemsChange: vi.fn(),
}

function renderSection(overrides: Partial<typeof defaultProps> = {}) {
  const props = { ...defaultProps, onChange: vi.fn(), onLineItemsChange: vi.fn(), ...overrides }
  return { ...render(<RateConfigSection {...props} />), props }
}

describe('RateConfigSection', () => {
  it('renders Flat Rate / Hourly toggle buttons', () => {
    renderSection()
    expect(screen.getByText('Flat Rate')).toBeInTheDocument()
    expect(screen.getByText('Hourly')).toBeInTheDocument()
  })

  it('when isFlatRate shows flat rate fields', () => {
    renderSection({ isFlatRate: true })
    expect(screen.getByText('Flat Rate Amount ($)')).toBeInTheDocument()
    expect(screen.getByText('Included Hours')).toBeInTheDocument()
    expect(screen.getByText('Overage Rate ($/hr)')).toBeInTheDocument()
  })

  it('when not isFlatRate shows hourly rate field', () => {
    renderSection({ isFlatRate: false })
    expect(screen.getByText('Hourly Rate ($/hr)')).toBeInTheDocument()
    expect(screen.queryByText('Flat Rate Amount ($)')).not.toBeInTheDocument()
    expect(screen.queryByText('Included Hours')).not.toBeInTheDocument()
  })

  it('clicking Flat Rate calls onChange with isFlatRate true', () => {
    const { props } = renderSection({ isFlatRate: false })
    fireEvent.click(screen.getByText('Flat Rate'))
    expect(props.onChange).toHaveBeenCalledWith('isFlatRate', true)
  })

  it('clicking Hourly calls onChange with isFlatRate false', () => {
    const { props } = renderSection({ isFlatRate: true })
    fireEvent.click(screen.getByText('Hourly'))
    expect(props.onChange).toHaveBeenCalledWith('isFlatRate', false)
  })

  it('shows mileage rate field only when mileageReimbursed is true', () => {
    const { rerender } = renderSection({ mileageReimbursed: false })
    expect(screen.queryByText('Mileage Rate ($/mi)')).not.toBeInTheDocument()

    rerender(<RateConfigSection {...defaultProps} mileageReimbursed={true} />)
    expect(screen.getByText('Mileage Rate ($/mi)')).toBeInTheDocument()
  })

  it('shows "No default line items" when empty array', () => {
    renderSection({ defaultLineItems: [] })
    expect(screen.getByText('No default line items')).toBeInTheDocument()
  })

  it('Add button for line items calls onLineItemsChange', () => {
    const { props } = renderSection({ defaultLineItems: [] })
    fireEvent.click(screen.getByText('Add'))
    expect(props.onLineItemsChange).toHaveBeenCalledWith([{ name: '', amount: 0 }])
  })
})
