import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: null,
    googleAccessToken: 'token',
    loading: false,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    refreshGoogleToken: vi.fn(),
    isLocalUser: false,
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

vi.mock('../components/LeafLogo', () => ({
  default: () => <div data-testid="leaf-logo">LeafLogo</div>,
}))

import Login from './Login'
import { useAuth } from '../contexts/AuthContext'

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the DIOS Studio heading', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )
    expect(screen.getByText('DIOS Studio')).toBeInTheDocument()
  })

  it('renders the subtitle text', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )
    expect(screen.getByText('Field Inspector CRM & Routing Dashboard')).toBeInTheDocument()
  })

  it('renders the Sign in with Google button', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )
    expect(screen.getByText('Sign in with Google')).toBeInTheDocument()
  })

  it('renders the Google Workspace requirement note', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )
    expect(screen.getByText('Requires Google Workspace Account')).toBeInTheDocument()
  })

  it('renders the LeafLogo component', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )
    expect(screen.getByTestId('leaf-logo')).toBeInTheDocument()
  })

  it('calls signInWithGoogle when button is clicked', () => {
    const mockSignIn = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      googleAccessToken: 'token',
      loading: false,
      signInWithGoogle: mockSignIn,
      signOut: vi.fn(),
      refreshGoogleToken: vi.fn(),
      isLocalUser: false,
    } as any)

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByText('Sign in with Google'))
    expect(mockSignIn).toHaveBeenCalledTimes(1)
  })

  it('redirects to "/" when user is already authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { uid: 'test-uid', email: 'test@test.com' },
      googleAccessToken: 'token',
      loading: false,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      refreshGoogleToken: vi.fn(),
      isLocalUser: false,
    } as any)

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )
    // When user is authenticated, the login form should not be visible
    expect(screen.queryByText('Sign in with Google')).not.toBeInTheDocument()
  })
})
