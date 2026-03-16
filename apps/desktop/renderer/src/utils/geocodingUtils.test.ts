vi.mock('@dios/shared', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

import { logger } from '@dios/shared'
import { geocodeAddress, geocodeMissingOperations } from './geocodingUtils'

describe('geocodeAddress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns coordinates on successful geocode', async () => {
    const mockResponse = [{ lat: '40.7128', lon: '-74.006' }]
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response)

    const result = await geocodeAddress('New York, NY')

    expect(result).toEqual({ lat: 40.7128, lng: -74.006 })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('nominatim.openstreetmap.org/search'),
      expect.objectContaining({ headers: { 'User-Agent': 'DIOS-Studio/1.0' } })
    )
  })

  it('includes the address in the request URL', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response)

    await geocodeAddress('123 Main St')

    const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(calledUrl).toContain('q=123%20Main%20St')
  })

  it('returns null when address is empty or whitespace', async () => {
    expect(await geocodeAddress('')).toBeNull()
    expect(await geocodeAddress('   ')).toBeNull()
  })

  it('returns null when no results are returned', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response)

    const result = await geocodeAddress('nonexistent place')

    expect(result).toBeNull()
  })

  it('returns null and logs error when fetch throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'))

    const result = await geocodeAddress('Some Address')

    expect(result).toBeNull()
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Geocoding error'),
      expect.any(Error)
    )
  })
})

describe('geocodeMissingOperations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('geocodes operations that are missing coordinates', async () => {
    const mockResponse = [{ lat: '1.0', lon: '2.0' }]
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response)

    const operations = [
      { id: 'op-1', address: '123 Main St' },
      { id: 'op-2', address: '456 Oak Ave' },
    ]

    const promise = geocodeMissingOperations('user-1', operations)

    // Advance past the 1100ms Nominatim rate-limit delays
    await vi.advanceTimersByTimeAsync(1100)
    await vi.advanceTimersByTimeAsync(1100)

    const results = await promise

    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({ id: 'op-1', lat: 1.0, lng: 2.0 })
    expect(results[1]).toEqual({ id: 'op-2', lat: 1.0, lng: 2.0 })
  })

  it('skips operations that already have coordinates', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ lat: '1', lon: '2' }]),
    } as Response)

    const operations = [
      { id: 'op-1', address: '123 Main St', lat: 10, lng: 20 },
      { id: 'op-2', address: '456 Oak Ave' },
    ]

    const promise = geocodeMissingOperations('user-1', operations)
    await vi.advanceTimersByTimeAsync(1100)
    const results = await promise

    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('op-2')
  })

  it('skips operations with no address', async () => {
    const operations = [
      { id: 'op-1' },
      { id: 'op-2', address: '' },
    ]

    const results = await geocodeMissingOperations('user-1', operations)

    expect(results).toHaveLength(0)
  })

  it('skips operations where geocoding fails', async () => {
    vi.useFakeTimers()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response)

    const operations = [{ id: 'op-1', address: 'nowhere' }]

    const promise = geocodeMissingOperations('user-1', operations)
    await vi.advanceTimersByTimeAsync(1200)
    const results = await promise

    expect(results).toHaveLength(0)
    vi.useRealTimers()
  })

  it('returns empty array for empty operations list', async () => {
    const results = await geocodeMissingOperations('user-1', [])

    expect(results).toEqual([])
  })
})
