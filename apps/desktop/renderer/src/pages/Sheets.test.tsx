import { render, screen } from '@testing-library/react'
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

vi.mock('../contexts/BackgroundSyncContext', () => ({
  useBackgroundSync: vi.fn(() => ({
    sheetQueueSize: 0,
    isOnline: true,
    triggerSync: vi.fn(),
  })),
}))

vi.mock('../hooks/useSheetsSync', () => ({
  useSheetsSync: vi.fn(() => ({
    syncInspection: vi.fn(),
    syncAllInspections: vi.fn(),
    isSyncing: false,
    lastSyncError: null,
    sheetUrl: null,
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
  configStore: { getConfig: vi.fn(() => ({ firebaseConfig: { apiKey: 'test-key' } })), hasConfig: vi.fn(() => true), saveConfig: vi.fn() },
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

import Sheets from './Sheets'
import { useAuth } from '../contexts/AuthContext'

describe('Sheets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the Google Sheets heading', () => {
    render(
      <MemoryRouter>
        <Sheets />
      </MemoryRouter>
    )
    expect(screen.getByText('Google Sheets')).toBeInTheDocument()
  })

  it('renders the subtitle text', () => {
    render(
      <MemoryRouter>
        <Sheets />
      </MemoryRouter>
    )
    expect(
      screen.getByText('Select, view, and export data to Google Sheets.')
    ).toBeInTheDocument()
  })

  it('renders the Open Existing Sheet section', () => {
    render(
      <MemoryRouter>
        <Sheets />
      </MemoryRouter>
    )
    expect(screen.getByText('Open Existing Sheet')).toBeInTheDocument()
  })

  it('renders the Select from Drive button', () => {
    render(
      <MemoryRouter>
        <Sheets />
      </MemoryRouter>
    )
    expect(screen.getByText('Select from Drive')).toBeInTheDocument()
  })

  it('renders the no sheet selected placeholder', () => {
    render(
      <MemoryRouter>
        <Sheets />
      </MemoryRouter>
    )
    expect(
      screen.getByText(/No sheet selected/)
    ).toBeInTheDocument()
  })

  it('renders the Export to New Sheet section', () => {
    render(
      <MemoryRouter>
        <Sheets />
      </MemoryRouter>
    )
    expect(screen.getByText('Export to New Sheet')).toBeInTheDocument()
  })

  it('renders all three export cards', () => {
    render(
      <MemoryRouter>
        <Sheets />
      </MemoryRouter>
    )
    expect(screen.getByText('Inspections')).toBeInTheDocument()
    expect(screen.getByText('Invoices')).toBeInTheDocument()
    expect(screen.getByText('Expenses')).toBeInTheDocument()
  })

  it('shows local mode warning when isLocalUser is true', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { uid: 'test-uid', email: 'test@test.com', displayName: 'Test User' },
      googleAccessToken: 'token',
      loading: false,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshGoogleToken: vi.fn(),
      isLocalUser: true,
    } as any)

    render(
      <MemoryRouter>
        <Sheets />
      </MemoryRouter>
    )
    expect(screen.getByText('Google Sheets requires cloud setup')).toBeInTheDocument()
  })
})
