import { parseAddress, US_STATES } from './addressParser'

describe('addressParser', () => {
  describe('parseAddress', () => {
    describe('basic parsing', () => {
      it('parses a standard US address', () => {
        const result = parseAddress('123 Main St, Springfield, IL 62701')

        expect(result.city).toBe('Springfield')
        expect(result.state).toBe('IL')
        expect(result.county).toBe('')
      })

      it('parses address with full state name and returns abbreviation', () => {
        const result = parseAddress('456 Oak Ave, Chicago, Illinois')

        expect(result.city).toBe('Chicago')
        expect(result.state).toBe('IL')
      })

      it('parses address with county', () => {
        const result = parseAddress('789 Farm Rd, Sangamon County, Springfield, IL')

        expect(result.city).toBe('Springfield')
        expect(result.state).toBe('IL')
        expect(result.county).toBe('Sangamon County')
      })

      it('handles address with only state', () => {
        const result = parseAddress('CA')

        expect(result.city).toBe('')
        expect(result.state).toBe('CA')
        expect(result.county).toBe('')
      })

      it('handles address with city and state only', () => {
        const result = parseAddress('Los Angeles, CA')

        expect(result.city).toBe('Los Angeles')
        expect(result.state).toBe('CA')
        expect(result.county).toBe('')
      })
    })

    describe('edge cases', () => {
      it('returns empty values for empty string', () => {
        const result = parseAddress('')

        expect(result).toEqual({ city: '', state: '', county: '' })
      })

      it('returns empty values for null input', () => {
        const result = parseAddress(null as unknown as string)

        expect(result).toEqual({ city: '', state: '', county: '' })
      })

      it('returns empty values for undefined input', () => {
        const result = parseAddress(undefined as unknown as string)

        expect(result).toEqual({ city: '', state: '', county: '' })
      })

      it('returns empty values for non-string input', () => {
        const result = parseAddress(123 as unknown as string)

        expect(result).toEqual({ city: '', state: '', county: '' })
      })

      it('handles whitespace-only input', () => {
        const result = parseAddress('   ')

        expect(result).toEqual({ city: '', state: '', county: '' })
      })

      it('handles address with no recognizable state', () => {
        const result = parseAddress('123 Main St, Some City')

        expect(result.city).toBe('')
        expect(result.state).toBe('')
      })
    })

    describe('ZIP code handling', () => {
      it('extracts state from address with 5-digit ZIP', () => {
        const result = parseAddress('123 Main St, Austin, TX 78701')

        expect(result.state).toBe('TX')
        expect(result.city).toBe('Austin')
      })

      it('extracts state from address with ZIP+4', () => {
        const result = parseAddress('456 Oak Ave, Denver, CO 80202-1234')

        expect(result.state).toBe('CO')
        expect(result.city).toBe('Denver')
      })

      it('handles state abbreviation with trailing whitespace and ZIP', () => {
        const result = parseAddress('789 Pine St, Seattle, WA  98101')

        expect(result.state).toBe('WA')
        expect(result.city).toBe('Seattle')
      })
    })

    describe('state matching', () => {
      it('matches uppercase state abbreviation', () => {
        const result = parseAddress('City, NY')

        expect(result.state).toBe('NY')
      })

      it('matches lowercase full state name and returns abbreviation', () => {
        const result = parseAddress('City, new york')

        expect(result.state).toBe('NY')
      })

      it('matches mixed case full state name and returns abbreviation', () => {
        const result = parseAddress('City, New York')

        expect(result.state).toBe('NY')
      })

      it('handles District of Columbia', () => {
        const result = parseAddress('123 K St NW, Washington, DC 20001')

        expect(result.state).toBe('DC')
        expect(result.city).toBe('Washington')
      })
    })

    describe('county detection', () => {
      it('detects county when "County" is in a segment', () => {
        const result = parseAddress('123 Farm Rd, Cook County, Chicago, IL')

        expect(result.county).toBe('Cook County')
      })

      it('detects county case-insensitively', () => {
        const result = parseAddress('123 Farm Rd, COOK COUNTY, Chicago, IL')

        expect(result.county).toBe('COOK COUNTY')
      })

      it('does not set city when city segment contains "county"', () => {
        const result = parseAddress('123 Rd, Some County, TX')

        expect(result.city).toBe('')
        expect(result.county).toBe('Some County')
      })
    })

    describe('complex addresses', () => {
      it('parses full address with street, city, state, ZIP', () => {
        const result = parseAddress('1600 Pennsylvania Avenue NW, Washington, DC 20500')

        expect(result.city).toBe('Washington')
        expect(result.state).toBe('DC')
      })

      it('parses address with multiple commas', () => {
        const result = parseAddress('Apt 5B, 123 Main St, Suite 100, New York, NY 10001')

        expect(result.city).toBe('New York')
        expect(result.state).toBe('NY')
      })

      it('handles rural route addresses', () => {
        const result = parseAddress('RR 1 Box 100, Rural Town, IA 50001')

        expect(result.city).toBe('Rural Town')
        expect(result.state).toBe('IA')
      })
    })
  })

  describe('US_STATES constant', () => {
    it('contains all 50 states plus DC and US territories', () => {
      expect(Object.keys(US_STATES)).toHaveLength(56)
    })

    it('has correct mapping for California', () => {
      expect(US_STATES.CA).toBe('California')
    })

    it('has correct mapping for New York', () => {
      expect(US_STATES.NY).toBe('New York')
    })

    it('has correct mapping for Texas', () => {
      expect(US_STATES.TX).toBe('Texas')
    })

    it('has correct mapping for DC', () => {
      expect(US_STATES.DC).toBe('District of Columbia')
    })

    it('uses uppercase abbreviations', () => {
      Object.keys(US_STATES).forEach((abbr) => {
        expect(abbr).toBe(abbr.toUpperCase())
      })
    })

    it('has two-letter abbreviations', () => {
      Object.keys(US_STATES).forEach((abbr) => {
        expect(abbr).toHaveLength(2)
      })
    })
  })
})
