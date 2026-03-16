import { renderHook, act } from '@testing-library/react'
import { useDatabase } from './useDatabase'

// --- Mocks ---

// Mock AuthContext
const mockUser = { uid: 'user-123' }
vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: mockUser })),
}))

// Mock isElectron utility
const mockIsElectron = vi.fn(() => false)
vi.mock('../utils/isElectron', () => ({
  isElectron: () => mockIsElectron(),
}))

// Mock @dios/shared logger
vi.mock('@dios/shared', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  },
}))

// firebase/firestore is mocked via the alias (@dios/shared/firebase -> tests/mocks/firebase.ts)
// but we need to mock the individual firestore functions used by the hook
const mockGetDocs = vi.fn()
const mockGetDoc = vi.fn()
const mockSetDoc = vi.fn()
const mockDeleteDoc = vi.fn()
const mockCollection = vi.fn()
const mockDoc = vi.fn()

vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => mockCollection(...args),
  doc: (...args: unknown[]) => mockDoc(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
}))

// --- Helpers ---

interface TestRecord {
  id: string
  name: string
  isBundled?: boolean
}

function setupElectronAPI(overrides: Partial<typeof window.electronAPI> = {}) {
  window.electronAPI = {
    platform: 'linux',
    getVersion: vi.fn(),
    isOnline: vi.fn(),
    db: {
      findAll: vi.fn(),
      findById: vi.fn(),
      upsert: vi.fn(),
      remove: vi.fn(),
    },
    ...overrides,
  } as unknown as typeof window.electronAPI
}

function clearElectronAPI() {
  delete (window as Record<string, unknown>).electronAPI
}

// --- Tests ---

