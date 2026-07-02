// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  MissingColumnsError,
  buildCasesFromRows,
  buildGazetteerIndex,
  deriveNamusUrl,
  lookupGazetteer,
  mapNamusStatus,
  normalizeCountyName,
  normalizePlaceName,
  normalizeRow,
  parseCsv,
  parseGazetteer,
  resolveColumns,
  validateCase,
} from './case-data'
import type { GeocodeResult } from './case-data'
import type { Case } from './types'

// Obviously synthetic fixture data only -- "Test Person" names, fake
// case numbers, no real identifying details. Mirrors a NamUs Missing
// Persons CSV export filtered to American Indian / Alaska Native.
const FIXTURE_CSV = `NamUs Case Number,Legal Name,Case Status,DLC,City,State,County,Tribe,Age at Missing
MP-TEST-001,Test Person One,Missing,01/15/2024,Fargo,ND,Cass,Sample Nation,29
MP-TEST-002,Test Person Two,Found Deceased,03/03/2022,Rapid City,SD,Pennington,Sample Nation,41
MP-TEST-003,Test Person Three,Resolved,,Nowhere,ZZ,,Sample Nation,
MP-TEST-004,,Missing,05/05/2020,Somewhere,MT,,Sample Nation,19
MP-TEST-005,Test Person Five,Unrecognized Status,02/02/2021,Billings,MT,Yellowstone,Sample Nation,33
,Test Person Six,Missing,06/06/2019,Duluth,MN,,Sample Nation,22
`

function fixedGeocode(city: string, state: string): GeocodeResult | undefined {
  if (state.trim().toUpperCase() === 'ND') {
    return { latitude: 47.5, longitude: -99.8, precision: 'city' }
  }
  if (state.trim().toUpperCase() === 'SD') {
    return { latitude: 44.3, longitude: -99.4, precision: 'state' }
  }
  return undefined
}

describe('parseCsv', () => {
  it('parses headers and rows from a simple CSV', () => {
    const result = parseCsv(FIXTURE_CSV)
    expect(result.headers).toEqual([
      'NamUs Case Number',
      'Legal Name',
      'Case Status',
      'DLC',
      'City',
      'State',
      'County',
      'Tribe',
      'Age at Missing',
    ])
    expect(result.rows).toHaveLength(6)
    expect(result.rows[0]['Legal Name']).toBe('Test Person One')
  })

  it('handles quoted fields containing commas', () => {
    const csv = 'name,note\n"Test, Person","Says ""hi"""\n'
    const result = parseCsv(csv)
    expect(result.rows[0]).toEqual({
      name: 'Test, Person',
      note: 'Says "hi"',
    })
  })

  it('returns empty headers and rows for an empty string', () => {
    expect(parseCsv('')).toEqual({ headers: [], rows: [] })
  })
})

describe('resolveColumns', () => {
  it('maps expected logical columns to actual NamUs headers', () => {
    const { headers } = parseCsv(FIXTURE_CSV)
    const columns = resolveColumns(headers)
    expect(columns.caseNumber).toBe('NamUs Case Number')
    expect(columns.name).toBe('Legal Name')
    expect(columns.status).toBe('Case Status')
    expect(columns.city).toBe('City')
  })

  it('is case-insensitive and trims header whitespace', () => {
    const columns = resolveColumns([' namus case number ', 'legal name', 'CASE STATUS'])
    expect(columns.caseNumber).toBe(' namus case number ')
    expect(columns.status).toBe('CASE STATUS')
  })

  it('throws MissingColumnsError naming the actual headers when a required column is absent', () => {
    expect(() => resolveColumns(['Foo', 'Bar'])).toThrow(MissingColumnsError)

    try {
      resolveColumns(['Foo', 'Bar'])
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(MissingColumnsError)
      expect((error as Error).message).toContain('Foo')
      expect((error as Error).message).toContain('Bar')
    }
  })
})

describe('mapNamusStatus', () => {
  it('maps known NamUs statuses to app statuses', () => {
    expect(mapNamusStatus('Missing')).toBe('missing')
    expect(mapNamusStatus('Found Deceased')).toBe('murdered')
    expect(mapNamusStatus('Found Alive')).toBe('found')
    expect(mapNamusStatus('Resolved')).toBe('resolved')
  })

  it('is case-insensitive and trims whitespace', () => {
    expect(mapNamusStatus('  missing  ')).toBe('missing')
  })

  it('returns null for unrecognized statuses', () => {
    expect(mapNamusStatus('Unrecognized Status')).toBeNull()
    expect(mapNamusStatus('')).toBeNull()
  })
})

