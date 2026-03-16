import { render, screen, waitFor, act } from '@testing-library/react'

let electronEnabled = false

vi.mock('../utils/isElectron', () => ({
  isElectron: () => electronEnabled,
}))

vi.mock('lucide-react', () => ({
  Cloud: (props: any) => <svg data-testid="cloud-icon" {...props} />,
  CloudOff: (props: any) => <svg data-testid="cloud-off-icon" {...props} />,
  RefreshCw: (props: any) => <svg data-testid="refresh-icon" {...props} />,
}))

import SyncIndicator from './SyncIndicator'

const mockIsOnline = vi.fn()
const mockGetState = vi.fn()
const mockGetPendingCount = vi.fn()

describe('SyncIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    electronEnabled = false

    window.electronAPI = {
      platform: 'linux',
      getVersion: vi.fn().mockResolvedValue('1.0.0'),
      isOnline: mockIsOnline,
      sync: {
        getState: mockGetState,
        getPendingCount: mockGetPendingCount,
        push: vi.fn(),
        pull: vi.fn(),
      },
    } as any
  })

  afterEach(() => {
    vi.useRealTimers()
    delete (window as any).electronAPI
  })

  it('returns null when not in Electron environment', () => {
    electronEnabled = false
    const { container } = render(<SyncIndicator />)
    expect(container.innerHTML).toBe('')
  })

  it('shows "Synced" state when online with no pending items', async () => {
    electronEnabled = true
    mockIsOnline.mockResolvedValue(true)
    mockGetState.mockResolvedValue('idle')
    mockGetPendingCount.mockResolvedValue(0)

    await act(async () => {
      render(<SyncIndicator />)
      // Flush microtasks for the async check()
      await vi.runAllTimersAsync()
    })

    expect(screen.getByText('Synced')).toBeInTheDocument()
  })

  it('shows "Offline" state when not online', async () => {
    electronEnabled = true
    mockIsOnline.mockResolvedValue(false)

    await act(async () => {
      render(<SyncIndicator />)
      await vi.runAllTimersAsync()
    })

    expect(screen.getByText('Offline')).toBeInTheDocument()
  })

  it('shows pending count when there are pending items', async () => {
    electronEnabled = true
    mockIsOnline.mockResolvedValue(true)
    mockGetState.mockResolvedValue('idle')
    mockGetPendingCount.mockResolvedValue(3)

    await act(async () => {
      render(<SyncIndicator />)
      await vi.runAllTimersAsync()
    })

    expect(screen.getByText('3 pending')).toBeInTheDocument()
  })

  it('shows "Sync error" when sync state is error', async () => {
    electronEnabled = true
    mockIsOnline.mockResolvedValue(true)
    mockGetState.mockResolvedValue('error')
    mockGetPendingCount.mockResolvedValue(0)

    await act(async () => {
      render(<SyncIndicator />)
      await vi.runAllTimersAsync()
    })

    expect(screen.getByText('Sync error')).toBeInTheDocument()
  })

  it('polls sync state on an interval', async () => {
    electronEnabled = true
    mockIsOnline.mockResolvedValue(true)
    mockGetState.mockResolvedValue('idle')
    mockGetPendingCount.mockResolvedValue(0)

    await act(async () => {
      render(<SyncIndicator />)
      // Flush the initial check() call
      await Promise.resolve()
      await Promise.resolve()
    })

    // Initial check
    expect(mockIsOnline).toHaveBeenCalledTimes(1)

    // Advance by 5 seconds to trigger interval
    await act(async () => {
      vi.advanceTimersByTime(5000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockIsOnline).toHaveBeenCalledTimes(2)
  })

  it('cleans up interval on unmount', async () => {
    electronEnabled = true
    mockIsOnline.mockResolvedValue(true)
    mockGetState.mockResolvedValue('idle')
    mockGetPendingCount.mockResolvedValue(0)

    let unmount: () => void
    await act(async () => {
      const result = render(<SyncIndicator />)
      unmount = result.unmount
      await vi.runAllTimersAsync()
    })

    const callCount = mockIsOnline.mock.calls.length

    unmount!()

    // After unmount, advancing timers should not cause additional calls
    await act(async () => {
      vi.advanceTimersByTime(10000)
    })
    expect(mockIsOnline.mock.calls.length).toBe(callCount)
  })
})
