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

vi.mock('date-fns', async () => {
  const actual = await vi.importActual<typeof import('date-fns')>('date-fns')
  return {
    ...actual,
    format: actual.format,
    isToday: actual.isToday,
    isYesterday: actual.isYesterday,
    parseISO: actual.parseISO,
  }
})

import NotesTasks from './NotesTasks'

describe('NotesTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the "Notes & Tasks" heading', () => {
    render(
      <MemoryRouter>
        <NotesTasks />
      </MemoryRouter>
    )
    expect(screen.getByText('Notes & Tasks')).toBeInTheDocument()
  })

  it('renders the subtitle text', () => {
    render(
      <MemoryRouter>
        <NotesTasks />
      </MemoryRouter>
    )
    expect(
      screen.getByText('All tasks and activity notes across every operation — in one place.')
    ).toBeInTheDocument()
  })

  it('renders the "Add Task" button', () => {
    render(
      <MemoryRouter>
        <NotesTasks />
      </MemoryRouter>
    )
    expect(screen.getByText('Add Task')).toBeInTheDocument()
  })

  it('renders the new task input', () => {
    render(
      <MemoryRouter>
        <NotesTasks />
      </MemoryRouter>
    )
    expect(screen.getByPlaceholderText('Add a new task...')).toBeInTheDocument()
  })

  it('renders the search input', () => {
    render(
      <MemoryRouter>
        <NotesTasks />
      </MemoryRouter>
    )
    expect(screen.getByPlaceholderText('Search tasks and notes...')).toBeInTheDocument()
  })

  it('renders the priority select dropdown', () => {
    render(
      <MemoryRouter>
        <NotesTasks />
      </MemoryRouter>
    )
    expect(screen.getByDisplayValue('Medium Priority')).toBeInTheDocument()
  })

  it('renders the status filter buttons', () => {
    render(
      <MemoryRouter>
        <NotesTasks />
      </MemoryRouter>
    )
    expect(screen.getByText('all')).toBeInTheDocument()
    expect(screen.getByText('pending')).toBeInTheDocument()
    expect(screen.getByText('completed')).toBeInTheDocument()
  })

  it('renders the source filter buttons', () => {
    render(
      <MemoryRouter>
        <NotesTasks />
      </MemoryRouter>
    )
    expect(screen.getByText('All Types')).toBeInTheDocument()
    expect(screen.getByText('Tasks')).toBeInTheDocument()
    expect(screen.getByText('Activity Notes')).toBeInTheDocument()
  })

  it('renders the sort buttons', () => {
    render(
      <MemoryRouter>
        <NotesTasks />
      </MemoryRouter>
    )
    expect(screen.getByText('Date')).toBeInTheDocument()
    expect(screen.getByText('Priority')).toBeInTheDocument()
    expect(screen.getByText('Operation')).toBeInTheDocument()
  })

  it('shows empty state when no items match filters', async () => {
    render(
      <MemoryRouter>
        <NotesTasks />
      </MemoryRouter>
    )
    expect(await screen.findByText('No items match your filters.')).toBeInTheDocument()
  })

  it('renders the summary footer with item count', async () => {
    render(
      <MemoryRouter>
        <NotesTasks />
      </MemoryRouter>
    )
    expect(await screen.findByText(/0 items/)).toBeInTheDocument()
    expect(screen.getByText(/0 pending tasks/)).toBeInTheDocument()
  })
})
