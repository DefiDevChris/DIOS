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

const mockFindOperationById = vi.fn().mockResolvedValue({
  id: 'test-id',
  name: 'Green Valley Farm',
  address: '456 Valley Rd',
  city: 'Springfield',
  state: 'IL',
  zip: '62704',
  agencyId: 'agency-1',
  status: 'active',
  phone: '555-0100',
  email: 'farm@example.com',
  lat: 40.0,
  lng: -90.0,
  stickyNote: '',
})

vi.mock('../hooks/useDatabase', () => ({
  useDatabase: (opts: { table: string }) => {
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
        findAll: vi.fn().mockResolvedValue([{
          id: 'agency-1',
          name: 'Test Agency',
          flatRateBaseAmount: 500,
          flatRateIncludedHours: 8,
          hourlyRate: 50,
          mileageRate: 0.655,
          mileageReimbursed: false,
          billingAddress: '',
        }]),
        findById: vi.fn().mockResolvedValue(undefined),
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
  getDocs: vi.fn().mockResolvedValue({ docs: [], forEach: vi.fn() }),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
}))

vi.mock('sweetalert2', () => ({
  default: { fire: vi.fn().mockResolvedValue({ isConfirmed: true }) },
}))

vi.mock('../utils/firestoreErrorHandler', () => ({
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', GET: 'GET', CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
}))

vi.mock('../lib/driveSync', () => ({
  uploadToDrive: vi.fn().mockResolvedValue(undefined),
  getOperationDriveFolderUrl: vi.fn().mockResolvedValue(null),
}))

vi.mock('../lib/localFsSync', () => ({
  getStoredLocalFolder: vi.fn().mockResolvedValue(null),
  writeLocalFile: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../utils/distanceUtils', () => ({
  calculateDistance: vi.fn().mockReturnValue(0),
  formatDistance: vi.fn().mockReturnValue('0 mi'),
  formatDriveTime: vi.fn().mockReturnValue('0 min'),
}))

vi.mock('../components/TasksWidget', () => ({
  default: () => <div data-testid="tasks-widget">TasksWidget</div>,
}))

vi.mock('../components/InspectionProgressBar', () => ({
  default: () => <div data-testid="inspection-progress-bar">InspectionProgressBar</div>,
}))

vi.mock('../components/StepModal', () => ({
  default: () => null,
}))

vi.mock('../components/StickyNote', () => ({
  default: ({ value }: { value: string }) => <div data-testid="sticky-note">{value}</div>,
}))

vi.mock('../components/UnifiedActivityFeed', () => ({
  default: () => <div data-testid="activity-feed">UnifiedActivityFeed</div>,
}))

vi.mock('../components/NearbyOperatorsModal', () => ({
  default: () => null,
}))

import OperationProfile from './OperationProfile'

describe('OperationProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading state initially', () => {
    render(
      <MemoryRouter>
        <OperationProfile />
      </MemoryRouter>
    )
    expect(screen.getByText('Loading operation details...')).toBeInTheDocument()
  })

  it('renders the operation name after data loads', async () => {
    render(
      <MemoryRouter>
        <OperationProfile />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Green Valley Farm')).toBeInTheDocument()
    })
  })

  it('renders the Back to Directory link after data loads', async () => {
    render(
      <MemoryRouter>
        <OperationProfile />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Back to Directory')).toBeInTheDocument()
    })
  })

  it('renders navigation tabs after data loads', async () => {
    render(
      <MemoryRouter>
        <OperationProfile />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('overview')).toBeInTheDocument()
      expect(screen.getByText('inspections')).toBeInTheDocument()
      expect(screen.getByText('documents')).toBeInTheDocument()
      expect(screen.getByText('activity')).toBeInTheDocument()
    })
  })

  it('renders the agency name after data loads', async () => {
    render(
      <MemoryRouter>
        <OperationProfile />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Test Agency')).toBeInTheDocument()
    })
  })
})
