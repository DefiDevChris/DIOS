import { render, screen, cleanup } from '@testing-library/react'
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
  geocodeMissingOperations: vi.fn().mockResolvedValue([]),
}))

vi.mock('../utils/systemConfig', () => ({
  getSystemConfig: vi.fn().mockResolvedValue({ homebaseLat: 0, homebaseLng: 0 }),
}))

vi.mock('leaflet', () => ({
  default: {
    Icon: {
      Default: {
        prototype: {},
        mergeOptions: vi.fn(),
      },
    },
  },
  Icon: {
    Default: {
      prototype: {},
      mergeOptions: vi.fn(),
    },
  },
}))

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: any) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => <div data-testid="tile-layer" />,
  Marker: ({ children }: any) => <div data-testid="marker">{children}</div>,
  Popup: ({ children }: any) => <div data-testid="popup">{children}</div>,
}))

import Routing from './Routing'

describe('Routing', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders the "Map" heading', async () => {
    render(
      <MemoryRouter>
        <Routing />
      </MemoryRouter>
    )
    expect(await screen.findByText('Map')).toBeInTheDocument()
  })

  it('shows zero operators count when no operations have locations', async () => {
    render(
      <MemoryRouter>
        <Routing />
      </MemoryRouter>
    )
    expect(await screen.findByText('0 operators with locations')).toBeInTheDocument()
  })

  it('renders the map container', async () => {
    render(
      <MemoryRouter>
        <Routing />
      </MemoryRouter>
    )
    expect(await screen.findByTestId('map-container')).toBeInTheDocument()
  })
})
