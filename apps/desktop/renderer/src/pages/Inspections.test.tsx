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

vi.mock('../utils/csvExport', () => ({
  generateCsv: vi.fn(() => ''),
  downloadCsv: vi.fn(),
}))

import Inspections from './Inspections'

describe('Inspections', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the "Inspections" heading', async () => {
    render(
      <MemoryRouter>
        <Inspections />
      </MemoryRouter>
    )
    expect(screen.getByText('Inspections')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('Loading inspections...')).not.toBeInTheDocument()
    })
  })

  it('renders the subtitle text', async () => {
    render(
      <MemoryRouter>
        <Inspections />
      </MemoryRouter>
    )
    expect(screen.getByText('View and manage all inspection records.')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('Loading inspections...')).not.toBeInTheDocument()
    })
  })

  it('renders the search input', async () => {
    render(
      <MemoryRouter>
        <Inspections />
      </MemoryRouter>
    )
    expect(screen.getByPlaceholderText('Search by operation, scope, or date...')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('Loading inspections...')).not.toBeInTheDocument()
    })
  })

  it('renders the status filter dropdown', async () => {
    render(
      <MemoryRouter>
        <Inspections />
      </MemoryRouter>
    )
    expect(screen.getByDisplayValue('All Statuses')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('Loading inspections...')).not.toBeInTheDocument()
    })
  })

  it('renders the Export button', async () => {
    render(
      <MemoryRouter>
        <Inspections />
      </MemoryRouter>
    )
    expect(screen.getByText('Export')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('Loading inspections...')).not.toBeInTheDocument()
    })
  })

  it('shows empty state when no inspections exist', async () => {
    render(
      <MemoryRouter>
        <Inspections />
      </MemoryRouter>
    )
    expect(await screen.findByText('No inspections yet')).toBeInTheDocument()
  })

  it('shows empty state guidance text', async () => {
    render(
      <MemoryRouter>
        <Inspections />
      </MemoryRouter>
    )
    expect(
      await screen.findByText("Inspections can be created from an operation's profile page.")
    ).toBeInTheDocument()
  })
})