describe('deriveNamusUrl', () => {
  it('builds the NamUs case URL from a case number', () => {
    expect(deriveNamusUrl('MP-TEST-001')).toBe(
      'https://namus.nij.ojp.gov/MissingPersons/Case#/MP-TEST-001'
    )
  })

  it('returns null for an empty case number', () => {
    expect(deriveNamusUrl('')).toBeNull()
    expect(deriveNamusUrl('   ')).toBeNull()
  })
})

describe('normalizeRow', () => {
  const { headers, rows } = parseCsv(FIXTURE_CSV)
  const columns = resolveColumns(headers)

  it('normalizes a valid row into a Case with a derived source URL', () => {
    const result = normalizeRow(rows[0], columns, { geocode: fixedGeocode })
    expect(result.dropped).toBe(false)
    expect(result.case).toMatchObject({
      id: 'namus-MP-TEST-001',
      name: 'Test Person One',
      status: 'missing',
      date_missing: '2024-01-15',
      state_province: 'ND',
      latitude: 47.5,
      longitude: -99.8,
      location_unknown: false,
      location_precision: 'city',
      source_database: 'NamUs',
      source_urls: ['https://namus.nij.ojp.gov/MissingPersons/Case#/MP-TEST-001'],
    })
  })

  it('records the precision reported by the geocode lookup', () => {
    const result = normalizeRow(rows[1], columns, { geocode: fixedGeocode })
    expect(result.case?.location_precision).toBe('state')
  })

  it('maps Found Deceased to murdered', () => {
    const result = normalizeRow(rows[1], columns, { geocode: fixedGeocode })
    expect(result.case?.status).toBe('murdered')
  })

  it('flags location_unknown with unknown precision when geocoding does not resolve', () => {
    const result = normalizeRow(rows[2], columns, { geocode: fixedGeocode })
    expect(result.case?.location_unknown).toBe(true)
    expect(result.case?.latitude).toBeNull()
    expect(result.case?.longitude).toBeNull()
    expect(result.case?.location_precision).toBe('unknown')
  })

  it('drops a row with no name', () => {
    const result = normalizeRow(rows[3], columns, { geocode: fixedGeocode })
    expect(result.dropped).toBe(true)
    expect(result.case).toBeNull()
    expect(result.reason).toMatch(/name/)
  })

  it('drops a row with an unrecognized status', () => {
    const result = normalizeRow(rows[4], columns, { geocode: fixedGeocode })
    expect(result.dropped).toBe(true)
    expect(result.reason).toMatch(/status/)
  })

  it('drops a row with no case number (no source URL)', () => {
    const result = normalizeRow(rows[5], columns, { geocode: fixedGeocode })
    expect(result.dropped).toBe(true)
    expect(result.reason).toMatch(/case number|source URL/)
  })
})

describe('validateCase', () => {
  function buildValidCase(overrides: Partial<Case> = {}): Case {
    return {
      id: 'namus-MP-TEST-999',
      name: 'Test Person Nine',
      photo_url: null,
      tribal_affiliation: 'Sample Nation',
      date_missing: '2024-01-01',
      date_found: null,
      status: 'missing',
      age_at_disappearance: null,
      location_name: 'Test City',
      latitude: 47.5,
      longitude: -99.8,
      location_unknown: false,
      location_precision: 'city',
      country: 'US',
      state_province: 'ND',
      summary: 'Test summary.',
      source_urls: ['https://namus.nij.ojp.gov/MissingPersons/Case#/MP-TEST-999'],
      source_database: 'NamUs',
      additional_info: {},
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      ...overrides,
    }
  }

  it('accepts a case with coordinates', () => {
    const result = validateCase(buildValidCase())
    expect(result.dropped).toBe(false)
  })

  it('accepts a case with no coordinates when location_unknown is true', () => {
    const result = validateCase(
      buildValidCase({ latitude: null, longitude: null, location_unknown: true })
    )
    expect(result.dropped).toBe(false)
  })

  it('rejects a case with no coordinates and location_unknown false', () => {
    const result = validateCase(
      buildValidCase({ latitude: null, longitude: null, location_unknown: false })
    )
    expect(result.dropped).toBe(true)
  })

  it('rejects a case with no source URLs', () => {
    const result = validateCase(buildValidCase({ source_urls: [] }))
    expect(result.dropped).toBe(true)
  })
})

