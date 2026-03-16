import {
  queueSheetWrite,
  processSheetQueue,
  getSheetQueueSize,
  clearSheetQueue,
  type SheetQueueItem,
} from './sheetsSyncQueue'

// Mock dependencies
const mockSyncInspectionRow = vi.fn()

vi.mock('./sheetsSync', () => ({
  syncInspectionRow: (...args: unknown[]) => mockSyncInspectionRow(...args),
}))

// In-memory mock for IndexedDB
let inMemoryStore: Record<string, SheetQueueItem> = {}

const mockDB = {
  put: vi.fn(async (_storeName: string, value: SheetQueueItem) => {
    inMemoryStore[value.id] = { ...value }
    return value.id
  }),
  getAll: vi.fn(async () => Object.values(inMemoryStore).map((v) => ({ ...v }))),
  getAllFromIndex: vi.fn(async (_storeName: string, _indexName: string, inspectionId: string) => {
    return Object.values(inMemoryStore).filter((item) => item.inspectionId === inspectionId)
  }),
  delete: vi.fn(async (_storeName: string, key: string) => {
    delete inMemoryStore[key]
  }),
  clear: vi.fn(async () => {
    inMemoryStore = {}
  }),
}

vi.mock('idb', () => ({
  openDB: vi.fn(async () => mockDB),
}))

// Mock crypto.randomUUID
let uuidCounter = 0
const mockRandomUUID = vi.fn(() => {
  uuidCounter++
  return `uuid-${uuidCounter}`
})

