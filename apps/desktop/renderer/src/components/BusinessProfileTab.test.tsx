import { render, screen, waitFor } from '@testing-library/react'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'test-uid' }, googleAccessToken: 'test-token', loading: false }),
}))

vi.mock('@dios/shared/firebase', () => ({
  db: {},
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn().mockResolvedValue({
    exists: () => true,
    data: () => ({
      businessName: 'Test Business',
      ownerName: 'Test Owner',
      ownerTitle: 'Inspector',
      businessAddress: '123 Main St',
      businessCity: 'Springfield',
      businessState: 'IL',
      businessZip: '62704',
      businessPhone: '555-1234',
      businessEmail: 'test@test.com',
      irsMileageRate: 0.70,
      emailSignatureHtml: '<b>Test</b>',
    }),
  }),
  setDoc: vi.fn(),
}))

vi.mock('../utils/geocodingUtils', () => ({
  geocodeAddress: vi.fn().mockResolvedValue({ lat: 40, lng: -90 }),
}))

vi.mock('@dios/shared', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('sweetalert2', () => ({
  default: { fire: vi.fn().mockResolvedValue({ isConfirmed: true }) },
}))

vi.mock('./SignatureEditor', () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea data-testid="signature-editor" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}))

import BusinessProfileTab from './BusinessProfileTab'

describe('BusinessProfileTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows "Loading business profile..." initially', () => {
    render(<BusinessProfileTab />)
    expect(screen.getByText('Loading business profile...')).toBeInTheDocument()
  })

  it('renders "Business Information" heading after load', async () => {
    render(<BusinessProfileTab />)

    await waitFor(() => {
      expect(screen.getByText('Business Information')).toBeInTheDocument()
    })
  })

  it('renders Save Changes button', async () => {
    render(<BusinessProfileTab />)

    await waitFor(() => {
      expect(screen.getByText('Save Changes')).toBeInTheDocument()
    })
  })
})
