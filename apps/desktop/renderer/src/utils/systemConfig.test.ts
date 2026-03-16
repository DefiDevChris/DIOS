vi.mock('@dios/shared', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({ id: 'mock-doc-ref' })),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
}))

vi.mock('./isElectron', () => ({
  isElectron: vi.fn(() => false),
}))

import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@dios/shared/firebase'
import { isElectron } from './isElectron'
import { logger } from '@dios/shared'
import { getSystemConfig, saveSystemConfig } from './systemConfig'

const mockIsElectron = isElectron as ReturnType<typeof vi.fn>
const mockGetDoc = getDoc as ReturnType<typeof vi.fn>
const mockSetDoc = setDoc as ReturnType<typeof vi.fn>
const mockDoc = doc as ReturnType<typeof vi.fn>

describe('getSystemConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsElectron.mockReturnValue(false)
    delete (window as any).electronAPI
  })

  describe('Electron path', () => {
    beforeEach(() => {
      mockIsElectron.mockReturnValue(true)
      ;(window as any).electronAPI = {
        db: {
          findAll: vi.fn(),
          upsert: vi.fn(),
        },
      }
    })

    afterEach(() => {
      delete (window as any).electronAPI
    })

    it('reads system_config from SQLite via electronAPI', async () => {
      const mockRows = [
        { key: 'theme', value: '"dark"' },
        { key: 'pageSize', value: '25' },
      ]
      ;(window.electronAPI!.db!.findAll as ReturnType<typeof vi.fn>).mockResolvedValue(mockRows)

      const result = await getSystemConfig('user-1')

      expect(window.electronAPI!.db!.findAll).toHaveBeenCalledWith('system_config')
      expect(result).toEqual({ theme: 'dark', pageSize: 25 })
    })

    it('falls back to raw string value when JSON.parse fails', async () => {
      const mockRows = [
        { key: 'note', value: 'plain text that is not JSON' },
      ]
      ;(window.electronAPI!.db!.findAll as ReturnType<typeof vi.fn>).mockResolvedValue(mockRows)

      const result = await getSystemConfig('user-1')

      expect(result).toEqual({ note: 'plain text that is not JSON' })
    })

    it('returns empty object and logs error when SQLite read fails', async () => {
      ;(window.electronAPI!.db!.findAll as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('sqlite error'))

      const result = await getSystemConfig('user-1')

      expect(result).toEqual({})
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to load system_config from SQLite:',
        expect.any(Error)
      )
    })
  })

  describe('Firestore path', () => {
    it('reads config from Firestore document', async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ theme: 'light', language: 'en' }),
      })

      const result = await getSystemConfig('user-1')

      expect(mockDoc).toHaveBeenCalledWith(db, 'users/user-1/system_settings/config')
      expect(result).toEqual({ theme: 'light', language: 'en' })
    })

    it('returns empty object when document does not exist', async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => false,
        data: () => null,
      })

      const result = await getSystemConfig('user-1')

      expect(result).toEqual({})
    })

    it('returns empty object and logs error when Firestore read fails', async () => {
      mockGetDoc.mockRejectedValue(new Error('firestore error'))

      const result = await getSystemConfig('user-1')

      expect(result).toEqual({})
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to load system_settings/config from Firestore:',
        expect.any(Error)
      )
    })
  })
})

describe('saveSystemConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsElectron.mockReturnValue(false)
    delete (window as any).electronAPI
  })

  describe('Electron path', () => {
    beforeEach(() => {
      mockIsElectron.mockReturnValue(true)
      ;(window as any).electronAPI = {
        db: {
          findAll: vi.fn(),
          upsert: vi.fn().mockResolvedValue(undefined),
        },
      }
    })

    afterEach(() => {
      delete (window as any).electronAPI
    })

    it('upserts each key-value pair to system_config table', async () => {
      await saveSystemConfig('user-1', { theme: 'dark', pageSize: 25 })

      const upsertMock = window.electronAPI!.db!.upsert as ReturnType<typeof vi.fn>
      expect(upsertMock).toHaveBeenCalledTimes(2)
      expect(upsertMock).toHaveBeenCalledWith('system_config', {
        key: 'theme',
        value: 'dark',
        updatedAt: expect.any(String),
      })
      expect(upsertMock).toHaveBeenCalledWith('system_config', {
        key: 'pageSize',
        value: '25',
        updatedAt: expect.any(String),
      })
    })

    it('stores string values as-is without double-quoting', async () => {
      await saveSystemConfig('user-1', { name: 'hello' })

      const upsertMock = window.electronAPI!.db!.upsert as ReturnType<typeof vi.fn>
      expect(upsertMock).toHaveBeenCalledWith('system_config', {
        key: 'name',
        value: 'hello',
        updatedAt: expect.any(String),
      })
    })

    it('JSON-stringifies non-string values', async () => {
      await saveSystemConfig('user-1', { data: { nested: true } })

      const upsertMock = window.electronAPI!.db!.upsert as ReturnType<typeof vi.fn>
      expect(upsertMock).toHaveBeenCalledWith('system_config', {
        key: 'data',
        value: '{"nested":true}',
        updatedAt: expect.any(String),
      })
    })

    it('handles null values with nullish coalescing fallback', async () => {
      // null ?? '' => '', JSON.stringify('') => '""'
      await saveSystemConfig('user-1', { empty: null } as any)

      const upsertMock = window.electronAPI!.db!.upsert as ReturnType<typeof vi.fn>
      expect(upsertMock).toHaveBeenCalledWith('system_config', {
        key: 'empty',
        value: '""',
        updatedAt: expect.any(String),
      })
    })

    it('handles undefined values with nullish coalescing fallback', async () => {
      // undefined ?? '' => '', JSON.stringify('') => '""'
      await saveSystemConfig('user-1', { missing: undefined } as any)

      const upsertMock = window.electronAPI!.db!.upsert as ReturnType<typeof vi.fn>
      expect(upsertMock).toHaveBeenCalledWith('system_config', {
        key: 'missing',
        value: '""',
        updatedAt: expect.any(String),
      })
    })

    it('includes updatedAt as ISO string timestamp', async () => {
      await saveSystemConfig('user-1', { key: 'val' })

      const upsertMock = window.electronAPI!.db!.upsert as ReturnType<typeof vi.fn>
      const call = upsertMock.mock.calls[0][1]
      expect(call.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    it('throws and logs error when SQLite write fails', async () => {
      ;(window.electronAPI!.db!.upsert as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('write error'))

      await expect(saveSystemConfig('user-1', { key: 'val' })).rejects.toThrow('write error')
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to save system_config to SQLite:',
        expect.any(Error)
      )
    })
  })

  describe('Firestore path', () => {
    it('writes config to Firestore with merge', async () => {
      mockSetDoc.mockResolvedValue(undefined)

      await saveSystemConfig('user-1', { theme: 'light' })

      expect(mockDoc).toHaveBeenCalledWith(db, 'users/user-1/system_settings/config')
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.anything(),
        { theme: 'light' },
        { merge: true }
      )
    })

    it('propagates Firestore write errors', async () => {
      mockSetDoc.mockRejectedValue(new Error('Firestore write failed'))

      await expect(
        saveSystemConfig('user-1', { theme: 'light' })
      ).rejects.toThrow('Firestore write failed')
    })
  })
})
