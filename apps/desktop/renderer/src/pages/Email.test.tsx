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

vi.mock('dompurify', () => ({
  default: { sanitize: vi.fn((s: string) => s) },
}))

import Email from './Email'
import { useAuth } from '../contexts/AuthContext'

describe('Email', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the Client Communications heading', () => {
    render(
      <MemoryRouter>
        <Email />
      </MemoryRouter>
    )
    expect(screen.getByText('Client Communications')).toBeInTheDocument()
  })

  it('renders the Compose button', () => {
    render(
      <MemoryRouter>
        <Email />
      </MemoryRouter>
    )
    expect(screen.getByText('Compose')).toBeInTheDocument()
  })

  it('renders the search input', () => {
    render(
      <MemoryRouter>
        <Email />
      </MemoryRouter>
    )
    expect(screen.getByPlaceholderText('Search emails...')).toBeInTheDocument()
  })

  it('renders the subtitle text', () => {
    render(
      <MemoryRouter>
        <Email />
      </MemoryRouter>
    )
    expect(
      screen.getByText('Recent emails with your operations, agencies, and whitelisted contacts.')
    ).toBeInTheDocument()
  })

  it('shows the empty thread placeholder', () => {
    render(
      <MemoryRouter>
        <Email />
      </MemoryRouter>
    )
    expect(screen.getByText('Select a thread to view the conversation')).toBeInTheDocument()
  })

  it('shows Connect Gmail state when no googleAccessToken', () => {
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
        <Email />
      </MemoryRouter>
    )
    expect(screen.getByText('Connect Gmail')).toBeInTheDocument()
    expect(screen.getByText('Refresh App')).toBeInTheDocument()
  })
})
