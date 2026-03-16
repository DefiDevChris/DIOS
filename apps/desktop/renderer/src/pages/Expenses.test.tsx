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

vi.mock('../components/ReceiptScanner', () => ({
  default: () => <div data-testid="receipt-scanner">ReceiptScanner</div>,
}))

vi.mock('date-fns', async () => {
  const actual = await vi.importActual<typeof import('date-fns')>('date-fns')
  return {
    ...actual,
    format: actual.format,
  }
})

import Expenses from './Expenses'

describe('Expenses', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the "Expenses" heading', async () => {
    render(
      <MemoryRouter>
        <Expenses />
      </MemoryRouter>
    )
    expect(await screen.findByText('Expenses')).toBeInTheDocument()
  })

  it('renders the subtitle text', async () => {
    render(
      <MemoryRouter>
        <Expenses />
      </MemoryRouter>
    )
    expect(await screen.findByText('Track your receipts and field expenses.')).toBeInTheDocument()
  })

  it('renders the "Add Receipt" button', async () => {
    render(
      <MemoryRouter>
        <Expenses />
      </MemoryRouter>
    )
    expect(await screen.findByText('Add Receipt')).toBeInTheDocument()
  })

  it('renders the summary card labels', async () => {
    render(
      <MemoryRouter>
        <Expenses />
      </MemoryRouter>
    )
    expect(await screen.findByText('Total Expenses')).toBeInTheDocument()
    expect(screen.getByText('Receipts')).toBeInTheDocument()
  })

  it('renders the search input', async () => {
    render(
      <MemoryRouter>
        <Expenses />
      </MemoryRouter>
    )
    expect(await screen.findByPlaceholderText('Search vendors or notes...')).toBeInTheDocument()
  })

  it('shows empty state when no expenses exist', async () => {
    render(
      <MemoryRouter>
        <Expenses />
      </MemoryRouter>
    )
    expect(await screen.findByText('No expenses found')).toBeInTheDocument()
  })

  it('shows empty state call-to-action text', async () => {
    render(
      <MemoryRouter>
        <Expenses />
      </MemoryRouter>
    )
    expect(
      await screen.findByText("You haven't added any expenses yet. Click 'Add Receipt' to get started.")
    ).toBeInTheDocument()
  })

  it('renders the $0.00 total in empty state', async () => {
    render(
      <MemoryRouter>
        <Expenses />
      </MemoryRouter>
    )
    expect(await screen.findByText('$0.00')).toBeInTheDocument()
  })
})