describe('buildCasesFromRows', () => {
  it('emits valid cases and reports dropped rows with reasons', () => {
    const { headers, rows } = parseCsv(FIXTURE_CSV)
    const columns = resolveColumns(headers)

    const { cases, summary } = buildCasesFromRows(rows, columns, {
      geocode: fixedGeocode,
    })

    expect(summary.totalRows).toBe(6)
    expect(cases).toHaveLength(3)
    expect(summary.emitted).toBe(3)
    expect(summary.dropped).toBe(3)
    expect(summary.geocoded).toBe(2)
    expect(summary.locationUnknown).toBe(1)
    expect(summary.byPrecision).toEqual({
      address: 0,
      city: 1,
      county: 0,
      state: 1,
      unknown: 1,
    })
    expect(summary.droppedReasons).toHaveLength(3)
    expect(cases.every((item) => item.source_database === 'NamUs')).toBe(true)
  })
})

// Synthetic gazetteer fixture only -- fake place names, never the real
// multi-MB Census download. Mirrors the 2025 pipe-delimited national
// Places file layout (header row, USPS/NAME/INTPTLAT/INTPTLONG columns).
const FIXTURE_GAZETTEER_PLACES = `USPS|GEOID|GEOIDFQ|ANSICODE|NAME|LSAD|FUNCSTAT|ALAND|AWATER|ALAND_SQMI|AWATER_SQMI|INTPTLAT|INTPTLONG
ND|0000001|1600000US0000001|00000001|Testville city|25|A|1|1|1.0|1.0|47.1|-100.1
ND|0000002|1600000US0000002|00000002|Faketon town|43|A|1|1|1.0|1.0|47.2|-100.2
SD|0000003|1600000US0000003|00000003|Sampleburg CDP|57|S|1|1|1.0|1.0|44.1|-99.1
MT|0000004|1600000US0000004|00000004|Twinsburg town|43|A|1|1|1.0|1.0|46.1|-110.1
MT|0000005|1600000US0000005|00000005|Twinsburg city|25|A|1|1|1.0|1.0|46.9|-110.9
WA|0000006|1600000US0000006|00000006|Doubleton CDP|57|S|1|1|1.0|1.0|47.3|-121.3
WA|0000007|1600000US0000007|00000007|Doubleton village|47|A|1|1|1.0|1.0|47.8|-121.8
AK|0000008|1600000US0000008|00000008|Mockharbor city and borough|37|A|1|1|1.0|1.0|58.1|-134.1
AK|0000009|1600000US0000009|00000009|Faketown municipality|37|A|1|1|1.0|1.0|61.1|-149.1
TN|0000010|1600000US0000010|00000010|Testville-Mock metropolitan government (balance)|21|A|1|1|1.0|1.0|36.1|-86.1
NM|0000011|1600000US0000011|00000011|Placeholder village|47|A|1|1|1.0|1.0|35.1|-106.1
OK|0000012|1600000US0000012|00000012|Examplton city|25|A|1|1|1.0|1.0|35.4|-97.4
`

const FIXTURE_GAZETTEER_COUNTIES = `USPS|GEOID|GEOIDFQ|ANSICODE|NAME|ALAND|AWATER|ALAND_SQMI|AWATER_SQMI|INTPTLAT|INTPTLONG
ND|00001|0500000US00001|00000101|Testshire County|1|1|1.0|1.0|47.5|-100.5
LA|00002|0500000US00002|00000102|Fakewater Parish|1|1|1.0|1.0|31.1|-91.1
AK|00003|0500000US00003|00000103|Mockmute Census Area|1|1|1.0|1.0|62.1|-163.1
VA|00004|0500000US00004|00000104|Faketown city|1|1|1.0|1.0|37.5|-77.5
`

describe('normalizePlaceName', () => {
  it('lowercases and strips common place-type suffixes', () => {
    expect(normalizePlaceName('Testville city')).toBe('testville')
    expect(normalizePlaceName('Faketon town')).toBe('faketon')
    expect(normalizePlaceName('Sampleburg CDP')).toBe('sampleburg')
    expect(normalizePlaceName('Placeholder village')).toBe('placeholder')
  })

  it('strips compound suffixes before their shorter substrings', () => {
    expect(normalizePlaceName('Mockharbor city and borough')).toBe('mockharbor')
    expect(normalizePlaceName('Faketown municipality')).toBe('faketown')
  })

  it('drops "(balance)" remainders on consolidated cities', () => {
    expect(
      normalizePlaceName('Testville-Mock metropolitan government (balance)')
    ).toBe('testville-mock')
  })

  it('leaves names without a known suffix intact (lowercased)', () => {
    expect(normalizePlaceName('Plainname')).toBe('plainname')
  })
})