describe('useDatabase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearElectronAPI()
    mockIsElectron.mockReturnValue(false)
  })

  describe('Electron IPC path', () => {
    beforeEach(() => {
      mockIsElectron.mockReturnValue(true)
      setupElectronAPI()
    })

    afterEach(() => {
      clearElectronAPI()
    })

    describe('findAll', () => {
      it('returns records from IPC and converts booleans', async () => {
        const raw = [
          { id: '1', name: 'Item 1', isBundled: 1 },
          { id: '2', name: 'Item 2', isBundled: 0 },
        ]
        ;(window.electronAPI!.db!.findAll as ReturnType<typeof vi.fn>).mockResolvedValue(raw)

        const { result } = renderHook(() =>
          useDatabase<TestRecord>({ table: 'inspections' })
        )

        let records: TestRecord[] = []
        await act(async () => {
          records = await result.current.findAll()
        })

        expect(window.electronAPI!.db!.findAll).toHaveBeenCalledWith('inspections', undefined)
        expect(records).toHaveLength(2)
        expect(records[0].isBundled).toBe(true)
        expect(records[1].isBundled).toBe(false)
      })

      it('passes filters to IPC findAll', async () => {
        ;(window.electronAPI!.db!.findAll as ReturnType<typeof vi.fn>).mockResolvedValue([])
        const { result } = renderHook(() =>
          useDatabase<TestRecord>({ table: 'items' })
        )

        await act(async () => {
          await result.current.findAll({ status: 'active' })
        })

        expect(window.electronAPI!.db!.findAll).toHaveBeenCalledWith('items', { status: 'active' })
      })

      it('returns empty array when IPC db API is not available', async () => {
        window.electronAPI = {
          platform: 'linux',
          getVersion: vi.fn(),
          isOnline: vi.fn(),
        } as unknown as typeof window.electronAPI

        const { result } = renderHook(() =>
          useDatabase<TestRecord>({ table: 'items' })
        )

        let records: TestRecord[] = []
        await act(async () => {
          records = await result.current.findAll()
        })

        expect(records).toEqual([])
      })

      it('returns empty array and logs error when IPC findAll throws', async () => {
        ;(window.electronAPI!.db!.findAll as ReturnType<typeof vi.fn>).mockRejectedValue(
          new Error('IPC error')
        )

        const { result } = renderHook(() =>
          useDatabase<TestRecord>({ table: 'items' })
        )

        let records: TestRecord[] = []
        await act(async () => {
          records = await result.current.findAll()
        })

        expect(records).toEqual([])
      })
    })

    describe('findById', () => {
      it('returns a single record with boolean conversion', async () => {
        const raw = { id: '1', name: 'Test', isBundled: 1 }
        ;(window.electronAPI!.db!.findById as ReturnType<typeof vi.fn>).mockResolvedValue(raw)

        const { result } = renderHook(() =>
          useDatabase<TestRecord>({ table: 'inspections' })
        )

        let record: TestRecord | null = null
        await act(async () => {
          record = await result.current.findById('1')
        })

        expect(window.electronAPI!.db!.findById).toHaveBeenCalledWith('inspections', '1')
        expect(record).not.toBeNull()
        expect(record!.isBundled).toBe(true)
      })

      it('returns null when result is undefined', async () => {
        ;(window.electronAPI!.db!.findById as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

        const { result } = renderHook(() =>
          useDatabase<TestRecord>({ table: 'items' })
        )

        let record: TestRecord | null = null
        await act(async () => {
          record = await result.current.findById('999')
        })

        expect(record).toBeNull()
      })

      it('returns null when IPC db API is not available', async () => {
        window.electronAPI = {
          platform: 'linux',
          getVersion: vi.fn(),
          isOnline: vi.fn(),
        } as unknown as typeof window.electronAPI

        const { result } = renderHook(() =>
          useDatabase<TestRecord>({ table: 'items' })
        )

        let record: TestRecord | null = null
        await act(async () => {
          record = await result.current.findById('1')
        })

        expect(record).toBeNull()
      })

      it('returns null and logs error when IPC findById throws', async () => {
        ;(window.electronAPI!.db!.findById as ReturnType<typeof vi.fn>).mockRejectedValue(
          new Error('fail')
        )

        const { result } = renderHook(() =>
          useDatabase<TestRecord>({ table: 'items' })
        )

        let record: TestRecord | null = null
        await act(async () => {
          record = await result.current.findById('1')
        })

        expect(record).toBeNull()
      })
    })

    describe('save', () => {
      it('calls IPC upsert with the record', async () => {
        ;(window.electronAPI!.db!.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
          success: true,
        })

        const { result } = renderHook(() =>
          useDatabase<TestRecord>({ table: 'items' })
        )

        await act(async () => {
          await result.current.save({ id: '1', name: 'Test' })
        })

        expect(window.electronAPI!.db!.upsert).toHaveBeenCalledWith('items', {
          id: '1',
          name: 'Test',
        })
      })

      it('throws when IPC db API is not available', async () => {
        window.electronAPI = {
          platform: 'linux',
          getVersion: vi.fn(),
          isOnline: vi.fn(),
        } as unknown as typeof window.electronAPI

        const { result } = renderHook(() =>
          useDatabase<TestRecord>({ table: 'items' })
        )

        await expect(
          act(async () => {
            await result.current.save({ id: '1', name: 'Test' })
          })
        ).rejects.toThrow('IPC database API not available')
      })

      it('throws when IPC upsert fails', async () => {
        ;(window.electronAPI!.db!.upsert as ReturnType<typeof vi.fn>).mockRejectedValue(
          new Error('upsert failed')
        )

        const { result } = renderHook(() =>
          useDatabase<TestRecord>({ table: 'items' })
        )

        await expect(
          act(async () => {
            await result.current.save({ id: '1', name: 'Test' })
          })
        ).rejects.toThrow('upsert failed')
      })
    })

    describe('remove', () => {
      it('calls IPC remove with table and id', async () => {
        ;(window.electronAPI!.db!.remove as ReturnType<typeof vi.fn>).mockResolvedValue({
          success: true,
        })

        const { result } = renderHook(() =>
          useDatabase<TestRecord>({ table: 'items' })
        )

        await act(async () => {
          await result.current.remove('1')
        })

        expect(window.electronAPI!.db!.remove).toHaveBeenCalledWith('items', '1')
      })

      it('throws when IPC db API is not available', async () => {
        window.electronAPI = {
          platform: 'linux',
          getVersion: vi.fn(),
          isOnline: vi.fn(),
        } as unknown as typeof window.electronAPI

        const { result } = renderHook(() =>
          useDatabase<TestRecord>({ table: 'items' })
        )

        await expect(
          act(async () => {
            await result.current.remove('1')
          })
        ).rejects.toThrow('IPC database API not available')
      })

      it('throws when IPC remove fails', async () => {
        ;(window.electronAPI!.db!.remove as ReturnType<typeof vi.fn>).mockRejectedValue(
          new Error('remove failed')
        )

        const { result } = renderHook(() =>
          useDatabase<TestRecord>({ table: 'items' })
        )

        await expect(
          act(async () => {
            await result.current.remove('1')
          })
        ).rejects.toThrow('remove failed')
      })
    })
  })

  describe('Firestore (browser) path', () => {
    beforeEach(() => {
      mockIsElectron.mockReturnValue(false)
    })

    describe('findAll', () => {
      it('returns documents from Firestore collection', async () => {
        const mockDocs = [
          { id: 'doc-1', data: () => ({ name: 'First' }) },
          { id: 'doc-2', data: () => ({ name: 'Second' }) },
        ]
        mockGetDocs.mockResolvedValue({ docs: mockDocs })
        mockCollection.mockReturnValue('col-ref')

        const { result } = renderHook(() =>
          useDatabase<TestRecord>({ table: 'inspections' })
        )

        let records: TestRecord[] = []
        await act(async () => {
          records = await result.current.findAll()
        })

        expect(mockCollection).toHaveBeenCalled()
        expect(records).toHaveLength(2)
        expect(records[0]).toEqual({ id: 'doc-1', name: 'First' })
      })

      it('uses parentPath when provided', async () => {
        mockGetDocs.mockResolvedValue({ docs: [] })
        mockCollection.mockReturnValue('col-ref')

        const { result } = renderHook(() =>
          useDatabase<TestRecord>({
            table: 'expenses',
            parentPath: 'agencies/ag-1',
          })
        )

        await act(async () => {
          await result.current.findAll()
        })

        expect(mockCollection).toHaveBeenCalledWith(
          expect.anything(),
          'users/user-123/agencies/ag-1/expenses'
        )
      })

      it('returns empty array when firestoreDb or userId is missing', async () => {
        // Simulate no user
        const { useAuth } = await import('../contexts/AuthContext')
        ;(useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: null })

        const { result } = renderHook(() =>
          useDatabase<TestRecord>({ table: 'items' })
        )

        let records: TestRecord[] = []
        await act(async () => {
          records = await result.current.findAll()
        })

        expect(records).toEqual([])

        // Restore
        ;(useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: mockUser })
      })
    })

    describe('findById', () => {
      it('returns a document by id', async () => {
        mockDoc.mockReturnValue('doc-ref')
        mockGetDoc.mockResolvedValue({
          exists: () => true,
          id: 'doc-1',
          data: () => ({ name: 'Found' }),
        })

        const { result } = renderHook(() =>
          useDatabase<TestRecord>({ table: 'items' })
        )

        let record: TestRecord | null = null
        await act(async () => {
          record = await result.current.findById('doc-1')
        })

        expect(record).toEqual({ id: 'doc-1', name: 'Found' })
      })

      it('returns null when document does not exist', async () => {
        mockDoc.mockReturnValue('doc-ref')
        mockGetDoc.mockResolvedValue({
          exists: () => false,
        })

        const { result } = renderHook(() =>
          useDatabase<TestRecord>({ table: 'items' })
        )

        let record: TestRecord | null = null
        await act(async () => {
          record = await result.current.findById('missing')
        })

        expect(record).toBeNull()
      })

      it('uses parentPath when provided for findById', async () => {
        mockDoc.mockReturnValue('doc-ref')
        mockGetDoc.mockResolvedValue({ exists: () => false })

        const { result } = renderHook(() =>
          useDatabase<TestRecord>({
            table: 'expenses',
            parentPath: 'agencies/ag-1',
          })
        )

        await act(async () => {
          await result.current.findById('exp-1')
        })

        expect(mockDoc).toHaveBeenCalledWith(
          expect.anything(),
          'users/user-123/agencies/ag-1/expenses',
          'exp-1'
        )
      })
    })

    describe('save', () => {
      it('calls setDoc with the record', async () => {
        mockDoc.mockReturnValue('doc-ref')
        mockSetDoc.mockResolvedValue(undefined)

        const { result } = renderHook(() =>
          useDatabase<TestRecord>({ table: 'items' })
        )

        await act(async () => {
          await result.current.save({ id: 'doc-1', name: 'Saved' })
        })

        expect(mockSetDoc).toHaveBeenCalledWith('doc-ref', {
          id: 'doc-1',
          name: 'Saved',
        })
      })

      it('does nothing when userId is missing', async () => {
        const { useAuth } = await import('../contexts/AuthContext')
        ;(useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: null })

        const { result } = renderHook(() =>
          useDatabase<TestRecord>({ table: 'items' })
        )

        await act(async () => {
          await result.current.save({ id: '1', name: 'Test' })
        })

        expect(mockSetDoc).not.toHaveBeenCalled()

        ;(useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: mockUser })
      })
    })

    describe('remove', () => {
      it('calls deleteDoc on the correct document reference', async () => {
        mockDoc.mockReturnValue('doc-ref')
        mockDeleteDoc.mockResolvedValue(undefined)

        const { result } = renderHook(() =>
          useDatabase<TestRecord>({ table: 'items' })
        )

        await act(async () => {
          await result.current.remove('doc-1')
        })

        expect(mockDeleteDoc).toHaveBeenCalledWith('doc-ref')
      })

      it('uses parentPath for remove', async () => {
        mockDoc.mockReturnValue('doc-ref')
        mockDeleteDoc.mockResolvedValue(undefined)

        const { result } = renderHook(() =>
          useDatabase<TestRecord>({
            table: 'expenses',
            parentPath: 'agencies/ag-1',
          })
        )

        await act(async () => {
          await result.current.remove('exp-1')
        })

        expect(mockDoc).toHaveBeenCalledWith(
          expect.anything(),
          'users/user-123/agencies/ag-1/expenses',
          'exp-1'
        )
      })
    })
  })
})
