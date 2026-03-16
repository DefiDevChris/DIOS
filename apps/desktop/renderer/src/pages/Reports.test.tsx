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

vi.mock('../lib/pdfGenerator', () => ({
  generateTaxReportPdf: vi.fn(() => new Blob(['fake-pdf'])),
}))

vi.mock('../utils/firestoreErrorHandler', () => ({
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', GET: 'GET', CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
}))

vi.mock('../utils/systemConfig', () => ({
  getSystemConfig: vi.fn().mockResolvedValue({}),
}))

// Mock recharts to avoid rendering issues in jsdom
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-container">{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div data-testid="bar" />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
}))

import Reports from './Reports'

describe('Reports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the Reports & Exports heading', () => {
    render(
      <MemoryRouter>
        <Reports />
      </MemoryRouter>
    )
    expect(screen.getByText('Reports & Exports')).toBeInTheDocument()
  })

  it('renders the subtitle text', () => {
    render(
      <MemoryRouter>
        <Reports />
      </MemoryRouter>
    )
    expect(
      screen.getByText('Generate tax documents, financial summaries, and performance charts.')
    ).toBeInTheDocument()
  })

  it('renders the Schedule C Export card', () => {
    render(
      <MemoryRouter>
        <Reports />
      </MemoryRouter>
    )
    expect(screen.getByText('Schedule C Export')).toBeInTheDocument()
  })

  it('renders the Generate PDF button', () => {
    render(
      <MemoryRouter>
        <Reports />
      </MemoryRouter>
    )
    expect(screen.getByText('Generate PDF')).toBeInTheDocument()
  })

  it('renders the Mileage Summary card', () => {
    render(
      <MemoryRouter>
        <Reports />
      </MemoryRouter>
    )
    expect(screen.getByText('Mileage Summary')).toBeInTheDocument()
  })

  it('renders the year selector', () => {
    render(
      <MemoryRouter>
        <Reports />
      </MemoryRouter>
    )
    const currentYear = new Date().getFullYear()
    expect(screen.getByDisplayValue(String(currentYear))).toBeInTheDocument()
  })

  it('renders the Monthly Expenses vs. Revenue chart title', () => {
    render(
      <MemoryRouter>
        <Reports />
      </MemoryRouter>
    )
    expect(screen.getByText('Monthly Expenses vs. Revenue')).toBeInTheDocument()
  })

  it('renders the Hours Logged vs. Billed chart title', () => {
    render(
      <MemoryRouter>
        <Reports />
      </MemoryRouter>
    )
    expect(screen.getByText('Hours Logged vs. Billed')).toBeInTheDocument()
  })
})
