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

vi.mock('../utils/firestoreErrorHandler', () => ({
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete', LIST: 'list', GET: 'get', WRITE: 'write' },
}))

import StickyNote from './StickyNote'

describe('StickyNote', () => {
  const defaultProps = {
    operationId: 'op-123',
    onSaved: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders Note and Task toggle buttons', () => {
    render(<StickyNote {...defaultProps} />)
    expect(screen.getByText('Note')).toBeInTheDocument()
    expect(screen.getByText('Task')).toBeInTheDocument()
  })

  it('Note mode is default (Note button highlighted)', () => {
    render(<StickyNote {...defaultProps} />)
    const noteButton = screen.getByText('Note').closest('button')
    expect(noteButton?.className).toContain('bg-[#D49A6A]')
    const taskButton = screen.getByText('Task').closest('button')
    expect(taskButton?.className).toContain('bg-stone-100')
  })

  it('clicking Task switches to task mode (shows due date input)', () => {
    render(<StickyNote {...defaultProps} />)
    expect(screen.queryByDisplayValue('')).toBeTruthy()
    expect(screen.queryByPlaceholderText('Due date (optional)')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Task'))

    const taskButton = screen.getByText('Task').closest('button')
    expect(taskButton?.className).toContain('bg-[#D49A6A]')
    expect(screen.getByPlaceholderText('Add a task...')).toBeInTheDocument()
    expect(document.querySelector('input[type="date"]')).toBeInTheDocument()
  })

  it('submit button disabled when content is empty', () => {
    render(<StickyNote {...defaultProps} />)
    const textarea = screen.getByPlaceholderText('Add a quick note...')
    expect(textarea).toHaveValue('')

    const submitButton = screen.getByRole('button', { name: '' })
    const buttons = screen.getAllByRole('button')
    const sendButton = buttons.find(
      (btn) => !btn.textContent?.includes('Note') && !btn.textContent?.includes('Task')
    )
    expect(sendButton).toBeDisabled()
  })

  it('submit button enabled when content has text', () => {
    render(<StickyNote {...defaultProps} />)
    const textarea = screen.getByPlaceholderText('Add a quick note...')
    fireEvent.change(textarea, { target: { value: 'Hello world' } })

    const buttons = screen.getAllByRole('button')
    const sendButton = buttons.find(
      (btn) => !btn.textContent?.includes('Note') && !btn.textContent?.includes('Task')
    )
    expect(sendButton).not.toBeDisabled()
  })

  it('textarea has correct placeholder based on mode', () => {
    render(<StickyNote {...defaultProps} />)
    expect(screen.getByPlaceholderText('Add a quick note...')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Task'))
    expect(screen.getByPlaceholderText('Add a task...')).toBeInTheDocument()
  })
})
