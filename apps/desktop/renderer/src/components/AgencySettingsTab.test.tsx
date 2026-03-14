import { render, screen, fireEvent } from '@testing-library/react'
import type { Agency } from '@dios/shared'

vi.mock('sweetalert2', () => ({
  default: { fire: vi.fn().mockResolvedValue({ isConfirmed: true }) },
}))

vi.mock('./RateConfigSection', () => ({
  default: () => <div data-testid="rate-config-section">RateConfigSection</div>,
}))

vi.mock('./ChecklistEditor', () => ({
  default: ({ title }: { title: string }) => <div data-testid="checklist-editor">{title}</div>,
}))

import AgencySettingsTab from './AgencySettingsTab'

const mockAgency: Agency = {
  id: 'ag-1',
  name: 'Midwest Certification',
  billingAddress: '789 Certification Way\nChicago, IL 60601',
  isFlatRate: true,
  flatRateAmount: 250,
  flatRateIncludedHours: 8,
  flatRateOverageRate: 35,
  hourlyRate: 40,
  driveTimeHourlyRate: 30,
  mileageReimbursed: true,
  mileageRate: 0.71,
  perDiemRate: 50,
  perTypeRatesEnabled: false,
  ratesByType: '{}',
  operationTypes: '["crop","handler"]',
  billingEmail: 'billing@mcia.org',
  billingContactName: 'Bob Biller',
  emailTemplateSubject: '{operatorName} Invoice',
  emailTemplateBody: 'Dear {agencyContact}...',
  prepChecklistEnabled: true,
  prepChecklistItems: '["Prep complete"]',
  reportChecklistEnabled: true,
  reportChecklistItems: '["Report complete"]',
  defaultLineItems: '[]',
  updatedAt: '2026-03-10T00:00:00.000Z',
  syncStatus: 'synced',
}

describe('AgencySettingsTab', () => {
  const defaultProps = {
    agency: mockAgency,
    onSave: vi.fn(),
    onDelete: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders "Agency Information" heading', () => {
    render(<AgencySettingsTab {...defaultProps} />)
    expect(screen.getByText('Agency Information')).toBeInTheDocument()
  })

  it('renders agency name input with value', () => {
    render(<AgencySettingsTab {...defaultProps} />)
    const nameInput = screen.getByDisplayValue('Midwest Certification')
    expect(nameInput).toBeInTheDocument()
  })

  it('renders "Billing Rates" heading', () => {
    render(<AgencySettingsTab {...defaultProps} />)
    expect(screen.getByText('Billing Rates')).toBeInTheDocument()
  })

  it('renders "Save Changes" button', () => {
    render(<AgencySettingsTab {...defaultProps} />)
    expect(screen.getByText('Save Changes')).toBeInTheDocument()
  })

  it('clicking Save Changes calls onSave', () => {
    render(<AgencySettingsTab {...defaultProps} />)
    fireEvent.click(screen.getByText('Save Changes'))
    expect(defaultProps.onSave).toHaveBeenCalledTimes(1)
    expect(defaultProps.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'ag-1',
        name: 'Midwest Certification',
        updatedAt: expect.any(String),
      })
    )
  })

  it('shows "Danger Zone" when not isNew', () => {
    render(<AgencySettingsTab {...defaultProps} />)
    expect(screen.getByText('Danger Zone')).toBeInTheDocument()
  })

  it('hides "Danger Zone" when isNew', () => {
    render(<AgencySettingsTab {...defaultProps} isNew />)
    expect(screen.queryByText('Danger Zone')).not.toBeInTheDocument()
  })

  it('renders "Billing Contact" section', () => {
    render(<AgencySettingsTab {...defaultProps} />)
    expect(screen.getByText('Billing Contact')).toBeInTheDocument()
  })

  it('renders "Email Template" section', () => {
    render(<AgencySettingsTab {...defaultProps} />)
    expect(screen.getByText('Email Template')).toBeInTheDocument()
  })
})
