import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'test-uid' }, googleAccessToken: 'test-token', loading: false }),
}))

vi.mock('../hooks/useDatabase', () => ({
  useDatabase: () => ({ save: vi.fn().mockResolvedValue(undefined), findAll: vi.fn().mockResolvedValue([]) }),
}))

vi.mock('../utils/systemConfig', () => ({
  saveSystemConfig: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../utils/geocodingUtils', () => ({
  geocodeAddress: vi.fn().mockResolvedValue({ lat: 40.0, lng: -90.0 }),
}))

vi.mock('@dios/shared', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() },
}))

vi.mock('sweetalert2', () => ({
  default: { fire: vi.fn().mockResolvedValue({ isConfirmed: true }) },
}))

vi.mock('./RateConfigSection', () => ({
  default: () => <div data-testid="rate-config-section">RateConfigSection</div>,
}))

vi.mock('./LeafLogo', () => ({
  default: () => <div data-testid="leaf-logo" />,
}))

import OnboardingWizard from './OnboardingWizard'

describe('OnboardingWizard', () => {
  const defaultProps = {
    isOpen: true,
    onComplete: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when isOpen is false', () => {
    const { container } = render(<OnboardingWizard {...defaultProps} isOpen={false} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders welcome text on step 0', () => {
    render(<OnboardingWizard {...defaultProps} />)
    expect(screen.getByText(/Welcome to/)).toBeInTheDocument()
    expect(screen.getByText(/DIOS Studio/)).toBeInTheDocument()
  })

  it('Next button advances to step 1 (address step)', () => {
    render(<OnboardingWizard {...defaultProps} />)
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('Street Address')).toBeInTheDocument()
  })

  it('Back button goes back to step 0', () => {
    render(<OnboardingWizard {...defaultProps} />)
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('Street Address')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Back'))
    expect(screen.getByText(/Welcome to/)).toBeInTheDocument()
  })

  it('Skip button on step 1 advances to step 2', () => {
    render(<OnboardingWizard {...defaultProps} />)
    fireEvent.click(screen.getByText('Next')) // step 1
    expect(screen.getByText('Street Address')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Skip'))
    expect(screen.getByText('Agency Name')).toBeInTheDocument()
  })

  it('Step 0 has Business Name, Your Name, Title inputs', () => {
    render(<OnboardingWizard {...defaultProps} />)
    expect(screen.getByText('Business Name')).toBeInTheDocument()
    expect(screen.getByText('Your Name')).toBeInTheDocument()
    expect(screen.getByText('Title')).toBeInTheDocument()
  })

  it('Step 1 has address fields', () => {
    render(<OnboardingWizard {...defaultProps} />)
    fireEvent.click(screen.getByText('Next'))

    expect(screen.getByText('Street Address')).toBeInTheDocument()
    expect(screen.getByText('City')).toBeInTheDocument()
    expect(screen.getByText('State')).toBeInTheDocument()
    expect(screen.getByText('ZIP')).toBeInTheDocument()
  })

  it('Step 3 shows completion state and Get Started button', () => {
    render(<OnboardingWizard {...defaultProps} />)
    fireEvent.click(screen.getByText('Next')) // step 1
    fireEvent.click(screen.getByText('Next')) // step 2
    fireEvent.click(screen.getByText('Next')) // step 3

    expect(screen.getByRole('button', { name: /Get Started/i })).toBeInTheDocument()
  })
})
