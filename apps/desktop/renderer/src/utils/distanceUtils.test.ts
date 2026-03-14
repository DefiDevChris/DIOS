vi.mock('@dios/shared', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

import { formatDistance, formatDriveTime } from './distanceUtils'

describe('formatDistance', () => {
  it('formats 0 miles', () => {
    expect(formatDistance(0)).toBe('0.0 mi')
  })

  it('formats a value with one decimal place', () => {
    expect(formatDistance(12.3)).toBe('12.3 mi')
  })

  it('rounds to one decimal place', () => {
    expect(formatDistance(100.456)).toBe('100.5 mi')
  })

  it('formats a very small value', () => {
    expect(formatDistance(0.05)).toBe('0.1 mi')
  })
})

describe('formatDriveTime', () => {
  it('formats 0 minutes', () => {
    expect(formatDriveTime(0)).toBe('0 min')
  })

  it('formats 30 minutes as minutes only', () => {
    expect(formatDriveTime(30)).toBe('30 min')
  })

  it('formats 59 minutes as minutes only', () => {
    expect(formatDriveTime(59)).toBe('59 min')
  })

  it('formats exactly 60 minutes as hours only', () => {
    expect(formatDriveTime(60)).toBe('1 hrs')
  })

  it('formats 90 minutes as hours and minutes', () => {
    expect(formatDriveTime(90)).toBe('1 hrs 30 min')
  })

  it('formats 150 minutes as hours and minutes', () => {
    expect(formatDriveTime(150)).toBe('2 hrs 30 min')
  })

  it('formats 121 minutes as hours and minutes', () => {
    expect(formatDriveTime(121)).toBe('2 hrs 1 min')
  })
})
