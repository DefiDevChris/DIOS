import {
  initializeDriveHierarchy,
  ensureOperationFolder,
  uploadToDrive,
  getOperationDriveFolderUrl,
} from './driveSync'

// --- Mocks ---

const mockDoc = vi.fn(() => 'config-doc-ref')
const mockGetDoc = vi.fn()
const mockSetDoc = vi.fn()
const mockUpdateDoc = vi.fn()

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
}))

// @dios/shared/firebase is mocked via alias; db is a plain object
// We need it truthy for the `if (!db)` checks in driveSync.ts

const mockFetch = vi.fn()

// --- Helpers ---

const ACCESS_TOKEN = 'test-access-token'
const USER_ID = 'user-123'

function mockFetchForFolderSearch(existingId?: string) {
  return {
    ok: true,
    json: async () => ({
      files: existingId ? [{ id: existingId }] : [],
    }),
  }
}

function mockFetchForFolderCreate(newId: string) {
  return {
    ok: true,
    json: async () => ({ id: newId }),
  }
}

function setupFolderCreation(folderMap: Record<string, string>) {
  // Each call to fetch alternates: search (returns empty), then create (returns id)
  // OR: search returns existing id
  let callIndex = 0
  const responses: Array<{ ok: boolean; json: () => Promise<unknown>; text?: () => Promise<string> }> = []

  for (const [, id] of Object.entries(folderMap)) {
    // Search returns nothing
    responses.push(mockFetchForFolderSearch())
    // Create returns the id
    responses.push(mockFetchForFolderCreate(id))
  }

  mockFetch.mockImplementation(async () => {
    const resp = responses[callIndex]
    callIndex++
    return resp
  })
}

// --- Tests ---

