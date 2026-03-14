import { render, screen, fireEvent } from '@testing-library/react'
import NearbyOperatorsModal from './NearbyOperatorsModal'
import type { Operation, Agency } from '@dios/shared'

vi.mock('react-router', () => ({
  useNavigate: () => vi.fn(),
}))

function makeOperation(overrides: Partial<Operation> = {}): Operation {
  return {
    id: 'op-1',
    name: 'Test Farm',
    agencyId: 'agency-1',
    address: '123 Main St',
    contactName: 'John',
    phone: '555-1234',
    email: 'john@test.com',
    status: 'active',
    operationType: 'Crop',
    clientId: 'client-1',
    updatedAt: '2026-01-01',
    syncStatus: 'synced',
    ...overrides,
  }
}

function makeAgency(overrides: Partial<Agency> = {}): Agency {
  return {
    id: 'agency-1',
    name: 'Test Agency',
    billingAddress: '456 Oak Ave',
    isFlatRate: false,
    flatRateAmount: 0,
    flatRateIncludedHours: 0,
    flatRateOverageRate: 0,
    hourlyRate: 75,
    driveTimeHourlyRate: 40,
    mileageReimbursed: false,
    mileageRate: 0,
    perDiemRate: 0,
    perTypeRatesEnabled: false,
    ratesByType: '',
    operationTypes: '',
    billingEmail: 'billing@test.com',
    billingContactName: 'Billing Dept',
    emailTemplateSubject: '',
    emailTemplateBody: '',
    prepChecklistEnabled: false,
    prepChecklistItems: '',
    reportChecklistEnabled: false,
    reportChecklistItems: '',
    defaultLineItems: '',
    updatedAt: '2026-01-01',
    syncStatus: 'synced',
    ...overrides,
  }
}

const currentOp = makeOperation({ id: 'current', name: 'Current Farm', lat: 40.0, lng: -90.0 })
const nearOp = makeOperation({ id: 'near', name: 'Near Farm', lat: 40.01, lng: -90.01, agencyId: 'agency-1' })
const farOp = makeOperation({ id: 'far', name: 'Far Farm', lat: 41.0, lng: -89.0, agencyId: 'agency-1' })
const agencies = [makeAgency({ id: 'agency-1', name: 'Organic Certifiers' })]

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  currentOperation: currentOp,
  operations: [nearOp, farOp],
  agencies,
}

describe('NearbyOperatorsModal', () => {
  it('returns null when isOpen is false', () => {
    const { container } = render(
      <NearbyOperatorsModal {...defaultProps} isOpen={false} onClose={vi.fn()} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('shows "Nearby Operators" title when open', () => {
    render(<NearbyOperatorsModal {...defaultProps} onClose={vi.fn()} />)
    expect(screen.getByText('Nearby Operators')).toBeInTheDocument()
  })

  it('when currentOperation has no lat/lng, shows location not set message', () => {
    const noLocationOp = makeOperation({ id: 'no-loc', name: 'No Loc Farm', lat: undefined, lng: undefined })
    render(
      <NearbyOperatorsModal
        {...defaultProps}
        currentOperation={noLocationOp}
        onClose={vi.fn()}
      />
    )
    expect(
      screen.getByText(/Current operation location not set/)
    ).toBeInTheDocument()
  })

  it('when no nearby operations with location, shows "No nearby operators"', () => {
    const opsNoLocation = [
      makeOperation({ id: 'no-loc-1', name: 'Op 1', lat: undefined, lng: undefined }),
    ]
    render(
      <NearbyOperatorsModal
        {...defaultProps}
        operations={opsNoLocation}
        onClose={vi.fn()}
      />
    )
    expect(
      screen.getByText(/No nearby operators with known locations/)
    ).toBeInTheDocument()
  })

  it('renders operations sorted by distance (near before far)', () => {
    render(<NearbyOperatorsModal {...defaultProps} onClose={vi.fn()} />)

    const nearText = screen.getByText('Near Farm')
    const farText = screen.getByText('Far Farm')

    const allButtons = screen.getAllByRole('button')
    const operationButtons = allButtons.filter(
      (btn) => btn.textContent?.includes('Farm') && !btn.textContent?.includes('Current')
    )

    const nearIndex = operationButtons.findIndex((btn) => btn.textContent?.includes('Near Farm'))
    const farIndex = operationButtons.findIndex((btn) => btn.textContent?.includes('Far Farm'))

    expect(nearText).toBeInTheDocument()
    expect(farText).toBeInTheDocument()
    expect(nearIndex).toBeLessThan(farIndex)
  })

  it('shows agency badge with correct name', () => {
    render(<NearbyOperatorsModal {...defaultProps} onClose={vi.fn()} />)
    const badges = screen.getAllByText('Organic Certifiers')
    expect(badges.length).toBeGreaterThanOrEqual(1)
  })

  it('close button calls onClose', () => {
    const onClose = vi.fn()
    render(<NearbyOperatorsModal {...defaultProps} onClose={onClose} />)
    const header = screen.getByText('Nearby Operators').closest('div[class*="flex justify-between"]')!
    const closeButton = header.querySelector('button')!
    fireEvent.click(closeButton)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
