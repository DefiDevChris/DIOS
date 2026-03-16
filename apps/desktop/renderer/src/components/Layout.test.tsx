import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const mockNavigate = vi.fn()
const mockSignOut = vi.fn().mockResolvedValue(undefined)
const mockSignInWithGoogle = vi.fn().mockResolvedValue(undefined)

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => {
      const params = new URLSearchParams('year=2026')
      return [params, vi.fn()] as const
    },
  }
})

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'test-uid', displayName: 'Chris Horan' },
    googleAccessToken: 'test-token',
    signInWithGoogle: mockSignInWithGoogle,
    signOut: mockSignOut,
    loading: false,
  }),
}))

vi.mock('@dios/shared', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() },
  configStore: {
    getConfig: vi.fn().mockReturnValue({ firebaseConfig: { apiKey: 'test' }, googleOAuthClientId: 'test-client-id' }),
    getOAuthClientId: vi.fn().mockReturnValue('test-client-id'),
  },
}))

vi.mock('sweetalert2', () => ({
  default: { fire: vi.fn().mockResolvedValue({ isConfirmed: true }) },
}))

vi.mock('./LeafLogo', () => ({
  default: () => <div data-testid="leaf-logo" />,
}))

vi.mock('lucide-react', () => ({
  Search: (props: any) => <svg data-testid="search-icon" {...props} />,
  CheckSquare: (props: any) => <svg data-testid="check-square" {...props} />,
  Settings: (props: any) => <svg data-testid="settings-icon" {...props} />,
  ChevronDown: (props: any) => <svg data-testid="chevron-down" {...props} />,
  Plus: (props: any) => <svg data-testid="plus-icon" {...props} />,
  LayoutDashboard: (props: any) => <svg data-testid="dashboard-icon" {...props} />,
  Building2: (props: any) => <svg data-testid="building-icon" {...props} />,
  ClipboardCheck: (props: any) => <svg data-testid="clipboard-icon" {...props} />,
  FileText: (props: any) => <svg data-testid="file-text-icon" {...props} />,
  Calendar: (props: any) => <svg data-testid="calendar-icon" {...props} />,
  StickyNote: (props: any) => <svg data-testid="sticky-icon" {...props} />,
  Mail: (props: any) => <svg data-testid="mail-icon" {...props} />,
  Map: (props: any) => <svg data-testid="map-icon" {...props} />,
  BarChart2: (props: any) => <svg data-testid="chart-icon" {...props} />,
  LineChart: (props: any) => <svg data-testid="line-chart-icon" {...props} />,
  HardDrive: (props: any) => <svg data-testid="hard-drive-icon" {...props} />,
  ExternalLink: (props: any) => <svg data-testid="external-link-icon" {...props} />,
  Wallet: (props: any) => <svg data-testid="wallet-icon" {...props} />,
  X: (props: any) => <svg data-testid="x-icon" {...props} />,
}))

import Layout from './Layout'

function renderLayout(initialRoute = '/') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Layout />
    </MemoryRouter>
  )
}

