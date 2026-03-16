import {
  requestLocalFolder,
  getStoredLocalFolder,
  writeLocalFile,
} from './localFsSync'

// --- Mocks ---

vi.mock('@dios/shared', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  },
}))

// --- IndexedDB polyfill for jsdom ---
// jsdom does not provide indexedDB, so we create a minimal fake that the
// localFsSync module can open. Each test that exercises getStoredLocalFolder
// or requestLocalFolder (which store/retrieve handles via IndexedDB) will
// configure `fakeIDBStore` to control what `get()` returns.

let fakeIDBStore: Record<string, unknown> = {}

function createFakeIDBRequest(result: unknown): IDBRequest {
  const req = {
    result,
    error: null,
    onsuccess: null as ((ev: Event) => void) | null,
    onerror: null as ((ev: Event) => void) | null,
    readyState: 'done',
    source: null,
    transaction: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }
  // Schedule onsuccess callback in a microtask so it fires after the caller sets it
  Promise.resolve().then(() => {
    if (typeof req.onsuccess === 'function') {
      req.onsuccess({ target: req } as unknown as Event)
    }
  })
  return req as unknown as IDBRequest
}

function createFakeObjectStore(): IDBObjectStore {
  return {
    put: vi.fn((_value: unknown, _key?: unknown) => createFakeIDBRequest(undefined)),
    get: vi.fn((key: string) => createFakeIDBRequest(fakeIDBStore[key] ?? null)),
    add: vi.fn(),
    clear: vi.fn(),
    count: vi.fn(),
    delete: vi.fn(),
    getAll: vi.fn(),
    getAllKeys: vi.fn(),
    getKey: vi.fn(),
    openCursor: vi.fn(),
    openKeyCursor: vi.fn(),
    createIndex: vi.fn(),
    deleteIndex: vi.fn(),
    index: vi.fn(),
    name: 'handles',
    keyPath: null,
    indexNames: { length: 0, contains: vi.fn(), item: vi.fn() } as unknown as DOMStringList,
    transaction: {} as IDBTransaction,
    autoIncrement: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as IDBObjectStore
}

function installFakeIndexedDB() {
  const store = createFakeObjectStore()

  const fakeDB = {
    objectStoreNames: {
      length: 1,
      contains: vi.fn(() => true),
      item: vi.fn(() => 'handles'),
    } as unknown as DOMStringList,
    createObjectStore: vi.fn(() => store),
    transaction: vi.fn(() => ({
      objectStore: vi.fn(() => store),
      oncomplete: null,
      onerror: null,
      onabort: null,
    })),
    close: vi.fn(),
    name: 'dois_studio_fs_db',
    version: 1,
    deleteObjectStore: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onabort: null,
    onclose: null,
    onerror: null,
    onversionchange: null,
  }

  const fakeIndexedDB = {
    open: vi.fn((_name: string, _version?: number) => {
      const openReq = {
        result: fakeDB,
        error: null,
        onsuccess: null as ((ev: Event) => void) | null,
        onerror: null as ((ev: Event) => void) | null,
        onupgradeneeded: null as ((ev: Event) => void) | null,
        onblocked: null as ((ev: Event) => void) | null,
        readyState: 'done',
        source: null,
        transaction: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }
      Promise.resolve().then(() => {
        // Fire onupgradeneeded if set (first open)
        if (typeof openReq.onupgradeneeded === 'function') {
          openReq.onupgradeneeded({
            target: openReq,
            oldVersion: 0,
            newVersion: 1,
          } as unknown as Event)
        }
        // Fire onsuccess
        if (typeof openReq.onsuccess === 'function') {
          openReq.onsuccess({ target: openReq } as unknown as Event)
        }
      })
      return openReq
    }),
    deleteDatabase: vi.fn(),
    cmp: vi.fn(),
    databases: vi.fn(),
  }

  Object.defineProperty(globalThis, 'indexedDB', {
    value: fakeIndexedDB,
    writable: true,
    configurable: true,
  })

  return { fakeDB, store }
}

// --- Tests ---

describe('localFsSync', () => {
  const originalShowDirectoryPicker = (window as Record<string, unknown>).showDirectoryPicker

  let fakeIDB: ReturnType<typeof installFakeIndexedDB>

  beforeEach(() => {
    vi.clearAllMocks()
    fakeIDBStore = {}
    fakeIDB = installFakeIndexedDB()
  })

  afterEach(() => {
    if (originalShowDirectoryPicker !== undefined) {
      ;(window as Record<string, unknown>).showDirectoryPicker = originalShowDirectoryPicker
    } else {
      delete (window as Record<string, unknown>).showDirectoryPicker
    }
  })

  describe('requestLocalFolder', () => {
    it('returns null when File System Access API is not supported', async () => {
      delete (window as Record<string, unknown>).showDirectoryPicker

      const result = await requestLocalFolder()
      expect(result).toBeNull()
    })

    it('calls showDirectoryPicker and returns the handle', async () => {
      const mockHandle = {
        kind: 'directory',
        name: 'test-folder',
      } as unknown as FileSystemDirectoryHandle

      ;(window as Record<string, unknown>).showDirectoryPicker = vi.fn().mockResolvedValue(mockHandle)

      const result = await requestLocalFolder()
      expect(result).toBe(mockHandle)
      expect((window as Record<string, unknown>).showDirectoryPicker).toHaveBeenCalledWith({
        mode: 'readwrite',
        startIn: 'documents',
      })
    })

    it('returns null when user cancels picker', async () => {
      ;(window as Record<string, unknown>).showDirectoryPicker = vi
        .fn()
        .mockRejectedValue(new DOMException('User cancelled', 'AbortError'))

      const result = await requestLocalFolder()
      expect(result).toBeNull()
    })
  })

  describe('getStoredLocalFolder', () => {
    it('returns null when File System Access API is not supported', async () => {
      delete (window as Record<string, unknown>).showDirectoryPicker

      const result = await getStoredLocalFolder()
      expect(result).toBeNull()
    })

    it('returns null when no handle is stored in IndexedDB', async () => {
      ;(window as Record<string, unknown>).showDirectoryPicker = vi.fn()
      // fakeIDBStore is empty, so get() returns null

      const result = await getStoredLocalFolder()
      expect(result).toBeNull()
    })

    it('returns handle when permission is already granted', async () => {
      ;(window as Record<string, unknown>).showDirectoryPicker = vi.fn()

      const mockHandle = {
        kind: 'directory',
        name: 'stored-folder',
        queryPermission: vi.fn().mockResolvedValue('granted'),
        requestPermission: vi.fn(),
      }
      fakeIDBStore['dois_studio_local_folder_handle'] = mockHandle

      const result = await getStoredLocalFolder()
      expect(result).toBe(mockHandle)
      expect(mockHandle.queryPermission).toHaveBeenCalledWith({ mode: 'readwrite' })
    })

    it('requests permission when status is prompt and requestIfPrompt is true', async () => {
      ;(window as Record<string, unknown>).showDirectoryPicker = vi.fn()

      const mockHandle = {
        kind: 'directory',
        name: 'stored-folder',
        queryPermission: vi.fn().mockResolvedValue('prompt'),
        requestPermission: vi.fn().mockResolvedValue('granted'),
      }
      fakeIDBStore['dois_studio_local_folder_handle'] = mockHandle

      const result = await getStoredLocalFolder(true)
      expect(result).toBe(mockHandle)
      expect(mockHandle.requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' })
    })

    it('returns null when status is prompt but requestIfPrompt is false', async () => {
      ;(window as Record<string, unknown>).showDirectoryPicker = vi.fn()

      const mockHandle = {
        kind: 'directory',
        name: 'stored-folder',
        queryPermission: vi.fn().mockResolvedValue('prompt'),
        requestPermission: vi.fn(),
      }
      fakeIDBStore['dois_studio_local_folder_handle'] = mockHandle

      const result = await getStoredLocalFolder(false)
      expect(result).toBeNull()
      expect(mockHandle.requestPermission).not.toHaveBeenCalled()
    })

    it('returns handle when queryPermission/requestPermission are not available', async () => {
      ;(window as Record<string, unknown>).showDirectoryPicker = vi.fn()

      const mockHandle = {
        kind: 'directory',
        name: 'legacy-folder',
        // No queryPermission or requestPermission
      }
      fakeIDBStore['dois_studio_local_folder_handle'] = mockHandle

      const result = await getStoredLocalFolder()
      expect(result).toBe(mockHandle)
    })

    it('returns null when permission request is denied', async () => {
      ;(window as Record<string, unknown>).showDirectoryPicker = vi.fn()

      const mockHandle = {
        kind: 'directory',
        queryPermission: vi.fn().mockResolvedValue('prompt'),
        requestPermission: vi.fn().mockResolvedValue('denied'),
      }
      fakeIDBStore['dois_studio_local_folder_handle'] = mockHandle

      const result = await getStoredLocalFolder(true)
      expect(result).toBeNull()
    })
  })

  describe('writeLocalFile', () => {
    it('navigates subdirectories and writes the file', async () => {
      const mockWritable = {
        write: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      }
      const mockFileHandle = {
        createWritable: vi.fn().mockResolvedValue(mockWritable),
      }
      const innerDir = {
        getDirectoryHandle: vi.fn().mockResolvedValue({
          getFileHandle: vi.fn().mockResolvedValue(mockFileHandle),
          getDirectoryHandle: vi.fn(),
        }),
        getFileHandle: vi.fn().mockResolvedValue(mockFileHandle),
      }
      const outerDir = {
        getDirectoryHandle: vi.fn().mockResolvedValue(innerDir),
        getFileHandle: vi.fn(),
      } as unknown as FileSystemDirectoryHandle

      const file = new File(['hello'], 'test.txt', { type: 'text/plain' })

      await writeLocalFile(outerDir, ['subfolder', 'nested'], file)

      expect(outerDir.getDirectoryHandle).toHaveBeenCalledWith('subfolder', { create: true })
      expect(innerDir.getDirectoryHandle).toHaveBeenCalledWith('nested', { create: true })
    })

    it('writes file to root directory handle when pathArray is empty', async () => {
      const mockWritable = {
        write: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      }
      const mockFileHandle = {
        createWritable: vi.fn().mockResolvedValue(mockWritable),
      }
      const dirHandle = {
        getDirectoryHandle: vi.fn(),
        getFileHandle: vi.fn().mockResolvedValue(mockFileHandle),
      } as unknown as FileSystemDirectoryHandle

      const file = new File(['data'], 'report.pdf', { type: 'application/pdf' })

      await writeLocalFile(dirHandle, [], file)

      expect(dirHandle.getFileHandle).toHaveBeenCalledWith('report.pdf', { create: true })
      expect(mockWritable.write).toHaveBeenCalledWith(file)
      expect(mockWritable.close).toHaveBeenCalled()
    })

    it('throws when file write fails', async () => {
      const dirHandle = {
        getFileHandle: vi.fn().mockRejectedValue(new Error('Write denied')),
        getDirectoryHandle: vi.fn(),
      } as unknown as FileSystemDirectoryHandle

      const file = new File(['data'], 'test.txt')

      await expect(writeLocalFile(dirHandle, [], file)).rejects.toThrow('Write denied')
    })
  })
})
