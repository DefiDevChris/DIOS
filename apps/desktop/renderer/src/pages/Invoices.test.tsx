import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: { uid: 'test-uid', email: 'test@test.com' },
    googleAccessToken: 'token',
    loading: false,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    refreshGoogleToken: vi.fn(),
    isLocalUser: false,
  })),
}))

vi.mock('../hooks/useDatabase', () => ({
  useDatabase: vi.fn(() => ({
    findAll: vi.fn().mockResolvedValue([]),
    findById: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
  })),
}))

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  }
})

vi.mock('@dios/shared', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  googleApiJson: vi.fn(),
  googleApiFetch: vi.fn(),
  configStore: { getConfig: vi.fn(() => ({})), hasConfig: vi.fn(() => true) },
  OAUTH_SCOPES: [],
  InvoiceData: {},
}))

vi.mock('sweetalert2', () => ({
  default: { fire: vi.fn().mockResolvedValue({ isConfirmed: true }) },
}))

vi.mock('../utils/firestoreErrorHandler', () => ({
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
}))

vi.mock('../lib/pdfGenerator', () => ({
  generateInvoicePdf: vi.fn(),
}))

vi.mock('../lib/syncQueue', () => ({
  queueFile: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../contexts/BackgroundSyncContext', () => ({
  useBackgroundSync: vi.fn(() => ({
    triggerSync: vi.fn(),
  })),
}))

vi.mock('date-fns', async () => {
  const actual = await vi.importActual<typeof import('date-fns')>('date-fns')
  return {
    ...actual,
    format: actual.format,
  }
})

import Invoices from './Invoices'

describe('Invoices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the "Invoices" heading', () => {
    render(
      <MemoryRouter>
        <Invoices />
      </MemoryRouter>
    )
    expect(screen.getByText('Invoices')).toBeInTheDocument()
  })

  it('renders the subtitle text', () => {
    render(
      <MemoryRouter>
        <Invoices />
      </MemoryRouter>
    )
    expect(screen.getByText('Manage and track your generated invoices.')).toBeInTheDocument()
  })

  it('renders the status filter tabs', () => {
    render(
      <MemoryRouter>
        <Invoices />
      </MemoryRouter>
    )
    expect(screen.getByText('All')).toBeInTheDocument()
    expect(screen.getAllByText('Not Complete').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Sent')).toBeInTheDocument()
    expect(screen.getAllByText('Paid').length).toBeGreaterThanOrEqual(1)
  })

  it('renders the summary labels', () => {
    render(
      <MemoryRouter>
        <Invoices />
      </MemoryRouter>
    )
    expect(screen.getByText('Awaiting')).toBeInTheDocument()
  })

  it('renders the table headers', async () => {
    render(
      <MemoryRouter>
        <Invoices />
      </MemoryRouter>
    )
    expect(await screen.findByText('Date')).toBeInTheDocument()
    expect(screen.getByText('Operation / Agency')).toBeInTheDocument()
    expect(screen.getByText('Amount')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Actions')).toBeInTheDocument()
  })

  it('shows "No invoices found" when no data matches', async () => {
    render(
      <MemoryRouter>
        <Invoices />
      </MemoryRouter>
    )
    expect(await screen.findByText('No invoices found matching the filter.')).toBeInTheDocument()
  })

  it('renders the current year button in year selector', () => {
    render(
      <MemoryRouter>
        <Invoices />
      </MemoryRouter>
    )
    const currentYear = new Date().getFullYear()
    expect(screen.getByText(String(currentYear))).toBeInTheDocument()
  })
})