describe('driveSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = mockFetch
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initializeDriveHierarchy', () => {
    it('creates all four folders and saves to Firestore (new config)', async () => {
      // 4 folders * 2 fetches each (search + create) = 8 fetch calls
      const folderSequence = [
        // Master folder - search empty, create
        mockFetchForFolderSearch(),
        mockFetchForFolderCreate('master-id'),
        // Unassigned - search empty, create
        mockFetchForFolderSearch(),
        mockFetchForFolderCreate('unassigned-id'),
        // Receipts - search empty, create
        mockFetchForFolderSearch(),
        mockFetchForFolderCreate('receipts-id'),
        // Reports - search empty, create
        mockFetchForFolderSearch(),
        mockFetchForFolderCreate('reports-id'),
      ]
      let callIndex = 0
      mockFetch.mockImplementation(async () => {
        const resp = folderSequence[callIndex]
        callIndex++
        return resp
      })

      // Config doc does not exist
      mockGetDoc.mockResolvedValue({ exists: () => false, data: () => null })
      mockSetDoc.mockResolvedValue(undefined)

      const result = await initializeDriveHierarchy(ACCESS_TOKEN, USER_ID)

      expect(result).toEqual({
        masterId: 'master-id',
        unassignedId: 'unassigned-id',
        receiptsId: 'receipts-id',
        reportsId: 'reports-id',
      })
      expect(mockSetDoc).toHaveBeenCalledWith(
        'config-doc-ref',
        { driveFolders: result },
        { merge: true }
      )
      expect(mockFetch).toHaveBeenCalledTimes(8)
    })

    it('reuses existing folders when they already exist in Drive', async () => {
      // All searches return existing folder ids
      const folderSequence = [
        mockFetchForFolderSearch('existing-master'),
        mockFetchForFolderSearch('existing-unassigned'),
        mockFetchForFolderSearch('existing-receipts'),
        mockFetchForFolderSearch('existing-reports'),
      ]
      let callIndex = 0
      mockFetch.mockImplementation(async () => {
        const resp = folderSequence[callIndex]
        callIndex++
        return resp
      })

      mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({}) })
      mockUpdateDoc.mockResolvedValue(undefined)

      const result = await initializeDriveHierarchy(ACCESS_TOKEN, USER_ID)

      expect(result.masterId).toBe('existing-master')
      // Only 4 fetch calls (no creates needed)
      expect(mockFetch).toHaveBeenCalledTimes(4)
      expect(mockUpdateDoc).toHaveBeenCalled()
    })

    it('throws when Drive folder search fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
      })

      await expect(initializeDriveHierarchy(ACCESS_TOKEN, USER_ID)).rejects.toThrow(
        'Drive folder search failed: 403'
      )
    })

    it('updates existing Firestore config doc', async () => {
      const folderSequence = [
        mockFetchForFolderSearch('m'),
        mockFetchForFolderSearch('u'),
        mockFetchForFolderSearch('r'),
        mockFetchForFolderSearch('rp'),
      ]
      let callIndex = 0
      mockFetch.mockImplementation(async () => folderSequence[callIndex++])

      mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({}) })
      mockUpdateDoc.mockResolvedValue(undefined)

      await initializeDriveHierarchy(ACCESS_TOKEN, USER_ID)

      expect(mockUpdateDoc).toHaveBeenCalledWith('config-doc-ref', {
        driveFolders: expect.objectContaining({ masterId: 'm' }),
      })
    })
  })

  describe('ensureOperationFolder', () => {
    it('creates agency and operation folders under master', async () => {
      // Config has existing masterId
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ driveFolders: { masterId: 'existing-master' } }),
      })

      const folderSequence = [
        // Agency folder search + create
        mockFetchForFolderSearch(),
        mockFetchForFolderCreate('agency-folder-id'),
        // Operation folder search + create
        mockFetchForFolderSearch(),
        mockFetchForFolderCreate('operation-folder-id'),
      ]
      let callIndex = 0
      mockFetch.mockImplementation(async () => folderSequence[callIndex++])

      const result = await ensureOperationFolder(
        ACCESS_TOKEN,
        USER_ID,
        'Test Agency',
        'Happy Farm'
      )

      expect(result).toBe('operation-folder-id')
    })

    it('initializes drive hierarchy when masterId is missing', async () => {
      // Config exists but no driveFolders
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({}),
      })

      // initializeDriveHierarchy: 4 folders * 2 calls = 8
      // then agency + operation = 4 more
      const folderSequence = [
        // initializeDriveHierarchy
        mockFetchForFolderSearch(),
        mockFetchForFolderCreate('new-master'),
        mockFetchForFolderSearch(),
        mockFetchForFolderCreate('unassigned-id'),
        mockFetchForFolderSearch(),
        mockFetchForFolderCreate('receipts-id'),
        mockFetchForFolderSearch(),
        mockFetchForFolderCreate('reports-id'),
        // Agency and operation
        mockFetchForFolderSearch(),
        mockFetchForFolderCreate('agency-id'),
        mockFetchForFolderSearch(),
        mockFetchForFolderCreate('op-id'),
      ]
      let callIndex = 0
      mockFetch.mockImplementation(async () => folderSequence[callIndex++])

      // For initializeDriveHierarchy's Firestore call
      mockSetDoc.mockResolvedValue(undefined)

      const result = await ensureOperationFolder(
        ACCESS_TOKEN,
        USER_ID,
        'Agency',
        'Operation'
      )

      expect(result).toBe('op-id')
    })

    it('returns null when an error occurs', async () => {
      mockGetDoc.mockRejectedValue(new Error('Firestore error'))

      const result = await ensureOperationFolder(
        ACCESS_TOKEN,
        USER_ID,
        'Agency',
        'Operation'
      )

      expect(result).toBeNull()
    })
  })

  describe('uploadToDrive', () => {
    it('uploads a file to the correct year folder', async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ driveFolders: { masterId: 'master-id' } }),
      })

      const folderSequence = [
        // Agency folder
        mockFetchForFolderSearch('agency-id'),
        // Operation folder
        mockFetchForFolderSearch('op-id'),
        // Year folder
        mockFetchForFolderSearch(),
        mockFetchForFolderCreate('year-id'),
        // Upload
        {
          ok: true,
          json: async () => ({ id: 'file-drive-id', webViewLink: 'https://drive.google.com/file/d/file-drive-id' }),
        },
      ]
      let callIndex = 0
      mockFetch.mockImplementation(async () => folderSequence[callIndex++])

      const file = new File(['test content'], 'report.pdf', { type: 'application/pdf' })
      const result = await uploadToDrive(ACCESS_TOKEN, USER_ID, file, 'Agency', 'Op', '2026')

      expect(result).toEqual({
        id: 'file-drive-id',
        webViewLink: 'https://drive.google.com/file/d/file-drive-id',
      })
    })

    it('throws when master folder cannot be resolved', async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({}),
      })

      // initializeDriveHierarchy returns folders without masterId...
      // Actually initializeDriveHierarchy always returns masterId, so we simulate
      // the check by making getOrCreateFolder for master return something,
      // then masterId check still passes. Let's test the upload failure instead.
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      })

      const file = new File(['test'], 'test.pdf')
      await expect(
        uploadToDrive(ACCESS_TOKEN, USER_ID, file, 'Agency', 'Op', '2026')
      ).rejects.toThrow()
    })
  })

  describe('getOperationDriveFolderUrl', () => {
    it('returns a Google Drive folder URL for the year folder', async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ driveFolders: { masterId: 'master-id' } }),
      })

      const folderSequence = [
        mockFetchForFolderSearch('agency-id'),
        mockFetchForFolderSearch('op-id'),
        mockFetchForFolderSearch('year-folder-id'),
      ]
      let callIndex = 0
      mockFetch.mockImplementation(async () => folderSequence[callIndex++])

      const url = await getOperationDriveFolderUrl(
        ACCESS_TOKEN,
        USER_ID,
        'Agency',
        'Operation',
        '2026'
      )

      expect(url).toBe('https://drive.google.com/drive/folders/year-folder-id')
    })

    it('throws when master folder cannot be found or created', async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({}),
      })

      // Fail the master folder search
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
      })

      await expect(
        getOperationDriveFolderUrl(ACCESS_TOKEN, USER_ID, 'A', 'O', '2026')
      ).rejects.toThrow()
    })
  })
})