describe('normalizeCountyName', () => {
  it('strips county-equivalent suffixes', () => {
    expect(normalizeCountyName('Testshire County')).toBe('testshire')
    expect(normalizeCountyName('Fakewater Parish')).toBe('fakewater')
    expect(normalizeCountyName('Mockmute Census Area')).toBe('mockmute')
    expect(normalizeCountyName('Faketown city')).toBe('faketown')
  })
})

describe('parseGazetteer', () => {
  it('parses the pipe-delimited national Places layout', () => {
    const rows = parseGazetteer(FIXTURE_GAZETTEER_PLACES)
    expect(rows).toHaveLength(12)
    expect(rows[0]).toEqual({
      state: 'ND',
      name: 'Testville city',
      latitude: 47.1,
      longitude: -100.1,
    })
  })

  it('parses tab-delimited files (older vintages)', () => {
    const tabText = [
      'USPS\tGEOID\tNAME\tINTPTLAT\tINTPTLONG',
      'ND\t0000001\tTestville city\t47.1\t-100.1',
    ].join('\n')
    const rows = parseGazetteer(tabText)
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Testville city')
  })

  it('skips rows with unparseable coordinates', () => {
    const text = [
      'USPS|GEOID|NAME|INTPTLAT|INTPTLONG',
      'ND|0000001|Testville city|not-a-number|-100.1',
      'ND|0000002|Faketon town|47.2|-100.2',
    ].join('\n')
    expect(parseGazetteer(text)).toHaveLength(1)
  })

  it('throws loudly with the actual headers when required columns are missing', () => {
    expect(() => parseGazetteer('FOO|BAR\nx|y')).toThrow(/USPS, NAME, INTPTLAT, INTPTLONG/)
    expect(() => parseGazetteer('FOO|BAR\nx|y')).toThrow(/FOO \| BAR/)
  })
})

describe('buildGazetteerIndex / lookupGazetteer', () => {
  const placeIndex = buildGazetteerIndex(
    parseGazetteer(FIXTURE_GAZETTEER_PLACES),
    normalizePlaceName
  )
  const countyIndex = buildGazetteerIndex(
    parseGazetteer(FIXTURE_GAZETTEER_COUNTIES),
    normalizeCountyName
  )

  it('matches on normalized city + state', () => {
    const entry = lookupGazetteer(placeIndex, 'Testville', 'ND', normalizePlaceName)
    expect(entry).toEqual({ latitude: 47.1, longitude: -100.1, ambiguous: false })
  })

  it('matches case-insensitively and with suffixed input', () => {
    expect(
      lookupGazetteer(placeIndex, 'TESTVILLE CITY', 'nd', normalizePlaceName)
    ).toBeDefined()
  })

  it('does not match across states', () => {
    expect(
      lookupGazetteer(placeIndex, 'Testville', 'SD', normalizePlaceName)
    ).toBeUndefined()
  })

  it('prefers the "city"-suffixed entry for in-state duplicates and flags ambiguity', () => {
    const entry = lookupGazetteer(placeIndex, 'Twinsburg', 'MT', normalizePlaceName)
    expect(entry).toEqual({ latitude: 46.9, longitude: -110.9, ambiguous: true })
  })

  it('keeps the first entry for in-state duplicates with no "city" suffix', () => {
    const entry = lookupGazetteer(placeIndex, 'Doubleton', 'WA', normalizePlaceName)
    expect(entry).toEqual({ latitude: 47.3, longitude: -121.3, ambiguous: true })
  })

  it('returns undefined for unknown places and blank input', () => {
    expect(
      lookupGazetteer(placeIndex, 'Nowhere', 'ND', normalizePlaceName)
    ).toBeUndefined()
    expect(lookupGazetteer(placeIndex, '', 'ND', normalizePlaceName)).toBeUndefined()
    expect(
      lookupGazetteer(placeIndex, 'Testville', '', normalizePlaceName)
    ).toBeUndefined()
  })

  it('resolves counties with county-equivalent suffixes in the input', () => {
    expect(
      lookupGazetteer(countyIndex, 'Testshire', 'ND', normalizeCountyName)
    ).toEqual({ latitude: 47.5, longitude: -100.5, ambiguous: false })
    expect(
      lookupGazetteer(countyIndex, 'Fakewater Parish', 'LA', normalizeCountyName)
    ).toEqual({ latitude: 31.1, longitude: -91.1, ambiguous: false })
  })
})
