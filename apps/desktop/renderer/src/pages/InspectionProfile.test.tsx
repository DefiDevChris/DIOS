import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: { uid: 'test-uid', email: 'test@test.com', displayName: 'Test User' },
    googleAccessToken: 'token',
    loading: false,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    refreshGoogleToken: vi.fn(),
    isLocalUser: false,
  })),
}))

const mockFindById = vi.fn().mockResolvedValue({
  id: 'test-id',
  date: '2026-01-15T00:00:00.000Z',
  status: 'Scheduled',
  operationId: 'op-1',
  notes: '',
  scope: '',
  reportNotes: '',
  baseHoursLog: 0,
  additionalHoursLog: 0,
  milesDriven: 0,
  linkedExpenses: [],
})

const mockFindOperationById = vi.fn().mockResolvedValue({
  id: 'op-1',
  name: 'Test Farm',
  agencyId: 'agency-1',
  address: '123 Farm Rd',
})

const mockFindAgencyById = vi.fn().mockResolvedValue({
  id: 'agency-1',
  name: 'Test Agency',
  flatRateBaseAmount: 500,
  flatRateIncludedHours: 8,
  hourlyRate: 50,
  additionalHourlyRate: 50,
  driveTimeHourlyRate: 40,
  mileageRate: 0.655,
  perDiemRate: 75,
  mileageReimbursed: false,
  billingAddress: '',
})

vi.mock('../hooks/useDatabase', () => ({
  useDatabase: (opts: { table: string }) => {
    if (opts.table === 'inspections') {
      return {
        findById: mockFindById,
        findAll: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      }
    }
    if (opts.table === 'operations') {
      return {
        findById: mockFindOperationById,
        findAll: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      }
    }
    if (opts.table === 'agencies') {
      return {
        findById: mockFindAgencyById,
        findAll: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      }
    }
    return {
      findAll: vi.fn().mockResolvedValue([]),
      findById: vi.fn().mockResolvedValue(undefined),
      save: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    }
  },
}))

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({ id: 'test-id' }),
    Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
  }
})

vi.mock('@dios/shared', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  googleApiJson: vi.fn().mockResolvedValue({}),
  googleApiFetch: vi.fn().mockResolvedValue({ ok: true }),
  configStore: { getConfig: vi.fn(() => ({})), hasConfig: vi.fn(() => true), saveConfig: vi.fn() },
  registerTokenRefresher: vi.fn(),
  OAUTH_SCOPES: [],
}))

vi.mock('@dios/shared/firebase', () => ({
  db: {},
  storage: {},
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false, data: () => ({}) }),
  setDoc: vi.fn(),
  collection: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
  serverTimestamp: vi.fn(() => new Date().toISOString()),
}))

vi.mock('sweetalert2', () => ({
  default: { fire: vi.fn().mockResolvedValue({ isConfirmed: true }) },
}))

vi.mock('../utils/firestoreErrorHandler', () => ({
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', GET: 'GET', CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
}))

vi.mock('../utils/invoiceNumbering', () => ({
  getNextInvoiceNumber: vi.fn(() => 'INV-2026-001'),
}))

vi.mock('../lib/pdfGenerator', () => ({
  generateInvoicePdf: vi.fn(() => new Blob(['fake-pdf'])),
}))

vi.mock('../lib/syncQueue', () => ({
  queueFile: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../contexts/BackgroundSyncContext', () => ({
  useBackgroundSync: () => ({ triggerSync: vi.fn() }),
}))

vi.mock('../components/TasksWidget', () => ({
  default: () => <div data-testid="tasks-widget">TasksWidget</div>,
}))

import InspectionProfile from './InspectionProfile'

describe('InspectionProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading state initially', () => {
    render(
      <MemoryRouter>
        <InspectionProfile />
      </MemoryRouter>
    )
    expect(screen.getByText('Loading inspection details...')).toBeInTheDocument()
  })

  it('renders the inspection heading after data loads', async () => {
    render(
      <MemoryRouter>
        <InspectionProfile />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/Inspection:/)).toBeInTheDocument()
    })
  })

  it('renders the Back to Operation link after data loads', async () => {
    render(
      <MemoryRouter>
        <InspectionProfile />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Back to Operation')).toBeInTheDocument()
    })
  })

  it('renders the Save Changes button after data loads', async () => {
    render(
      <MemoryRouter>
        <InspectionProfile />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Save Changes')).toBeInTheDocument()
    })
  })

  it('renders the Inspection Details section after data loads', async () => {
    render(
      <MemoryRouter>
        <InspectionProfile />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Inspection Details')).toBeInTheDocument()
    })
  })

  it('renders the Inspection Notes section after data loads', async () => {
    render(
      <MemoryRouter>
        <InspectionProfile />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Inspection Notes')).toBeInTheDocument()
    })
  })

  it('renders the Invoice Estimate section after data loads', async () => {
    render(
      <MemoryRouter>
        <InspectionProfile />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Invoice Estimate')).toBeInTheDocument()
    })
  })

  it('renders the TasksWidget after data loads', async () => {
    render(
      <MemoryRouter>
        <InspectionProfile />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('tasks-widget')).toBeInTheDocument()
    })
  })

  it('renders the operation name after data loads', async () => {
    render(
      <MemoryRouter>
        <InspectionProfile />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Test Farm')).toBeInTheDocument()
    })
  })
})
