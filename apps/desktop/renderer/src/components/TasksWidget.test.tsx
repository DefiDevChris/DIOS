import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

const mockFindAll = vi.fn()
const mockSave = vi.fn()
const mockRemove = vi.fn()
const mockFindAllOperations = vi.fn()
const mockFindAllInspections = vi.fn()

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'test-uid' }, googleAccessToken: 'test-token', loading: false }),
}))

vi.mock('../hooks/useDatabase', () => ({
  useDatabase: ({ table }: { table: string }) => {
    if (table === 'tasks') return { findAll: mockFindAll, save: mockSave, remove: mockRemove }
    if (table === 'operations') return { findAll: mockFindAllOperations }
    if (table === 'inspections') return { findAll: mockFindAllInspections }
    return { findAll: vi.fn().mockResolvedValue([]), save: vi.fn(), remove: vi.fn() }
  },
}))

vi.mock('../utils/firestoreErrorHandler', () => ({
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete', LIST: 'list', GET: 'get', WRITE: 'write' },
}))

vi.mock('lucide-react', () => ({
  CheckSquare: (props: any) => <svg data-testid="check-square" {...props} />,
  Square: (props: any) => <svg data-testid="square" {...props} />,
  Trash2: (props: any) => <svg data-testid="trash" {...props} />,
  Plus: (props: any) => <svg data-testid="plus" {...props} />,
  Calendar: (props: any) => <svg data-testid="calendar" {...props} />,
  Tag: (props: any) => <svg data-testid="tag" {...props} />,
}))

import TasksWidget from './TasksWidget'

const sampleTasks = [
  { id: 't1', title: 'Water the plants', status: 'pending', createdAt: '2026-03-10T00:00:00Z', updatedAt: '2026-03-10T00:00:00Z', syncStatus: 'synced' },
  { id: 't2', title: 'Check soil pH', status: 'completed', createdAt: '2026-03-09T00:00:00Z', updatedAt: '2026-03-09T00:00:00Z', syncStatus: 'synced' },
]

describe('TasksWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindAll.mockResolvedValue([...sampleTasks])
    mockFindAllOperations.mockResolvedValue([])
    mockFindAllInspections.mockResolvedValue([])
    mockSave.mockResolvedValue(undefined)
    mockRemove.mockResolvedValue(undefined)
  })

  it('renders with default title', async () => {
    await act(async () => {
      render(<TasksWidget />)
    })
    expect(screen.getByText('Tasks & Follow-ups')).toBeInTheDocument()
  })

  it('renders with custom title', async () => {
    await act(async () => {
      render(<TasksWidget title="My Tasks" />)
    })
    expect(screen.getByText('My Tasks')).toBeInTheDocument()
  })

  it('renders task list from fetched data', async () => {
    await act(async () => {
      render(<TasksWidget />)
    })

    await waitFor(() => {
      expect(screen.getByText('Water the plants')).toBeInTheDocument()
      expect(screen.getByText('Check soil pH')).toBeInTheDocument()
    })
  })

  it('shows empty state when no tasks exist', async () => {
    mockFindAll.mockResolvedValue([])

    await act(async () => {
      render(<TasksWidget />)
    })

    await waitFor(() => {
      expect(screen.getByText('All caught up!')).toBeInTheDocument()
    })
  })

  it('renders the add task input', async () => {
    await act(async () => {
      render(<TasksWidget />)
    })
    expect(screen.getByPlaceholderText('Add a task... (type @ to tag)')).toBeInTheDocument()
  })

  it('renders specific placeholder when operationId is provided', async () => {
    await act(async () => {
      render(<TasksWidget operationId="op-1" />)
    })
    expect(screen.getByPlaceholderText('Add a task...')).toBeInTheDocument()
  })

  it('submit button is disabled when input is empty', async () => {
    await act(async () => {
      render(<TasksWidget />)
    })

    const allButtons = screen.getAllByRole('button')
    const submitBtn = allButtons.find(btn => btn.getAttribute('type') === 'submit')
    expect(submitBtn).toBeDisabled()
  })

  it('calls save when adding a new task', async () => {
    mockFindAll.mockResolvedValue([...sampleTasks])

    await act(async () => {
      render(<TasksWidget />)
    })

    const input = screen.getByPlaceholderText('Add a task... (type @ to tag)')
    fireEvent.change(input, { target: { value: 'New task' } })

    const form = input.closest('form')!
    await act(async () => {
      fireEvent.submit(form)
    })

    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'New task',
        status: 'pending',
      })
    )
  })

  it('calls save with toggled status when clicking a task checkbox', async () => {
    await act(async () => {
      render(<TasksWidget />)
    })

    await waitFor(() => {
      expect(screen.getByText('Water the plants')).toBeInTheDocument()
    })

    // Click the first toggle button (pending task -> completed)
    const toggleButtons = screen.getAllByRole('button').filter(btn =>
      btn.querySelector('[data-testid="square"]') || btn.querySelector('[data-testid="check-square"]')
    )

    await act(async () => {
      fireEvent.click(toggleButtons[0])
    })

    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 't1',
        status: 'completed',
      })
    )
  })

  it('calls remove when clicking delete on a task', async () => {
    await act(async () => {
      render(<TasksWidget />)
    })

    await waitFor(() => {
      expect(screen.getByText('Water the plants')).toBeInTheDocument()
    })

    const deleteButtons = screen.getAllByRole('button').filter(btn =>
      btn.querySelector('[data-testid="trash"]')
    )

    await act(async () => {
      fireEvent.click(deleteButtons[0])
    })

    expect(mockRemove).toHaveBeenCalledWith('t1')
  })

  it('shows tag menu when typing @ in input', async () => {
    mockFindAllOperations.mockResolvedValue([{ id: 'op-1', name: 'Green Farm' }])

    await act(async () => {
      render(<TasksWidget />)
    })

    const input = screen.getByPlaceholderText('Add a task... (type @ to tag)')
    fireEvent.change(input, { target: { value: '@Green' } })

    await waitFor(() => {
      expect(screen.getByText('Operations')).toBeInTheDocument()
      expect(screen.getByText('Green Farm')).toBeInTheDocument()
    })
  })

  it('does not show tag menu when input has no @ prefix', async () => {
    mockFindAllOperations.mockResolvedValue([{ id: 'op-1', name: 'Green Farm' }])

    await act(async () => {
      render(<TasksWidget />)
    })

    const input = screen.getByPlaceholderText('Add a task... (type @ to tag)')
    fireEvent.change(input, { target: { value: 'Just text' } })

    expect(screen.queryByText('Operations')).not.toBeInTheDocument()
  })

  it('passes operationId filter when fetching tasks', async () => {
    await act(async () => {
      render(<TasksWidget operationId="op-123" />)
    })

    expect(mockFindAll).toHaveBeenCalledWith({ operationId: 'op-123' })
  })

  it('passes inspectionId filter when fetching tasks', async () => {
    await act(async () => {
      render(<TasksWidget inspectionId="insp-456" />)
    })

    expect(mockFindAll).toHaveBeenCalledWith({ inspectionId: 'insp-456' })
  })
})
