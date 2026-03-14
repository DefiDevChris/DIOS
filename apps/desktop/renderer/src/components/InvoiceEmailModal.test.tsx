import { render, screen, fireEvent } from '@testing-library/react'
import type { Agency, Operation } from '@dios/shared'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'test-uid' }, googleAccessToken: 'test-token', loading: false }),
}))

vi.mock('@dios/shared', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('sweetalert2', () => ({
  default: { fire: vi.fn().mockResolvedValue({ isConfirmed: true }) },
}))

vi.mock('../utils/templateRenderer', () => ({
  renderTemplate: (template: string, vars: Record<string, string>) => {
    let result = template
    for (const [key, value] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
    }
    return result
  },
}))

import InvoiceEmailModal from './InvoiceEmailModal'

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

describe('InvoiceEmailModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    agency: mockAgency,
    operation: mockOperation,
    invoiceNumber: 'INV-TEST123',
    totalAmount: 285.5,
    inspectionDate: '2026-03-10T00:00:00.000Z',
    pdfBlob: new Blob(['fake-pdf-content'], { type: 'application/pdf' }),
    signatureHtml: '<b>Chris Inspector</b>',
    onSent: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when isOpen is false', () => {
    const { container } = render(<InvoiceEmailModal {...defaultProps} isOpen={false} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders "Send Invoice" heading when open', () => {
    render(<InvoiceEmailModal {...defaultProps} />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Send Invoice')
  })

  it('pre-fills To field with agency billingEmail', () => {
    render(<InvoiceEmailModal {...defaultProps} />)
    const toInput = screen.getByDisplayValue('billing@mcia.org')
    expect(toInput).toBeInTheDocument()
  })

  it('renders subject with template variables substituted', () => {
    render(<InvoiceEmailModal {...defaultProps} />)
    const subjectInput = screen.getByDisplayValue('Green Valley Farm Invoice')
    expect(subjectInput).toBeInTheDocument()
  })

  it('renders body textarea with template variables substituted', () => {
    render(<InvoiceEmailModal {...defaultProps} />)
    const textareas = document.querySelectorAll('textarea')
    expect(textareas.length).toBeGreaterThan(0)
    const bodyTextarea = textareas[0]
    expect(bodyTextarea.value).toContain('Bob Biller')
    expect(bodyTextarea.value).toContain('Green Valley Farm')
  })

  it('shows PDF attachment info with invoiceNumber and size', () => {
    render(<InvoiceEmailModal {...defaultProps} />)
    expect(screen.getByText('INV-TEST123.pdf')).toBeInTheDocument()
    const sizeKb = (defaultProps.pdfBlob.size / 1024).toFixed(1)
    expect(screen.getByText(`(${sizeKb} KB)`)).toBeInTheDocument()
  })

  it('Cancel button calls onClose', () => {
    render(<InvoiceEmailModal {...defaultProps} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('Send button disabled when no toEmail', () => {
    const agencyNoEmail: Agency = { ...mockAgency, billingEmail: '' }
    render(<InvoiceEmailModal {...defaultProps} agency={agencyNoEmail} />)
    const sendButtons = screen.getAllByText('Send Invoice')
    const button = sendButtons.find((el) => el.tagName === 'BUTTON' || el.closest('button'))
    const btn = button?.closest('button') ?? button
    expect(btn).toBeDisabled()
  })
})
