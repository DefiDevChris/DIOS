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

vi.mock('../hooks/useDatabase', () => ({
  useDatabase: () => ({
    findAll: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({ id: 'test-id' }),
  }
})

vi.mock('@dios/shared', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  googleApiJson: vi.fn().mockResolvedValue({}),
  googleApiFetch: vi.fn().mockResolvedValue({ ok: true }),
  configStore: { getConfig: vi.fn(() => ({})), hasConfig: vi.fn(() => true), saveConfig: vi.fn(), clearConfig: vi.fn() },
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
}))

vi.mock('sweetalert2', () => ({
  default: { fire: vi.fn().mockResolvedValue({ isConfirmed: true }) },
}))

vi.mock('../utils/firestoreErrorHandler', () => ({
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', GET: 'GET', CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
}))

vi.mock('../lib/localFsSync', () => ({
  requestLocalFolder: vi.fn().mockResolvedValue(null),
  getStoredLocalFolder: vi.fn().mockResolvedValue(null),
}))

vi.mock('../components/BusinessProfileTab', () => ({
  default: () => <div data-testid="business-profile-tab">BusinessProfileTab</div>,
}))

vi.mock('../components/AgencySettingsTab', () => ({
  default: () => <div data-testid="agency-settings-tab">AgencySettingsTab</div>,
}))

import Settings from './Settings'

describe('Settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the Settings heading after loading', async () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument()
    })
  })

  it('renders the subtitle text after loading', async () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(
        screen.getByText('Manage your business profile, agencies, and integrations.')
      ).toBeInTheDocument()
    })
  })

  it('renders the My Business tab', async () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('My Business')).toBeInTheDocument()
    })
  })

  it('renders the + Add Agency tab', async () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('+ Add Agency')).toBeInTheDocument()
    })
  })

  it('renders the Data & Integrations tab', async () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Data & Integrations')).toBeInTheDocument()
    })
  })

  it('shows loading state initially', () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    )
    expect(screen.getByText('Loading settings...')).toBeInTheDocument()
  })

  it('renders the BusinessProfileTab by default', async () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('business-profile-tab')).toBeInTheDocument()
    })
  })
})
