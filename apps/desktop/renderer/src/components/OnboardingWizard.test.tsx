import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'test-uid' }, googleAccessToken: 'test-token', loading: false }),
}))

vi.mock('@dios/shared/firebase', () => ({
  db: {},
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(() => ({ id: 'mock-id' })),
  setDoc: vi.fn(),
}))

vi.mock('../utils/geocodingUtils', () => ({
  geocodeAddress: vi.fn().mockResolvedValue({ lat: 40.0, lng: -90.0 }),
}))

vi.mock('@dios/shared', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('sweetalert2', () => ({
  default: { fire: vi.fn().mockResolvedValue({ isConfirmed: true }) },
}))

vi.mock('./RateConfigSection', () => ({
  default: () => <div data-testid="rate-config-section">RateConfigSection</div>,
}))

vi.mock('./SignatureEditor', () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea data-testid="signature-editor" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
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

  it('renders "Welcome to DIOS Studio" on step 0', () => {
    render(<OnboardingWizard {...defaultProps} />)
    expect(screen.getByText('Welcome to DIOS Studio')).toBeInTheDocument()
  })

  it('renders "Step 1 of 5" text', () => {
    render(<OnboardingWizard {...defaultProps} />)
    expect(screen.getByText('Step 1 of 5')).toBeInTheDocument()
  })

  it('Next button advances to step 1 ("Your Address")', () => {
    render(<OnboardingWizard {...defaultProps} />)
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('Your Address')).toBeInTheDocument()
    expect(screen.getByText('Step 2 of 5')).toBeInTheDocument()
  })

  it('Back button goes back to step 0', () => {
    render(<OnboardingWizard {...defaultProps} />)
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('Your Address')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Back'))
    expect(screen.getByText('Welcome to DIOS Studio')).toBeInTheDocument()
    expect(screen.getByText('Step 1 of 5')).toBeInTheDocument()
  })

  it('Skip button jumps to step 4 ("All Set!")', () => {
    render(<OnboardingWizard {...defaultProps} />)
    fireEvent.click(screen.getByText('Skip'))
    expect(screen.getByText('All Set!')).toBeInTheDocument()
    expect(screen.getByText('Step 5 of 5')).toBeInTheDocument()
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

  it('Step 4 shows "All Set!" and "Get Started" button', () => {
    render(<OnboardingWizard {...defaultProps} />)
    fireEvent.click(screen.getByText('Skip'))

    expect(screen.getByText('All Set!')).toBeInTheDocument()
    expect(screen.getByText('Get Started')).toBeInTheDocument()
  })
})
