const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina',
  ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
  TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
  PR: 'Puerto Rico', GU: 'Guam', VI: 'U.S. Virgin Islands',
  AS: 'American Samoa', MP: 'Northern Mariana Islands',
}

const STATE_NAMES_TO_ABBR = new Map(
  Object.entries(US_STATES).map(([abbr, name]) => [name.toLowerCase(), abbr])
)

function matchState(text: string): string {
  const trimmed = text.trim()
  const withoutZip = trimmed.replace(/\s*\d{5}(-\d{4})?$/, '').trim()
  const upper = withoutZip.toUpperCase()

  if (US_STATES[upper]) return upper
  const abbr = STATE_NAMES_TO_ABBR.get(withoutZip.toLowerCase())
  if (abbr) return abbr

  return ''
}

function findCounty(segments: readonly string[]): string {
  for (const seg of segments) {
    const trimmed = seg.trim()
    if (/\bcounty\b/i.test(trimmed)) return trimmed
  }
  return ''
}

export function parseAddress(address: string): { city: string; state: string; county: string } {
  const empty = { city: '', state: '', county: '' }

  if (!address || typeof address !== 'string') return { ...empty }

  const segments = address.split(',').map((s) => s.trim()).filter(Boolean)
  if (segments.length === 0) return { ...empty }

  const county = findCounty(segments)

  const last = segments[segments.length - 1]
  const state = matchState(last)

  if (!state) return { ...empty, county }

  const citySegmentIndex = segments.length - 2
  const cityCandidate = citySegmentIndex >= 0 ? segments[citySegmentIndex].trim() : ''
  const city = /\bcounty\b/i.test(cityCandidate) ? '' : cityCandidate

  return { city, state, county }
}

export { US_STATES }
