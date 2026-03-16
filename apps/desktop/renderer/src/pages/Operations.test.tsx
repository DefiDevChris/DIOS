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
}))

vi.mock('sweetalert2', () => ({
  default: { fire: vi.fn().mockResolvedValue({ isConfirmed: true }) },
}))

vi.mock('../utils/firestoreErrorHandler', () => ({
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
}))

vi.mock('../utils/geocodingUtils', () => ({
  geocodeAddress: vi.fn().mockResolvedValue(null),
}))

vi.mock('../lib/driveSync', () => ({
  ensureOperationFolder: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('papaparse', () => ({
  default: { parse: vi.fn() },
}))

import Operations from './Operations'

describe('Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the "Operations Directory" heading', () => {
    render(
      <MemoryRouter>
        <Operations />
      </MemoryRouter>
    )
    expect(screen.getByText('Operations Directory')).toBeInTheDocument()
  })

  it('renders the subtitle text', () => {
    render(
      <MemoryRouter>
        <Operations />
      </MemoryRouter>
    )
    expect(screen.getByText('Manage farms, processors, and businesses you inspect.')).toBeInTheDocument()
  })

  it('renders the "Add Operation" button', () => {
    render(
      <MemoryRouter>
        <Operations />
      </MemoryRouter>
    )
    expect(screen.getByText('Add Operation')).toBeInTheDocument()
  })

  it('renders the "Import CSV" label', () => {
    render(
      <MemoryRouter>
        <Operations />
      </MemoryRouter>
    )
    expect(screen.getByText('Import CSV')).toBeInTheDocument()
  })

  it('renders the search input', () => {
    render(
      <MemoryRouter>
        <Operations />
      </MemoryRouter>
    )
    expect(screen.getByPlaceholderText('Search operations by name, contact, or address...')).toBeInTheDocument()
  })

  it('shows empty state message when no operations exist', async () => {
    render(
      <MemoryRouter>
        <Operations />
      </MemoryRouter>
    )
    expect(await screen.findByText('No operations found')).toBeInTheDocument()
  })

  it('shows the empty state call-to-action text', async () => {
    render(
      <MemoryRouter>
        <Operations />
      </MemoryRouter>
    )
    expect(
      await screen.findByText('Get started by adding your first farm or business to the directory.')
    ).toBeInTheDocument()
  })
})
