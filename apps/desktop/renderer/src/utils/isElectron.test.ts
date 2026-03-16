import { isElectron, hasElectronFeature } from './isElectron'

describe('isElectron', () => {
  const originalElectronAPI = window.electronAPI

  afterEach(() => {
    if (originalElectronAPI === undefined) {
      delete (window as any).electronAPI
    } else {
      (window as any).electronAPI = originalElectronAPI
    }
  })

  it('returns false when window.electronAPI is not defined', () => {
    delete (window as any).electronAPI
    expect(isElectron()).toBe(false)
  })

  it('returns true when window.electronAPI is defined', () => {
    ;(window as any).electronAPI = { fs: {}, db: {}, sync: {} }
    expect(isElectron()).toBe(true)
  })

  it('returns false when window.electronAPI is null', () => {
    ;(window as any).electronAPI = null
    expect(isElectron()).toBe(false)
  })

  it('returns false when window.electronAPI is undefined', () => {
    ;(window as any).electronAPI = undefined
    expect(isElectron()).toBe(false)
  })
})

describe('hasElectronFeature', () => {
  const originalElectronAPI = window.electronAPI

  afterEach(() => {
    if (originalElectronAPI === undefined) {
      delete (window as any).electronAPI
    } else {
      (window as any).electronAPI = originalElectronAPI
    }
  })

  it('returns false when not in Electron environment', () => {
    delete (window as any).electronAPI
    expect(hasElectronFeature('fs')).toBe(false)
    expect(hasElectronFeature('db')).toBe(false)
    expect(hasElectronFeature('sync')).toBe(false)
  })

  it('returns true when feature exists on electronAPI', () => {
    ;(window as any).electronAPI = { fs: { readFile: vi.fn() }, db: { findAll: vi.fn() }, sync: {} }
    expect(hasElectronFeature('fs')).toBe(true)
    expect(hasElectronFeature('db')).toBe(true)
    expect(hasElectronFeature('sync')).toBe(true)
  })

  it('returns false when feature is not present on electronAPI', () => {
    ;(window as any).electronAPI = {}
    expect(hasElectronFeature('fs')).toBe(false)
    expect(hasElectronFeature('db')).toBe(false)
    expect(hasElectronFeature('sync')).toBe(false)
  })

  it('returns false when feature is null', () => {
    ;(window as any).electronAPI = { fs: null, db: null, sync: null }
    expect(hasElectronFeature('fs')).toBe(false)
    expect(hasElectronFeature('db')).toBe(false)
  })
})
