import { render, screen, fireEvent } from '@testing-library/react'
import type { Agency, Inspection, Operation } from '@dios/shared'

vi.mock('../utils/invoiceCalculator', () => ({
  calculateInvoiceLineItems: vi.fn(() => ({
    lineItems: [
      { name: 'Inspection Fee', amount: 250, details: 'Flat rate' },
      { name: 'Mileage', amount: 35.5, details: '50 mi @ $0.71/mi' },
    ],
    total: 285.5,
  })),
}))

vi.mock('../lib/pdfGenerator', () => ({
  generateInvoicePdf: vi.fn(() => new Blob(['pdf'], { type: 'application/pdf' })),
}))

vi.mock('jspdf', () => ({
  jsPDF: vi.fn().mockImplementation(() => ({
    setFontSize: vi.fn(),
    setTextColor: vi.fn(),
    text: vi.fn(),
    setFont: vi.fn(),
    splitTextToSize: vi.fn(() => ['line1']),
    setFillColor: vi.fn(),
    rect: vi.fn(),
    setDrawColor: vi.fn(),
    line: vi.fn(),
    addPage: vi.fn(),
    output: vi.fn(() => new Blob(['pdf'])),
  })),
}))

import InvoiceEditor from './InvoiceEditor'

const mockInspection: Inspection = {
  id: 'insp-1',
  operationId: 'op-1',
  date: '2026-03-10T00:00:00.000Z',
  status: 'Invoiced',
  prepHours: 1,
  onsiteHours: 4,
  reportHours: 2,
  baseHoursLog: 7,
  additionalHoursLog: 0,
  milesDriven: 50,
  calculatedMileage: 50,
  calculatedDriveTime: 60,
  prepChecklistData: '[]',
  reportChecklistData: '[]',
  invoiceNotes: '',
  updatedAt: '2026-03-10T00:00:00.000Z',
  syncStatus: 'synced',
}

const mockOperation: Operation = {
  id: 'op-1',
  name: 'Green Valley Farm',
  agencyId: 'ag-1',
  address: '456 Farm Rd, Springfield, IL 62704',
  contactName: 'Jane Farmer',
  phone: '555-9876',
  email: 'jane@greenvalley.com',
  status: 'active',
  operationType: 'crop',
  clientId: 'client-1',
  updatedAt: '2026-03-10T00:00:00.000Z',
  syncStatus: 'synced',
}

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
  emailTemplateBody: '',
  prepChecklistEnabled: true,
  prepChecklistItems: '["Prep complete"]',
  reportChecklistEnabled: true,
  reportChecklistItems: '["Report complete"]',
  defaultLineItems: '[]',
  updatedAt: '2026-03-10T00:00:00.000Z',
  syncStatus: 'synced',
}

const mockBusinessProfile = {
  businessName: 'Test Inspections LLC',
  ownerName: 'Chris Inspector',
  businessAddress: '123 Main St, Springfield, IL',
  businessPhone: '555-1234',
  businessEmail: 'chris@test.com',
}

describe('InvoiceEditor', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    inspection: mockInspection,
    operation: mockOperation,
    agency: mockAgency,
    businessProfile: mockBusinessProfile,
    onSave: vi.fn(),
    onEmail: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when isOpen is false', () => {
    const { container } = render(<InvoiceEditor {...defaultProps} isOpen={false} />)
    expect(container.innerHTML).toBe('')
  })

  it('shows "Invoice Preview" title when open', () => {
    render(<InvoiceEditor {...defaultProps} />)
    expect(screen.getByText('Invoice Preview')).toBeInTheDocument()
  })

  it('renders Bill To with agency name', () => {
    render(<InvoiceEditor {...defaultProps} />)
    expect(screen.getByText('Bill To')).toBeInTheDocument()
    expect(screen.getByText('Midwest Certification')).toBeInTheDocument()
  })

  it('renders Service For with operation name', () => {
    render(<InvoiceEditor {...defaultProps} />)
    expect(screen.getByText('Service For')).toBeInTheDocument()
    expect(screen.getByText('Green Valley Farm')).toBeInTheDocument()
  })

  it('renders line items table with headers', () => {
    render(<InvoiceEditor {...defaultProps} />)
    expect(screen.getByText('Item')).toBeInTheDocument()
    expect(screen.getByText('Details')).toBeInTheDocument()
    expect(screen.getByText('Amount')).toBeInTheDocument()
  })

  it('Save Draft button calls onSave', () => {
    render(<InvoiceEditor {...defaultProps} />)
    fireEvent.click(screen.getByText('Save Draft'))
    expect(defaultProps.onSave).toHaveBeenCalledTimes(1)
    expect(defaultProps.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        lineItems: expect.any(Array),
        total: expect.any(Number),
        notes: expect.any(String),
      })
    )
  })

  it('Add Line Item button adds a row', () => {
    render(<InvoiceEditor {...defaultProps} />)
    const rows = document.querySelectorAll('tbody tr')
    const initialCount = rows.length

    fireEvent.click(screen.getByText('Add Line Item'))

    const updatedRows = document.querySelectorAll('tbody tr')
    expect(updatedRows.length).toBe(initialCount + 1)
  })

  it('shows total amount', () => {
    render(<InvoiceEditor {...defaultProps} />)
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getByText('$285.50')).toBeInTheDocument()
  })
})
