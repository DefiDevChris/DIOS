import { renderHook, act } from '@testing-library/react'
import { useOnlineStatus } from './useOnlineStatus'

describe('useOnlineStatus', () => {
  const originalOnLine = navigator.onLine

  beforeEach(() => {
    // Default to online
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', {
      value: originalOnLine,
      writable: true,
      configurable: true,
    })
  })

  it('returns true when navigator.onLine is true', () => {
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(true)
  })

  it('returns false when navigator.onLine is false', () => {
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      writable: true,
      configurable: true,
    })

    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(false)
  })

  it('transitions to false when offline event fires', () => {
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(true)

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })

    expect(result.current).toBe(false)
  })

  it('transitions to true when online event fires', () => {
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      writable: true,
      configurable: true,
    })

    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(false)

    act(() => {
      window.dispatchEvent(new Event('online'))
    })

    expect(result.current).toBe(true)
  })

  it('handles multiple transitions', () => {
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(true)

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current).toBe(false)

    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(result.current).toBe(true)

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current).toBe(false)
  })

  it('removes event listeners on unmount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    const { unmount } = renderHook(() => useOnlineStatus())

    // Verify listeners were registered
    const onlineCalls = addSpy.mock.calls.filter(([event]) => event === 'online')
    const offlineCalls = addSpy.mock.calls.filter(([event]) => event === 'offline')
    expect(onlineCalls).toHaveLength(1)
    expect(offlineCalls).toHaveLength(1)

    unmount()

    // Verify listeners were removed
    const removeOnline = removeSpy.mock.calls.filter(([event]) => event === 'online')
    const removeOffline = removeSpy.mock.calls.filter(([event]) => event === 'offline')
    expect(removeOnline).toHaveLength(1)
    expect(removeOffline).toHaveLength(1)

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it('does not update state after unmount when events fire', () => {
    const { result, unmount } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(true)

    unmount()

    // Should not throw or cause state update warnings
    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
  })
})
