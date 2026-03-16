import {
  queueFile,
  getQueueItems,
  getQueueSize,
  processQueue,
  startBackgroundSync,
  stopBackgroundSync,
  type QueueItemMetadata,
  type QueueItem,
} from './syncQueue'

// --- Mocks ---

vi.mock('@dios/shared', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  },
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => 'mock-doc-ref'),
  updateDoc: vi.fn().mockResolvedValue(undefined),
}))

// Mock localFsSync
vi.mock('./localFsSync', () => ({
  getStoredLocalFolder: vi.fn().mockResolvedValue(null),
  writeLocalFile: vi.fn().mockResolvedValue(undefined),
}))

// --- idb mock ---
// The syncQueue module uses `idb` (the `openDB` wrapper). We mock it to use an in-memory store.

let inMemoryStore: Record<string, QueueItem> = {}
let statusIndex: Record<string, QueueItem[]> = {}

function rebuildIndex() {
  statusIndex = {}
  for (const item of Object.values(inMemoryStore)) {
    if (!statusIndex[item.status]) statusIndex[item.status] = []
    statusIndex[item.status].push(item)
  }
}

const mockDB = {
  put: vi.fn(async (_storeName: string, value: QueueItem) => {
    inMemoryStore[value.id] = { ...value }
    rebuildIndex()
    return value.id
  }),
  getAll: vi.fn(async () => Object.values(inMemoryStore).map((v) => ({ ...v }))),
  count: vi.fn(async () => Object.keys(inMemoryStore).length),
  delete: vi.fn(async (_storeName: string, key: string) => {
    delete inMemoryStore[key]
    rebuildIndex()
  }),
  get: vi.fn(async (_storeName: string, key: string) => {
    return inMemoryStore[key] ? { ...inMemoryStore[key] } : undefined
  }),
}

vi.mock('idb', () => ({
  openDB: vi.fn(async () => mockDB),
}))

// --- Helpers ---

const mockFetch = vi.fn()
const originalNavigatorOnLine = navigator.onLine

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    value,
    writable: true,
    configurable: true,
  })
}

function createMetadata(overrides: Partial<QueueItemMetadata> = {}): QueueItemMetadata {
  return {
    fileName: 'test-file.pdf',
    year: 2026,
    uid: 'user-123',
    ...overrides,
  }
}

// Mock crypto.randomUUID
let uuidCounter = 0
const originalRandomUUID = crypto.randomUUID
const mockRandomUUID = vi.fn(() => {
  uuidCounter++
  return `uuid-${uuidCounter}`
})

// --- Tests ---