describe('Layout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Provide a minimal localStorage for isLocalDemo check
    Storage.prototype.getItem = vi.fn().mockReturnValue(null)
  })

  it('renders the DIOS brand name', () => {
    renderLayout()
    expect(screen.getByText('DIOS')).toBeInTheDocument()
  })

  it('renders the LeafLogo component', () => {
    renderLayout()
    expect(screen.getByTestId('leaf-logo')).toBeInTheDocument()
  })

  it('renders sidebar navigation links', () => {
    renderLayout()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Operations')).toBeInTheDocument()
    expect(screen.getByText('Inspections')).toBeInTheDocument()
    expect(screen.getByText('Invoices')).toBeInTheDocument()
    expect(screen.getByText('Expenses')).toBeInTheDocument()
    expect(screen.getByText('Schedule')).toBeInTheDocument()
  })

  it('renders tools section', () => {
    renderLayout()
    expect(screen.getByText('Notes & Tasks')).toBeInTheDocument()
    expect(screen.getByText('Email')).toBeInTheDocument()
    expect(screen.getByText('Map')).toBeInTheDocument()
    expect(screen.getByText('Reports')).toBeInTheDocument()
  })

  it('renders analytics section', () => {
    renderLayout()
    expect(screen.getByText('Insights')).toBeInTheDocument()
  })

  it('renders Google Drive button', () => {
    renderLayout()
    expect(screen.getByText('Google Drive')).toBeInTheDocument()
  })

  it('renders Settings nav item', () => {
    renderLayout()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('renders the user display name', () => {
    renderLayout()
    expect(screen.getByText('Chris Horan')).toBeInTheDocument()
  })

  it('renders the user initial in avatar', () => {
    renderLayout()
    expect(screen.getByText('C')).toBeInTheDocument()
  })

  it('renders the search input placeholder', () => {
    renderLayout()
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument()
  })

  it('opens command palette when search input is clicked', () => {
    renderLayout()
    fireEvent.click(screen.getByPlaceholderText('Search...'))
    expect(screen.getByPlaceholderText('Search operations, inspections, clients...')).toBeInTheDocument()
  })

  it('filters search results in command palette', () => {
    renderLayout()
    fireEvent.click(screen.getByPlaceholderText('Search...'))

    const searchInput = screen.getByPlaceholderText('Search operations, inspections, clients...')
    fireEvent.change(searchInput, { target: { value: 'dash' } })

    // Dashboard appears in both sidebar and command palette
    const dashboardElements = screen.getAllByText('Dashboard')
    expect(dashboardElements.length).toBeGreaterThanOrEqual(2)
    // Expenses should NOT appear in the command palette results (only in sidebar)
    const expenseElements = screen.getAllByText('Expenses')
    // Only one instance (the sidebar link) - should not appear in filtered command palette
    expect(expenseElements).toHaveLength(1)
  })

  it('shows "No results found" when search matches nothing', () => {
    renderLayout()
    fireEvent.click(screen.getByPlaceholderText('Search...'))

    const searchInput = screen.getByPlaceholderText('Search operations, inspections, clients...')
    fireEvent.change(searchInput, { target: { value: 'xyznonexistent' } })

    expect(screen.getByText('No results found')).toBeInTheDocument()
  })

  it('closes command palette when clicking backdrop', () => {
    renderLayout()
    fireEvent.click(screen.getByPlaceholderText('Search...'))
    expect(screen.getByPlaceholderText('Search operations, inspections, clients...')).toBeInTheDocument()

    // Click the backdrop (the outer fixed div)
    const backdrop = screen.getByPlaceholderText('Search operations, inspections, clients...').closest('.fixed')!
    fireEvent.click(backdrop)

    expect(screen.queryByPlaceholderText('Search operations, inspections, clients...')).not.toBeInTheDocument()
  })

  it('opens command palette on Ctrl+K', () => {
    renderLayout()
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(screen.getByPlaceholderText('Search operations, inspections, clients...')).toBeInTheDocument()
  })

  it('closes command palette on Escape', () => {
    renderLayout()
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(screen.getByPlaceholderText('Search operations, inspections, clients...')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByPlaceholderText('Search operations, inspections, clients...')).not.toBeInTheDocument()
  })

  it('navigates when selecting a search result', () => {
    renderLayout()
    fireEvent.click(screen.getByPlaceholderText('Search...'))

    // Click the Dashboard result in the command palette
    const paletteResults = screen.getAllByText('Dashboard')
    // The second Dashboard should be the one inside the command palette
    const paletteButton = paletteResults.find(el => el.closest('.fixed'))
    if (paletteButton) {
      fireEvent.click(paletteButton)
    }

    // After selection, the palette should close
    expect(screen.queryByPlaceholderText('Search operations, inspections, clients...')).not.toBeInTheDocument()
  })

  it('shows "New" button with dropdown', () => {
    renderLayout()
    expect(screen.getByText('New')).toBeInTheDocument()

    fireEvent.click(screen.getByText('New'))

    expect(screen.getByText('New Operation')).toBeInTheDocument()
    expect(screen.getByText('New Expense')).toBeInTheDocument()
  })

  it('navigates to operations with new param when clicking New Operation', () => {
    renderLayout()
    fireEvent.click(screen.getByText('New'))
    fireEvent.click(screen.getByText('New Operation'))

    expect(mockNavigate).toHaveBeenCalledWith('/operations?new=1')
  })

  it('navigates to expenses with new param when clicking New Expense', () => {
    renderLayout()
    fireEvent.click(screen.getByText('New'))
    fireEvent.click(screen.getByText('New Expense'))

    expect(mockNavigate).toHaveBeenCalledWith('/expenses?new=1')
  })

  it('navigates to /notes when Notes & Tasks header button is clicked', () => {
    renderLayout()
    // The header has a CheckSquare button for Notes & Tasks
    const headerButtons = screen.getAllByRole('button')
    const notesButton = headerButtons.find(btn => btn.getAttribute('title') === 'Notes & Tasks')
    expect(notesButton).toBeDefined()

    fireEvent.click(notesButton!)
    expect(mockNavigate).toHaveBeenCalledWith('/notes')
  })

  it('navigates to /settings when Settings header button is clicked', () => {
    renderLayout()
    const headerButtons = screen.getAllByRole('button')
    const settingsButton = headerButtons.find(btn => btn.getAttribute('title') === 'Settings')
    expect(settingsButton).toBeDefined()

    fireEvent.click(settingsButton!)
    expect(mockNavigate).toHaveBeenCalledWith('/settings')
  })

  it('signs out and navigates to /login when user area is clicked', async () => {
    renderLayout()

    await act(async () => {
      fireEvent.click(screen.getByText('Chris Horan'))
    })

    expect(mockSignOut).toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })

  it('renders section headings', () => {
    renderLayout()
    expect(screen.getByText('Main')).toBeInTheDocument()
    expect(screen.getByText('Tools')).toBeInTheDocument()
    expect(screen.getByText('Analytics')).toBeInTheDocument()
    expect(screen.getByText('Google Apps')).toBeInTheDocument()
  })

  it('renders year selector', () => {
    renderLayout()
    const yearSelect = screen.getByDisplayValue(/2026/)
    expect(yearSelect).toBeInTheDocument()
  })
})
