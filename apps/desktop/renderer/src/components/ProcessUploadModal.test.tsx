import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

const mockSaveExpense = vi.fn()
const mockRemoveUpload = vi.fn()
const mockTriggerSync = vi.fn()

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'test-uid' }, googleAccessToken: 'test-token', loading: false }),
}))

vi.mock('../hooks/useDatabase', () => ({
  useDatabase: ({ table }: { table: string }) => {
    if (table === 'expenses') return { save: mockSaveExpense }
    if (table === 'unassigned_uploads') return { remove: mockRemoveUpload }
    return { save: vi.fn(), remove: vi.fn() }
  },
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
  createWorker: vi.fn(),
}))

vi.mock('../lib/syncQueue', () => ({
  queueFile: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./ReceiptScanner', () => ({
  parseOcrText: vi.fn().mockReturnValue({ vendor: 'Test Store', amount: '42.50', date: '2026-03-15' }),
}))

vi.mock('lucide-react', () => ({
  X: (props: any) => <svg data-testid="x-icon" {...props} />,
  ScanLine: (props: any) => <svg data-testid="scan-icon" {...props} />,
  ChevronDown: (props: any) => <svg data-testid="chevron-down" {...props} />,
  CheckCircle: (props: any) => <svg data-testid="check-circle" {...props} />,
  Upload: (props: any) => <svg data-testid="upload-icon" {...props} />,
  Loader2: (props: any) => <svg data-testid="loader-icon" {...props} />,
  Check: (props: any) => <svg data-testid="check-icon" {...props} />,
}))

import ProcessUploadModal from './ProcessUploadModal'

const baseUpload = {
  id: 'upload-1',
  fileName: 'receipt.jpg',
  fileType: 'image/jpeg',
  uploadedAt: '2026-03-10T00:00:00Z',
  downloadURL: 'https://example.com/receipt.jpg',
  storagePath: '/uploads/receipt.jpg',
  fileSize: 1024,
  syncStatus: 'synced' as const,
}

const operations = [
  { id: 'op-1', name: 'Green Farm' },
  { id: 'op-2', name: 'Blue Orchards' },
]

describe('ProcessUploadModal', () => {
  const defaultProps = {
    upload: baseUpload,
    operations,
    onClose: vi.fn(),
    onProcessed: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockSaveExpense.mockResolvedValue(undefined)
    mockRemoveUpload.mockResolvedValue(undefined)
    // Mock fetch for blob downloads
    global.fetch = vi.fn().mockResolvedValue({
      blob: () => Promise.resolve(new Blob(['test'], { type: 'image/jpeg' })),
    }) as any
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the modal with header', () => {
    render(<ProcessUploadModal {...defaultProps} />)
    expect(screen.getByText('Process Upload')).toBeInTheDocument()
  })

  it('renders file name in assign phase', () => {
    render(<ProcessUploadModal {...defaultProps} />)
    expect(screen.getByText('receipt.jpg')).toBeInTheDocument()
  })

  it('renders image preview for image uploads', () => {
    render(<ProcessUploadModal {...defaultProps} />)
    const img = screen.getByAltText('receipt.jpg')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', 'https://example.com/receipt.jpg')
  })

  it('does not render image preview for non-image uploads', () => {
    const pdfUpload = { ...baseUpload, fileType: 'application/pdf' }
    render(<ProcessUploadModal {...defaultProps} upload={pdfUpload} />)
    expect(screen.queryByAltText('receipt.jpg')).not.toBeInTheDocument()
  })

  it('renders operation picker with all operations', () => {
    render(<ProcessUploadModal {...defaultProps} />)
    expect(screen.getByText('No operation (unassigned)')).toBeInTheDocument()
    expect(screen.getByText('Green Farm')).toBeInTheDocument()
    expect(screen.getByText('Blue Orchards')).toBeInTheDocument()
  })

  it('shows receipt checkbox for image uploads', () => {
    render(<ProcessUploadModal {...defaultProps} />)
    expect(screen.getByText('Is this a receipt?')).toBeInTheDocument()
  })

  it('hides receipt checkbox for non-image uploads', () => {
    const pdfUpload = { ...baseUpload, fileType: 'application/pdf' }
    render(<ProcessUploadModal {...defaultProps} upload={pdfUpload} />)
    expect(screen.queryByText('Is this a receipt?')).not.toBeInTheDocument()
  })

  it('renders "Process File" button by default', () => {
    render(<ProcessUploadModal {...defaultProps} />)
    expect(screen.getByText('Process File')).toBeInTheDocument()
  })

  it('renders "Scan Receipt" button when receipt checkbox is checked', () => {
    render(<ProcessUploadModal {...defaultProps} />)

    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)

    expect(screen.getByText('Scan Receipt')).toBeInTheDocument()
  })

  it('calls onClose when Cancel button is clicked', () => {
    render(<ProcessUploadModal {...defaultProps} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when X button is clicked', () => {
    render(<ProcessUploadModal {...defaultProps} />)
    const closeButton = screen.getByTestId('x-icon').closest('button')!
    fireEvent.click(closeButton)
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('processes non-receipt file and calls onProcessed', async () => {
    render(<ProcessUploadModal {...defaultProps} />)

    await act(async () => {
      fireEvent.click(screen.getByText('Process File'))
    })

    await waitFor(() => {
      expect(screen.getByText('Processed Successfully')).toBeInTheDocument()
    })

    expect(mockRemoveUpload).toHaveBeenCalledWith('upload-1')
    expect(mockTriggerSync).toHaveBeenCalled()
  })

  it('allows selecting an operation', () => {
    render(<ProcessUploadModal {...defaultProps} />)

    const select = screen.getByDisplayValue('No operation (unassigned)') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'op-1' } })

    expect(select.value).toBe('op-1')
  })
})
