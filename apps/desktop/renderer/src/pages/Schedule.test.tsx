import { render, screen, waitFor } from '@testing-library/react'
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
}))

vi.mock('sweetalert2', () => ({
  default: { fire: vi.fn().mockResolvedValue({ isConfirmed: true }) },
}))

vi.mock('../utils/firestoreErrorHandler', () => ({
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
}))

vi.mock('date-fns', async () => {
  const actual = await vi.importActual<typeof import('date-fns')>('date-fns')
  return {
    ...actual,
    format: actual.format,
    addDays: actual.addDays,
  }
})

import Schedule from './Schedule'

describe('Schedule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the "Schedule" heading', async () => {
    render(
      <MemoryRouter>
        <Schedule />
      </MemoryRouter>
    )
    expect(screen.getByText('Schedule')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('Loading schedule...')).not.toBeInTheDocument()
    })
  })

  it('renders the subtitle text', async () => {
    render(
      <MemoryRouter>
        <Schedule />
      </MemoryRouter>
    )
    expect(screen.getByText('Manage your upcoming inspections.')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('Loading schedule...')).not.toBeInTheDocument()
    })
  })

  it('renders the "Sync with Google Calendar" button', async () => {
    render(
      <MemoryRouter>
        <Schedule />
      </MemoryRouter>
    )
    expect(screen.getByText('Sync with Google Calendar')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('Loading schedule...')).not.toBeInTheDocument()
    })
  })

  it('renders the Google Calendar iframe when token is present', async () => {
    render(
      <MemoryRouter>
        <Schedule />
      </MemoryRouter>
    )
    // After loading resolves, the iframe should appear since googleAccessToken is set
    const iframe = await screen.findByTitle('Google Calendar')
    expect(iframe).toBeInTheDocument()
    expect(iframe).toHaveAttribute('src', expect.stringContaining('calendar.google.com'))
  })
})