describe('sheetsSyncQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    inMemoryStore = {}
    uuidCounter = 0
    crypto.randomUUID = mockRandomUUID as unknown as typeof crypto.randomUUID
  })

  describe('queueSheetWrite', () => {
    it('creates a new queue item for a new inspection', async () => {
      const id = await queueSheetWrite('insp-123', ['data1', 'data2'], 'sheet-456')

      expect(id).toBe('uuid-1')
      expect(mockDB.put).toHaveBeenCalledWith(
        'queue',
        expect.objectContaining({
          id: 'uuid-1',
          inspectionId: 'insp-123',
          rowData: ['data1', 'data2'],
          spreadsheetId: 'sheet-456',
          status: 'pending',
          retryCount: 0,
        })
      )
    })

    it('coalesces updates for the same inspection', async () => {
      // First call creates a pending item
      inMemoryStore['existing-id'] = {
        id: 'existing-id',
        inspectionId: 'insp-123',
        rowData: ['old-data'],
        spreadsheetId: 'sheet-456',
        status: 'pending',
        retryCount: 0,
        createdAt: 1000,
      }

      const id = await queueSheetWrite('insp-123', ['new-data'], 'sheet-789')

      expect(id).toBe('existing-id')
      expect(mockDB.put).toHaveBeenCalledWith(
        'queue',
        expect.objectContaining({
          id: 'existing-id',
          inspectionId: 'insp-123',
          rowData: ['new-data'],
          spreadsheetId: 'sheet-789',
          status: 'pending',
        })
      )
    })

    it('creates new item if existing item is not pending', async () => {
      inMemoryStore['failed-id'] = {
        id: 'failed-id',
        inspectionId: 'insp-123',
        rowData: ['old-data'],
        spreadsheetId: 'sheet-456',
        status: 'failed',
        retryCount: 5,
        createdAt: 1000,
      }

      const id = await queueSheetWrite('insp-123', ['new-data'], 'sheet-789')

      expect(id).toBe('uuid-1')
    })

    it('sets createdAt to current time', async () => {
      const now = Date.now()
      vi.spyOn(Date, 'now').mockReturnValue(now)

      await queueSheetWrite('insp-456', ['data'], 'sheet-123')

      expect(mockDB.put).toHaveBeenCalledWith(
        'queue',
        expect.objectContaining({ createdAt: now })
      )

      vi.spyOn(Date, 'now').mockRestore()
    })
  })

  describe('processSheetQueue', () => {
    it('processes all pending items', async () => {
      inMemoryStore['item-1'] = {
        id: 'item-1',
        inspectionId: 'insp-1',
        rowData: ['data1'],
        spreadsheetId: 'sheet-1',
        status: 'pending',
        retryCount: 0,
        createdAt: 1000,
      }
      inMemoryStore['item-2'] = {
        id: 'item-2',
        inspectionId: 'insp-2',
        rowData: ['data2'],
        spreadsheetId: 'sheet-2',
        status: 'pending',
        retryCount: 0,
        createdAt: 2000,
      }

      mockSyncInspectionRow.mockResolvedValue(undefined)

      await processSheetQueue()

      expect(mockSyncInspectionRow).toHaveBeenCalledTimes(2)
      expect(mockDB.delete).toHaveBeenCalledTimes(2)
    })

    it('processes retrying items', async () => {
      inMemoryStore['retry-item'] = {
        id: 'retry-item',
        inspectionId: 'insp-3',
        rowData: ['retry-data'],
        spreadsheetId: 'sheet-3',
        status: 'retrying',
        retryCount: 2,
        createdAt: 1000,
      }

      mockSyncInspectionRow.mockResolvedValue(undefined)

      await processSheetQueue()

      expect(mockSyncInspectionRow).toHaveBeenCalledWith('sheet-3', 'insp-3', ['retry-data'])
      expect(mockDB.delete).toHaveBeenCalledWith('queue', 'retry-item')
    })

    it('skips failed items (max retries exceeded)', async () => {
      inMemoryStore['failed-item'] = {
        id: 'failed-item',
        inspectionId: 'insp-4',
        rowData: ['failed-data'],
        spreadsheetId: 'sheet-4',
        status: 'failed',
        retryCount: 5,
        createdAt: 1000,
      }

      await processSheetQueue()

      expect(mockSyncInspectionRow).not.toHaveBeenCalled()
    })

    it('marks item as retrying when sync fails', async () => {
      inMemoryStore['fail-item'] = {
        id: 'fail-item',
        inspectionId: 'insp-5',
        rowData: ['data'],
        spreadsheetId: 'sheet-5',
        status: 'pending',
        retryCount: 0,
        createdAt: 1000,
      }

      mockSyncInspectionRow.mockRejectedValue(new Error('Network error'))

      await processSheetQueue()

      expect(mockDB.put).toHaveBeenCalledWith(
        'queue',
        expect.objectContaining({
          id: 'fail-item',
          status: 'retrying',
          retryCount: 1,
          lastError: 'Network error',
        })
      )
    })

    it('marks item as failed when max retries reached', async () => {
      inMemoryStore['max-retry-item'] = {
        id: 'max-retry-item',
        inspectionId: 'insp-6',
        rowData: ['data'],
        spreadsheetId: 'sheet-6',
        status: 'retrying',
        retryCount: 4, // Will become 5 (MAX_RETRIES)
        createdAt: 1000,
      }

      mockSyncInspectionRow.mockRejectedValue(new Error('Persistent error'))

      await processSheetQueue()

      expect(mockDB.put).toHaveBeenCalledWith(
        'queue',
        expect.objectContaining({
          id: 'max-retry-item',
          status: 'failed',
          retryCount: 5,
        })
      )
    })

    it('handles non-Error exceptions', async () => {
      inMemoryStore['string-error'] = {
        id: 'string-error',
        inspectionId: 'insp-7',
        rowData: ['data'],
        spreadsheetId: 'sheet-7',
        status: 'pending',
        retryCount: 0,
        createdAt: 1000,
      }

      mockSyncInspectionRow.mockRejectedValue('String error message')

      await processSheetQueue()

      expect(mockDB.put).toHaveBeenCalledWith(
        'queue',
        expect.objectContaining({
          lastError: 'String error message',
        })
      )
    })

    it('does nothing when queue is empty', async () => {
      await processSheetQueue()

      expect(mockSyncInspectionRow).not.toHaveBeenCalled()
    })
  })

  describe('getSheetQueueSize', () => {
    it('returns count of pending and retrying items', async () => {
      inMemoryStore['pending-1'] = {
        id: 'pending-1',
        inspectionId: 'insp-1',
        rowData: [],
        spreadsheetId: 'sheet-1',
        status: 'pending',
        retryCount: 0,
        createdAt: 1000,
      }
      inMemoryStore['retrying-1'] = {
        id: 'retrying-1',
        inspectionId: 'insp-2',
        rowData: [],
        spreadsheetId: 'sheet-2',
        status: 'retrying',
        retryCount: 2,
        createdAt: 2000,
      }
      inMemoryStore['failed-1'] = {
        id: 'failed-1',
        inspectionId: 'insp-3',
        rowData: [],
        spreadsheetId: 'sheet-3',
        status: 'failed',
        retryCount: 5,
        createdAt: 3000,
      }

      const size = await getSheetQueueSize()

      expect(size).toBe(2) // Only pending and retrying
    })

    it('returns 0 when queue is empty', async () => {
      const size = await getSheetQueueSize()

      expect(size).toBe(0)
    })

    it('returns 0 when all items are failed', async () => {
      inMemoryStore['failed-only'] = {
        id: 'failed-only',
        inspectionId: 'insp-1',
        rowData: [],
        spreadsheetId: 'sheet-1',
        status: 'failed',
        retryCount: 5,
        createdAt: 1000,
      }

      const size = await getSheetQueueSize()

      expect(size).toBe(0)
    })
  })

  describe('clearSheetQueue', () => {
    it('clears all items from the queue', async () => {
      inMemoryStore['item-1'] = {
        id: 'item-1',
        inspectionId: 'insp-1',
        rowData: [],
        spreadsheetId: 'sheet-1',
        status: 'pending',
        retryCount: 0,
        createdAt: 1000,
      }
      inMemoryStore['item-2'] = {
        id: 'item-2',
        inspectionId: 'insp-2',
        rowData: [],
        spreadsheetId: 'sheet-2',
        status: 'failed',
        retryCount: 5,
        createdAt: 2000,
      }

      await clearSheetQueue()

      expect(mockDB.clear).toHaveBeenCalledWith('queue')
    })
  })
})
