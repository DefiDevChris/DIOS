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
}))

vi.mock('sweetalert2', () => ({
  default: { fire: vi.fn().mockResolvedValue({ isConfirmed: true }) },
}))

// Mock fetch globally for Drive API calls
const fetchMock = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ files: [] }),
})
vi.stubGlobal('fetch', fetchMock)

import Drive from './Drive'
import { useAuth } from '../contexts/AuthContext'

describe('Drive', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset localStorage mock
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null)
  })

  it('renders the Google Drive heading', () => {
    render(
      <MemoryRouter>
        <Drive />
      </MemoryRouter>
    )
    expect(screen.getByText('Google Drive')).toBeInTheDocument()
  })

  it('renders the subtitle text', () => {
    render(
      <MemoryRouter>
        <Drive />
      </MemoryRouter>
    )
    expect(
      screen.getByText('Browse your DIOS Master Inspections Database.')
    ).toBeInTheDocument()
  })

  it('renders the Connect to Google Drive placeholder when not initialized', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { uid: 'test-uid', email: 'test@test.com', displayName: 'Test User' },
      googleAccessToken: null,
      loading: false,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshGoogleToken: vi.fn(),
      isLocalUser: false,
    } as any)

    render(
      <MemoryRouter>
        <Drive />
      </MemoryRouter>
    )
    expect(screen.getByText('Connect to Google Drive')).toBeInTheDocument()
  })

  it('renders the Load Drive Files button', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { uid: 'test-uid', email: 'test@test.com', displayName: 'Test User' },
      googleAccessToken: null,
      loading: false,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshGoogleToken: vi.fn(),
      isLocalUser: false,
    } as any)

    render(
      <MemoryRouter>
        <Drive />
      </MemoryRouter>
    )
    const buttons = screen.getAllByText('Load Drive Files')
    expect(buttons.length).toBeGreaterThan(0)
  })

  it('shows local mode warning when isLocalUser is true', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { uid: 'test-uid', email: 'test@test.com', displayName: 'Test User' },
      googleAccessToken: null,
      loading: false,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshGoogleToken: vi.fn(),
      isLocalUser: true,
    } as any)

    render(
      <MemoryRouter>
        <Drive />
      </MemoryRouter>
    )
    expect(screen.getByText('Google Drive requires cloud setup')).toBeInTheDocument()
  })
})
