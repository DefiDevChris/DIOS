import { renderHook, act } from '@testing-library/react'
import { useFileStorage } from './useFileStorage'

// --- Mocks ---

const mockIsElectron = vi.fn(() => false)
vi.mock('../utils/isElectron', () => ({
  isElectron: () => mockIsElectron(),
}))

// --- Helpers ---

function setupElectronAPI() {
  mockIsElectron.mockReturnValue(true)
  window.electronAPI = {
    platform: 'linux',
    getVersion: vi.fn(),
    isOnline: vi.fn(),
    fs: {
      saveFile: vi.fn().mockResolvedValue('/path/to/saved/file.pdf'),
      readFile: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      deleteFile: vi.fn().mockResolvedValue(true),
      listFiles: vi.fn().mockResolvedValue(['file1.pdf', 'file2.pdf']),
    },
  } as unknown as typeof window.electronAPI
}

function clearElectronAPI() {
  delete (window as Record<string, unknown>).electronAPI
}

// --- Tests ---

describe('useFileStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearElectronAPI()
    mockIsElectron.mockReturnValue(false)
  })

  describe('isAvailable', () => {
    it('returns false when not in Electron', () => {
      const { result } = renderHook(() => useFileStorage())
      expect(result.current.isAvailable).toBe(false)
    })

    it('returns true when in Electron', () => {
      setupElectronAPI()
      const { result } = renderHook(() => useFileStorage())
      expect(result.current.isAvailable).toBe(true)
    })
  })

  describe('saveFile', () => {
    it('returns null when not in Electron', async () => {
      const { result } = renderHook(() => useFileStorage())

      let path: string | null = null
      await act(async () => {
        path = await result.current.saveFile(['docs'], 'test.pdf', new ArrayBuffer(4))
      })

      expect(path).toBeNull()
    })

    it('calls electronAPI.fs.saveFile and returns path in Electron', async () => {
      setupElectronAPI()
      const { result } = renderHook(() => useFileStorage())

      const data = new ArrayBuffer(4)
      let path: string | null = null
      await act(async () => {
        path = await result.current.saveFile(['reports', '2026'], 'report.pdf', data)
      })

      expect(window.electronAPI!.fs!.saveFile).toHaveBeenCalledWith(
        ['reports', '2026'],
        'report.pdf',
        data
      )
      expect(path).toBe('/path/to/saved/file.pdf')
    })
  })

  describe('readFile', () => {
    it('returns null when not in Electron', async () => {
      const { result } = renderHook(() => useFileStorage())

      let data: ArrayBuffer | null = null
      await act(async () => {
        data = await result.current.readFile('/some/path.pdf')
      })

      expect(data).toBeNull()
    })

    it('calls electronAPI.fs.readFile and returns data in Electron', async () => {
      setupElectronAPI()
      const { result } = renderHook(() => useFileStorage())

      let data: ArrayBuffer | null = null
      await act(async () => {
        data = await result.current.readFile('/path/to/file.pdf')
      })

      expect(window.electronAPI!.fs!.readFile).toHaveBeenCalledWith('/path/to/file.pdf')
      expect(data).toBeInstanceOf(ArrayBuffer)
    })
  })

  describe('deleteFile', () => {
    it('returns false when not in Electron', async () => {
      const { result } = renderHook(() => useFileStorage())

      let deleted = true
      await act(async () => {
        deleted = await result.current.deleteFile('/some/path.pdf')
      })

      expect(deleted).toBe(false)
    })

    it('calls electronAPI.fs.deleteFile and returns result in Electron', async () => {
      setupElectronAPI()
      const { result } = renderHook(() => useFileStorage())

      let deleted = false
      await act(async () => {
        deleted = await result.current.deleteFile('/path/to/file.pdf')
      })

      expect(window.electronAPI!.fs!.deleteFile).toHaveBeenCalledWith('/path/to/file.pdf')
      expect(deleted).toBe(true)
    })
  })

  describe('listFiles', () => {
    it('returns empty array when not in Electron', async () => {
      const { result } = renderHook(() => useFileStorage())

      let files: string[] = []
      await act(async () => {
        files = await result.current.listFiles(['docs'])
      })

      expect(files).toEqual([])
    })

    it('calls electronAPI.fs.listFiles and returns filenames in Electron', async () => {
      setupElectronAPI()
      const { result } = renderHook(() => useFileStorage())

      let files: string[] = []
      await act(async () => {
        files = await result.current.listFiles(['reports', '2026'])
      })

      expect(window.electronAPI!.fs!.listFiles).toHaveBeenCalledWith(['reports', '2026'])
      expect(files).toEqual(['file1.pdf', 'file2.pdf'])
    })
  })

  describe('hook stability', () => {
    it('returns stable function references across renders', () => {
      setupElectronAPI()
      const { result, rerender } = renderHook(() => useFileStorage())

      const first = result.current
      rerender()
      const second = result.current

      expect(first.saveFile).toBe(second.saveFile)
      expect(first.readFile).toBe(second.readFile)
      expect(first.deleteFile).toBe(second.deleteFile)
      expect(first.listFiles).toBe(second.listFiles)
    })
  })
})