describe('syncQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    inMemoryStore = {}
    rebuildIndex()
    uuidCounter = 0
    globalThis.fetch = mockFetch
    setOnline(true)
    crypto.randomUUID = mockRandomUUID as unknown as typeof crypto.randomUUID
  })

  afterEach(() => {
    stopBackgroundSync()
    crypto.randomUUID = originalRandomUUID
    Object.defineProperty(navigator, 'onLine', {
      value: originalNavigatorOnLine,
      writable: true,
      configurable: true,
    })
  })

  describe('queueFile', () => {
    it('adds a file to the queue and returns an id', async () => {
      const blob = new Blob(['test data'], { type: 'application/pdf' })
      const metadata = createMetadata()

      const id = await queueFile(blob, metadata)

      expect(id).toBe('uuid-1')
      expect(mockDB.put).toHaveBeenCalledWith('FileQueue', expect.objectContaining({
        id: 'uuid-1',
        blob,
        metadata,
        status: 'pending',
        retryCount: 0,
      }))
    })

    it('assigns unique ids to multiple queued files', async () => {
      const blob = new Blob(['data'])
      const id1 = await queueFile(blob, createMetadata({ fileName: 'file1.pdf' }))
      const id2 = await queueFile(blob, createMetadata({ fileName: 'file2.pdf' }))

      expect(id1).not.toBe(id2)
    })

    it('sets createdAt to current time', async () => {
      const now = Date.now()
      vi.spyOn(Date, 'now').mockReturnValue(now)

      await queueFile(new Blob(['data']), createMetadata())

      expect(mockDB.put).toHaveBeenCalledWith(
        'FileQueue',
        expect.objectContaining({ createdAt: now })
      )

      vi.spyOn(Date, 'now').mockRestore()
    })
  })

  describe('getQueueItems', () => {
    it('returns all items in the queue', async () => {
      // Pre-populate
      inMemoryStore['a'] = {
        id: 'a',
        blob: new Blob(),
        metadata: createMetadata(),
        status: 'pending',
        retryCount: 0,
        createdAt: 1000,
      }
      inMemoryStore['b'] = {
        id: 'b',
        blob: new Blob(),
        metadata: createMetadata(),
        status: 'failed',
        retryCount: 1,
        createdAt: 2000,
      }

      const items = await getQueueItems()
      expect(items).toHaveLength(2)
    })

    it('returns empty array when queue is empty', async () => {
      const items = await getQueueItems()
      expect(items).toHaveLength(0)
    })
  })

  describe('getQueueSize', () => {
    it('returns the count of items', async () => {
      inMemoryStore['a'] = {
        id: 'a',
        blob: new Blob(),
        metadata: createMetadata(),
        status: 'pending',
        retryCount: 0,
        createdAt: 1000,
      }

      const size = await getQueueSize()
      expect(size).toBe(1)
    })
  })

  describe('processQueue', () => {
    it('does nothing when offline', async () => {
      setOnline(false)
      inMemoryStore['a'] = {
        id: 'a',
        blob: new Blob(),
        metadata: createMetadata(),
        status: 'pending',
        retryCount: 0,
        createdAt: 1000,
      }

      await processQueue('token')

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('does nothing when access token is null', async () => {
      inMemoryStore['a'] = {
        id: 'a',
        blob: new Blob(),
        metadata: createMetadata(),
        status: 'pending',
        retryCount: 0,
        createdAt: 1000,
      }

      await processQueue(null)

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('does nothing when queue is empty', async () => {
      await processQueue('token')

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('processes pending items and removes on success', async () => {
      inMemoryStore['item-1'] = {
        id: 'item-1',
        blob: new Blob(['file data'], { type: 'application/pdf' }),
        metadata: createMetadata({ fileName: 'receipt.pdf', year: 2026, uid: 'user-123' }),
        status: 'pending',
        retryCount: 0,
        createdAt: 1000,
      }

      // Setup fetch responses:
      // 1. findOrCreateFolder for master (search finds existing)
      // 2. findOrCreateFolder for target folder (search finds existing)
      // 3. findOrCreateFolder for year (search finds existing)
      // 4. uploadFileToDrive - init resumable upload
      // 5. uploadFileToDrive - PUT upload
      const fetchResponses = [
        // Master folder search
        { ok: true, json: async () => ({ files: [{ id: 'master-id' }] }) },
        // Target folder (Unassigned Uploads) search
        { ok: true, json: async () => ({ files: [{ id: 'target-id' }] }) },
        // Year folder search
        { ok: true, json: async () => ({ files: [{ id: 'year-id' }] }) },
        // Resumable upload init
        {
          ok: true,
          headers: new Headers({ Location: 'https://upload.googleapis.com/resumable/123' }),
          json: async () => ({}),
        },
        // Actual upload
        { ok: true, json: async () => ({ id: 'drive-file-id' }) },
      ]
      let fetchIndex = 0
      mockFetch.mockImplementation(async () => fetchResponses[fetchIndex++])

      await processQueue('access-token')

      // Item should be deleted from the store
      expect(mockDB.delete).toHaveBeenCalledWith('FileQueue', 'item-1')
    })

    it('marks items as failed when upload errors occur', async () => {
      inMemoryStore['item-fail'] = {
        id: 'item-fail',
        blob: new Blob(['data']),
        metadata: createMetadata(),
        status: 'pending',
        retryCount: 0,
        createdAt: 1000,
      }

      // Master folder search succeeds, but target folder search fails
      const fetchResponses = [
        { ok: true, json: async () => ({ files: [{ id: 'master-id' }] }) },
        { ok: false, status: 500, text: async () => 'Server error' },
      ]
      let fetchIndex = 0
      mockFetch.mockImplementation(async () => fetchResponses[fetchIndex++])

      await processQueue('access-token')

      // Item should be updated as failed with retry count incremented
      const putCalls = mockDB.put.mock.calls.filter(
        ([, item]: [string, QueueItem]) => item.id === 'item-fail' && item.status === 'failed'
      )
      expect(putCalls.length).toBeGreaterThan(0)
      const failedItem = putCalls[putCalls.length - 1][1] as QueueItem
      expect(failedItem.retryCount).toBe(1)
      expect(failedItem.lastError).toContain('500')
    })

    it('skips items that have exceeded max retries', async () => {
      inMemoryStore['maxed-out'] = {
        id: 'maxed-out',
        blob: new Blob(['data']),
        metadata: createMetadata(),
        status: 'failed',
        retryCount: 5, // MAX_RETRIES
        createdAt: 1000,
        lastAttemptAt: 1000,
      }

      // Master folder search (still called to set up processing)
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ files: [{ id: 'master-id' }] }),
      })

      await processQueue('access-token')

      // The maxed-out item should not trigger any upload (no delete or put with 'uploading')
      const uploadingPuts = mockDB.put.mock.calls.filter(
        ([, item]: [string, QueueItem]) => item.id === 'maxed-out' && item.status === 'uploading'
      )
      expect(uploadingPuts).toHaveLength(0)
    })

    it('skips items in uploading status', async () => {
      inMemoryStore['uploading-item'] = {
        id: 'uploading-item',
        blob: new Blob(['data']),
        metadata: createMetadata(),
        status: 'uploading',
        retryCount: 0,
        createdAt: 1000,
        lastAttemptAt: Date.now(), // recent, so not stale
      }

      await processQueue('access-token')

      // No fetch calls for this item since it's not eligible
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('recovers stale uploading items that are older than 2 minutes', async () => {
      const twoMinutesAgo = Date.now() - 130_000
      inMemoryStore['stale-item'] = {
        id: 'stale-item',
        blob: new Blob(['data']),
        metadata: createMetadata(),
        status: 'uploading',
        retryCount: 0,
        createdAt: 1000,
        lastAttemptAt: twoMinutesAgo,
      }

      await processQueue('access-token')

      // The stale item should be marked as failed
      const failedPuts = mockDB.put.mock.calls.filter(
        ([, item]: [string, QueueItem]) => item.id === 'stale-item' && item.status === 'failed'
      )
      expect(failedPuts.length).toBeGreaterThan(0)
    })

    it('respects exponential backoff for failed items', async () => {
      // Failed item with lastAttemptAt very recent - should be skipped due to backoff
      inMemoryStore['backoff-item'] = {
        id: 'backoff-item',
        blob: new Blob(['data']),
        metadata: createMetadata(),
        status: 'failed',
        retryCount: 1,
        createdAt: 1000,
        lastAttemptAt: Date.now() - 1000, // 1 second ago, but backoff is 2000ms
      }

      await processQueue('access-token')

      // Should not process this item (no fetch calls)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('updates Firestore doc with drive file ID when firestoreDocPath is provided', async () => {
      inMemoryStore['with-path'] = {
        id: 'with-path',
        blob: new Blob(['data']),
        metadata: createMetadata({
          firestoreDocPath: 'users/user-123/expenses/exp-1',
          firestoreField: 'receiptFileId',
        }),
        status: 'pending',
        retryCount: 0,
        createdAt: 1000,
      }

      const fetchResponses = [
        { ok: true, json: async () => ({ files: [{ id: 'master-id' }] }) },
        { ok: true, json: async () => ({ files: [{ id: 'target-id' }] }) },
        { ok: true, json: async () => ({ files: [{ id: 'year-id' }] }) },
        {
          ok: true,
          headers: new Headers({ Location: 'https://upload.example.com/session' }),
          json: async () => ({}),
        },
        { ok: true, json: async () => ({ id: 'uploaded-drive-id' }) },
      ]
      let fetchIndex = 0
      mockFetch.mockImplementation(async () => fetchResponses[fetchIndex++])

      const { updateDoc, doc } = await import('firebase/firestore')

      await processQueue('access-token')

      expect(doc).toHaveBeenCalledWith(
        expect.anything(),
        'users/user-123/expenses/exp-1'
      )
      expect(updateDoc).toHaveBeenCalledWith('mock-doc-ref', {
        receiptFileId: 'uploaded-drive-id',
      })
    })
  })

  describe('startBackgroundSync / stopBackgroundSync', () => {
    it('starts polling and listening for online events', () => {
      const addEventSpy = vi.spyOn(window, 'addEventListener')
      const getToken = vi.fn().mockReturnValue(null)

      startBackgroundSync(getToken)

      const onlineCalls = addEventSpy.mock.calls.filter(([event]) => event === 'online')
      expect(onlineCalls).toHaveLength(1)

      addEventSpy.mockRestore()
    })

    it('stops polling and removes event listeners', () => {
      const removeEventSpy = vi.spyOn(window, 'removeEventListener')
      const getToken = vi.fn().mockReturnValue(null)

      startBackgroundSync(getToken)
      stopBackgroundSync()

      const removedOnline = removeEventSpy.mock.calls.filter(([event]) => event === 'online')
      expect(removedOnline).toHaveLength(1)

      removeEventSpy.mockRestore()
    })

    it('prevents double-start by stopping existing sync first', () => {
      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
      const getToken = vi.fn().mockReturnValue(null)

      startBackgroundSync(getToken)
      const firstClearCount = clearIntervalSpy.mock.calls.length

      // Starting again should call stopBackgroundSync internally
      startBackgroundSync(getToken)

      // clearInterval should have been called at least once more
      expect(clearIntervalSpy.mock.calls.length).toBeGreaterThan(firstClearCount)

      clearIntervalSpy.mockRestore()
    })

    it('triggers processQueue when online event fires', async () => {
      const getToken = vi.fn().mockReturnValue('token')

      // Queue is empty, so processQueue will return early after checking queue
      startBackgroundSync(getToken)

      // Simulate going online
      window.dispatchEvent(new Event('online'))

      // getToken should have been called (on startup + on online event)
      expect(getToken.mock.calls.length).toBeGreaterThanOrEqual(2)
    })

    it('does not trigger processQueue when token is null', () => {
      const getToken = vi.fn().mockReturnValue(null)

      startBackgroundSync(getToken)

      // processQueue should have been called (via tryProcess) but fetch should not be called
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('stopBackgroundSync is safe to call multiple times', () => {
      stopBackgroundSync()
      stopBackgroundSync()
      // Should not throw
    })
  })
})
