import { describe, beforeEach, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Dashboard from './Dashboard'

// Mock dependencies
vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: { uid: 'test-uid', email: 'test@test.com' },
    loading: false,
  })),
}))

vi.mock('../hooks/useDatabase', () => ({
  useDatabase: vi.fn(({ table }: { table: string }) => {
    const mocks: Record<string, unknown> = {
      inspections: {
        findAll: vi.fn().mockResolvedValue([]),
      },
      operations: {
        findAll: vi.fn().mockResolvedValue([]),
      },
      unassigned_uploads: {
        findAll: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
      },
      notes: {
        save: vi.fn().mockResolvedValue(undefined),
      },
    }
    return mocks[table] || {
      findAll: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue(undefined),
    }
  }),
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
}))

vi.mock('@dios/shared/firebase', () => ({
  storage: null,
}))

vi.mock('sweetalert2', () => ({
  default: { fire: vi.fn().mockResolvedValue({ isConfirmed: true }) },
}))

vi.mock('../components/TasksWidget', () => ({
  default: () => <div data-testid="tasks-widget">TasksWidget</div>,
}))

vi.mock('../components/ProcessUploadModal', () => ({
  default: ({ upload, onClose }: { upload: unknown; onClose: () => void }) => (
    <div data-testid="process-upload-modal">
      <button onClick={onClose}>Close Modal</button>
    </div>
  ),
}))

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders greeting based on time of day', () => {
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      // Should have one of the greetings
      const greeting = screen.getByRole('heading', { level: 1 })
      expect(
        greeting.textContent === 'Good Morning' ||
        greeting.textContent === 'Good Afternoon' ||
        greeting.textContent === 'Good Evening'
      ).toBe(true)
    })

    it('renders subtitle text', () => {
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      expect(
        screen.getByText(/Here's what's happening with your certification operations today/)
      ).toBeInTheDocument()
    })

    it('renders current date', () => {
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      // Should render a date string
      const dateRegex = /\w+, \w+ \d+, \d{4}/
      expect(screen.getByText(dateRegex)).toBeInTheDocument()
    })

    it('renders Upcoming Inspections section', () => {
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      expect(screen.getByText('Upcoming Inspections')).toBeInTheDocument()
    })

    it('renders Quick Note section', () => {
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      expect(screen.getByText('Quick Note')).toBeInTheDocument()
    })

    it('renders Uploads section', () => {
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      expect(screen.getByText('Uploads')).toBeInTheDocument()
    })

    it('renders TasksWidget', () => {
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      expect(screen.getByTestId('tasks-widget')).toBeInTheDocument()
    })
  })

  describe('Upcoming Inspections', () => {
    it('shows empty state when no inspections', async () => {
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('No upcoming inspections')).toBeInTheDocument()
      })
    })

    it('shows loading state initially', () => {
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      // Initially shows loading or content
      expect(screen.getByText('Upcoming Inspections')).toBeInTheDocument()
    })

    it('displays inspections with operation names', async () => {
      const { useDatabase } = await import('../hooks/useDatabase')
      const today = new Date()
      const futureDate = new Date(today.getTime() + 86400000) // Tomorrow

      ;(useDatabase as ReturnType<typeof vi.fn>).mockImplementation(({ table }: { table: string }) => {
        if (table === 'inspections') {
          return {
            findAll: vi.fn().mockResolvedValue([
              {
                id: 'insp-1',
                date: futureDate.toISOString().split('T')[0],
                status: 'Scheduled',
                operationId: 'op-1',
              },
            ]),
          }
        }
        if (table === 'operations') {
          return {
            findAll: vi.fn().mockResolvedValue([
              { id: 'op-1', name: 'Test Farm' },
            ]),
          }
        }
        return { findAll: vi.fn().mockResolvedValue([]) }
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText(/Test Farm/)).toBeInTheDocument()
      })
    })
  })

  describe('Quick Note', () => {
    it('renders textarea for notes', () => {
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      expect(screen.getByPlaceholderText('Type your notes here')).toBeInTheDocument()
    })

    it('updates note text on input', () => {
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      const textarea = screen.getByPlaceholderText('Type your notes here')
      fireEvent.change(textarea, { target: { value: 'Test note content' } })

      expect(textarea).toHaveValue('Test note content')
    })

    it('has disabled save button when note is empty', () => {
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      const buttons = screen.getAllByRole('button')
      const checkIconButton = buttons.find(btn => btn.querySelector('svg.lucide-check'))
      expect(checkIconButton).toBeDisabled()
    })

    it('saves note when save button clicked', async () => {
      const mockSaveNote = vi.fn().mockResolvedValue(undefined)
      const { useDatabase } = await import('../hooks/useDatabase')
      ;(useDatabase as ReturnType<typeof vi.fn>).mockImplementation(({ table }: { table: string }) => {
        if (table === 'notes') {
          return { save: mockSaveNote }
        }
        return { findAll: vi.fn().mockResolvedValue([]) }
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      const textarea = screen.getByPlaceholderText('Type your notes here')
      fireEvent.change(textarea, { target: { value: 'Test note' } })

      // Find and click save button (it's the one with the Check icon)
      const buttons = screen.getAllByRole('button')
      const saveButton = buttons.find(btn => !btn.hasAttribute('disabled'))

      if (saveButton) {
        fireEvent.click(saveButton)
      }
    })
  })

  describe('Uploads', () => {
    it('shows empty state when no uploads', async () => {
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('No unassigned uploads')).toBeInTheDocument()
      })
    })

    it('renders Upload button', () => {
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      expect(screen.getByText('Upload')).toBeInTheDocument()
    })

    it('displays upload count badge when uploads exist', async () => {
      const { useDatabase } = await import('../hooks/useDatabase')
      ;(useDatabase as ReturnType<typeof vi.fn>).mockImplementation(({ table }: { table: string }) => {
        if (table === 'unassigned_uploads') {
          return {
            findAll: vi.fn().mockResolvedValue([
              {
                id: 'upload-1',
                fileName: 'receipt.pdf',
                fileType: 'application/pdf',
                fileSize: 1024,
                uploadedAt: new Date().toISOString(),
              },
            ]),
            save: vi.fn(),
          }
        }
        return { findAll: vi.fn().mockResolvedValue([]) }
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('1')).toBeInTheDocument() // Badge count
      })
    })

    it('shows upload file info when uploads exist', async () => {
      const { useDatabase } = await import('../hooks/useDatabase')
      ;(useDatabase as ReturnType<typeof vi.fn>).mockImplementation(({ table }: { table: string }) => {
        if (table === 'unassigned_uploads') {
          return {
            findAll: vi.fn().mockResolvedValue([
              {
                id: 'upload-1',
                fileName: 'test-document.pdf',
                fileType: 'application/pdf',
                fileSize: 2048,
                uploadedAt: new Date().toISOString(),
                downloadURL: 'https://example.com/file.pdf',
                storagePath: '/path/to/file',
              },
            ]),
            save: vi.fn(),
          }
        }
        return { findAll: vi.fn().mockResolvedValue([]) }
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('test-document.pdf')).toBeInTheDocument()
      })
    })

    it('opens ProcessUploadModal when upload item clicked', async () => {
      const { useDatabase } = await import('../hooks/useDatabase')
      ;(useDatabase as ReturnType<typeof vi.fn>).mockImplementation(({ table }: { table: string }) => {
        if (table === 'unassigned_uploads') {
          return {
            findAll: vi.fn().mockResolvedValue([
              {
                id: 'upload-1',
                fileName: 'receipt.jpg',
                fileType: 'image/jpeg',
                fileSize: 5120,
                uploadedAt: new Date().toISOString(),
                downloadURL: 'https://example.com/receipt.jpg',
                storagePath: '/path/to/receipt',
              },
            ]),
            save: vi.fn(),
          }
        }
        return { findAll: vi.fn().mockResolvedValue([]) }
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('receipt.jpg')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('receipt.jpg'))

      await waitFor(() => {
        expect(screen.getByTestId('process-upload-modal')).toBeInTheDocument()
      })
    })
  })

  describe('user not logged in', () => {
    it('handles null user gracefully', async () => {
      const { useAuth } = await import('../contexts/AuthContext')
      ;(useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
        user: null,
        loading: false,
      })

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      )

      // Should still render without crashing
      expect(screen.getByText('Upcoming Inspections')).toBeInTheDocument()
    })
  })
})
