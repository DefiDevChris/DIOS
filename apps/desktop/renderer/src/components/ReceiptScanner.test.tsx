import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

const mockSaveExpense = vi.fn()
const mockTriggerSync = vi.fn()

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'test-uid' }, googleAccessToken: 'test-token', loading: false }),
}))

vi.mock('../hooks/useDatabase', () => ({
  useDatabase: () => ({ save: mockSaveExpense }),
}))

vi.mock('../contexts/BackgroundSyncContext', () => ({
  useBackgroundSync: () => ({ triggerSync: mockTriggerSync }),
}))

vi.mock('@dios/shared', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() },
}))

vi.mock('sweetalert2', () => ({
  default: { fire: vi.fn().mockResolvedValue({ isConfirmed: true }) },
}))

vi.mock('tesseract.js', () => ({
  createWorker: vi.fn().mockResolvedValue({
    recognize: vi.fn().mockResolvedValue({
      data: {
        text: 'Home Depot\n03/15/2026\nTotal $42.50',
        words: [],
      },
    }),
    terminate: vi.fn(),
  }),
}))

vi.mock('../lib/syncQueue', () => ({
  queueFile: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('lucide-react', () => ({
  Camera: (props: any) => <svg data-testid="camera-icon" {...props} />,
  RefreshCw: (props: any) => <svg data-testid="refresh-icon" {...props} />,
  Upload: (props: any) => <svg data-testid="upload-icon" {...props} />,
  X: (props: any) => <svg data-testid="x-icon" {...props} />,
  CheckCircle: (props: any) => <svg data-testid="check-circle" {...props} />,
  ScanLine: (props: any) => <svg data-testid="scan-icon" {...props} />,
  PenLine: (props: any) => <svg data-testid="pen-icon" {...props} />,
}))

import ReceiptScanner, { parseOcrText } from './ReceiptScanner'

describe('parseOcrText', () => {
  it('extracts vendor from first non-numeric line', () => {
    const result = parseOcrText('Home Depot\n123 Main St\nTotal $42.50')
    expect(result.vendor).toBe('Home Depot')
  })

  it('extracts date in MM/DD/YYYY format', () => {
    const result = parseOcrText('Store\n03/15/2026\nTotal $10.00')
    expect(result.date).toBe('2026-03-15')
  })

  it('extracts date in YYYY-MM-DD format', () => {
    const result = parseOcrText('Store\n2026-03-15\nTotal $10.00')
    expect(result.date).toBe('2026-03-15')
  })

  it('extracts date in long month format', () => {
    const result = parseOcrText('Store\nMarch 15, 2026\nTotal $10.00')
    expect(result.date).toBe('2026-03-15')
  })

  it('extracts amount from total line', () => {
    const result = parseOcrText('Store\nTotal: $42.50')
    expect(result.amount).toBe('42.50')
  })

  it('extracts amount from grand total line', () => {
    const result = parseOcrText('Store\nGrand Total $123.45')
    expect(result.amount).toBe('123.45')
  })

  it('extracts largest dollar amount when no total label exists', () => {
    const result = parseOcrText('Store\n$10.50\n$25.99\n$5.00')
    expect(result.amount).toBe('25.99')
  })

  it('handles commas in amounts', () => {
    const result = parseOcrText('Store\nTotal: $1,234.56')
    expect(result.amount).toBe('1234.56')
  })

  it('returns undefined for missing fields', () => {
    const result = parseOcrText('Just some text')
    expect(result.date).toBeUndefined()
    expect(result.amount).toBeUndefined()
  })

  it('extracts date with dot separators', () => {
    const result = parseOcrText('Store\n03.15.2026')
    expect(result.date).toBe('2026-03-15')
  })

  it('extracts date with dash separators', () => {
    const result = parseOcrText('Store\n03-15-2026')
    expect(result.date).toBe('2026-03-15')
  })

  it('pads single-digit month and day', () => {
    const result = parseOcrText('Store\n3/5/2026')
    expect(result.date).toBe('2026-03-05')
  })

  it('handles "amount due" label', () => {
    const result = parseOcrText('Store\nAmount Due $99.99')
    expect(result.amount).toBe('99.99')
  })

  it('handles "balance due" label', () => {
    const result = parseOcrText('Store\nBalance Due: $75.00')
    expect(result.amount).toBe('75.00')
  })

  it('extracts abbreviated month names', () => {
    const result = parseOcrText('Store\nJan 5, 2026')
    expect(result.date).toBe('2026-01-05')
  })
})

describe('ReceiptScanner component', () => {
  const defaultProps = {
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockSaveExpense.mockResolvedValue(undefined)
  })

  it('renders header with "Capture Receipt" in camera mode', () => {
    render(<ReceiptScanner {...defaultProps} />)
    expect(screen.getByText('Capture Receipt')).toBeInTheDocument()
  })

  it('renders header with "Add Manually" in manual mode', () => {
    render(<ReceiptScanner {...defaultProps} mode="manual" />)
    expect(screen.getByText('Add Manually')).toBeInTheDocument()
  })

  it('renders header with "Upload from Computer" in local-upload mode', () => {
    render(<ReceiptScanner {...defaultProps} mode="local-upload" />)
    expect(screen.getByText('Upload from Computer')).toBeInTheDocument()
  })

  it('renders form fields', () => {
    render(<ReceiptScanner {...defaultProps} mode="manual" />)
    expect(screen.getByText('Date')).toBeInTheDocument()
    expect(screen.getByText('Vendor / Payee')).toBeInTheDocument()
    expect(screen.getByText('Amount ($)')).toBeInTheDocument()
    expect(screen.getByText('Notes (Optional)')).toBeInTheDocument()
  })

  it('renders cancel and save buttons', () => {
    render(<ReceiptScanner {...defaultProps} mode="manual" />)
    expect(screen.getByText('Cancel')).toBeInTheDocument()
    expect(screen.getByText('Save Receipt')).toBeInTheDocument()
  })

  it('calls onClose when Cancel is clicked', () => {
    render(<ReceiptScanner {...defaultProps} mode="manual" />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when X button is clicked', () => {
    render(<ReceiptScanner {...defaultProps} />)
    const closeBtn = screen.getByTestId('x-icon').closest('button')!
    fireEvent.click(closeBtn)
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('does not render camera panel in manual mode', () => {
    render(<ReceiptScanner {...defaultProps} mode="manual" />)
    expect(screen.queryByText('Take a photo of the receipt')).not.toBeInTheDocument()
    expect(screen.queryByText('Open Camera')).not.toBeInTheDocument()
  })

  it('renders camera panel in camera mode', () => {
    render(<ReceiptScanner {...defaultProps} mode="camera" />)
    expect(screen.getByText('Take a photo of the receipt')).toBeInTheDocument()
    expect(screen.getByText('Open Camera')).toBeInTheDocument()
  })

  it('renders file browse button in local-upload mode', () => {
    render(<ReceiptScanner {...defaultProps} mode="local-upload" />)
    expect(screen.getByText('Browse Files')).toBeInTheDocument()
    expect(screen.getByText('Select a receipt file')).toBeInTheDocument()
  })

  it('updates vendor field on change', () => {
    render(<ReceiptScanner {...defaultProps} mode="manual" />)
    const vendorInput = screen.getByPlaceholderText('e.g., Home Depot')
    fireEvent.change(vendorInput, { target: { value: 'Test Vendor' } })
    expect(vendorInput).toHaveValue('Test Vendor')
  })

  it('updates amount field on change', () => {
    render(<ReceiptScanner {...defaultProps} mode="manual" />)
    const amountInput = screen.getByPlaceholderText('0.00')
    fireEvent.change(amountInput, { target: { value: '99.99' } })
    expect(amountInput).toHaveValue(99.99)
  })

  it('updates notes field on change', () => {
    render(<ReceiptScanner {...defaultProps} mode="manual" />)
    const notesInput = screen.getByPlaceholderText('What was this for?')
    fireEvent.change(notesInput, { target: { value: 'Soil amendments' } })
    expect(notesInput).toHaveValue('Soil amendments')
  })

  it('disables save button in manual mode when vendor and amount are empty', () => {
    render(<ReceiptScanner {...defaultProps} mode="manual" />)
    const saveBtn = screen.getByText('Save Receipt').closest('button')!
    expect(saveBtn).toBeDisabled()
  })
})
