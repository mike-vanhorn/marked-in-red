import type {
  Case,
  CaseDataMetadata,
  CaseDataFile,
  CaseStatus,
  LocationPrecision,
} from './types'

/**
 * Pure logic for turning a NamUs Missing Persons CSV export into the app's
 * `Case` shape. No filesystem or network access lives here — see
 * scripts/build-case-data.mjs for the CLI that reads files, geocodes, and
 * writes public/data/cases-YYYY-MM.json.
 */

export const NAMUS_SOURCE_DATABASE = 'NamUs'

export const NAMUS_CASE_URL_BASE =
  'https://namus.nij.ojp.gov/MissingPersons/Case'

// NamUs "Missing Persons" CSV export column headers, tolerant of the
// couple of variants NamUs has shipped. Header matching is
// case-insensitive and ignores surrounding whitespace.
export const EXPECTED_COLUMNS = {
  caseNumber: ['NamUs Case Number', 'Case Number', 'NamUs Number'],
  name: ['Legal Name', 'Full Name', 'Name'],
  status: ['Case Status', 'Status'],
  dateMissing: ['DLC', 'Date of Last Contact', 'Date Last Seen'],
  city: ['City', 'City Missing From'],
  state: ['State', 'State Missing From'],
  county: ['County', 'County Missing From'],
  tribalAffiliation: ['Tribe', 'Tribal Affiliation', 'Ethnicity'],
  age: ['Age at Missing', 'Missing Age', 'Age When Missing'],
  sex: ['Sex', 'Biological Sex'],
} as const

export type ColumnKey = keyof typeof EXPECTED_COLUMNS

export interface ResolvedColumns {
  [key: string]: string
}

export interface CsvParseResult {
  headers: string[]
  rows: Record<string, string>[]
}

export class MissingColumnsError extends Error {
  constructor(missing: ColumnKey[], actualHeaders: string[]) {
    super(
      `CSV is missing required column(s): ${missing.join(', ')}.\n` +
        `Actual headers found: ${actualHeaders.join(' | ')}`
    )
    this.name = 'MissingColumnsError'
  }
}

/**
 * Minimal RFC 4180 CSV parser: handles quoted fields, escaped quotes
 * ("" inside a quoted field), commas and newlines inside quotes, and
 * both \n and \r\n line endings. No external dependency required for a
 * one-off build script.
 */
export function parseCsv(text: string): CsvParseResult {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i]
    const next = normalized[i + 1]

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"'
        i++
      } else if (char === '"') {
        inQuotes = false
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  const nonEmptyRows = rows.filter(
    (cells) => !(cells.length === 1 && cells[0].trim() === '')
  )

  if (nonEmptyRows.length === 0) {
    return { headers: [], rows: [] }
  }

  const headers = nonEmptyRows[0].map((header) => header.trim())
  const dataRows = nonEmptyRows.slice(1).map((cells) => {
    const record: Record<string, string> = {}
    headers.forEach((header, index) => {
      record[header] = (cells[index] ?? '').trim()
    })
    return record
  })

  return { headers, rows: dataRows }
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase()
}

/**
 * Detects which actual CSV header corresponds to each expected logical
 * column. Throws MissingColumnsError (naming the actual headers seen)
 * rather than silently guessing when a required column can't be found.
 */
export function resolveColumns(
  headers: string[],
  required: ColumnKey[] = ['caseNumber', 'name', 'status']
): ResolvedColumns {
  const normalizedToActual = new Map<string, string>()
  headers.forEach((header) => {
    normalizedToActual.set(normalizeHeader(header), header)
  })

  const resolved: ResolvedColumns = {}
  const missing: ColumnKey[] = []

  for (const key of Object.keys(EXPECTED_COLUMNS) as ColumnKey[]) {
    const candidates = EXPECTED_COLUMNS[key]
    const match = candidates
      .map((candidate) => normalizedToActual.get(normalizeHeader(candidate)))
      .find((value): value is string => value !== undefined)

    if (match) {
      resolved[key] = match
    } else if (required.includes(key)) {
      missing.push(key)
    }
  }

  if (missing.length > 0) {
    throw new MissingColumnsError(missing, headers)
  }

  return resolved
}

// NamUs "Case Status" values seen in exports, mapped to the app's
// CaseStatus enum. Anything unrecognized maps to null and the row is
// dropped and flagged in the summary rather than silently defaulted.
const NAMUS_STATUS_MAP: Record<string, CaseStatus> = {
  'missing': 'missing',
  'open': 'missing',
  'active': 'missing',
  'found deceased': 'murdered',
  'deceased': 'murdered',
  'homicide': 'murdered',
  'found - deceased': 'murdered',
  'found alive': 'found',
  'found': 'found',
  'resolved': 'resolved',
  'closed': 'resolved',
}

export function mapNamusStatus(rawStatus: string): CaseStatus | null {
  const normalized = rawStatus.trim().toLowerCase()
  return NAMUS_STATUS_MAP[normalized] ?? null
}

export function deriveNamusUrl(caseNumber: string): string | null {
  const trimmed = caseNumber.trim()
  if (trimmed.length === 0) {
    return null
  }
  return `${NAMUS_CASE_URL_BASE}#/${encodeURIComponent(trimmed)}`
}

export interface GeocodeResult {
  latitude: number
  longitude: number
  precision: Exclude<LocationPrecision, 'unknown'>
  // True when the coordinates came from a gazetteer entry whose
  // normalized name appears more than once in the same state.
  ambiguous?: boolean
}

export interface GeocodeLookup {
  (city: string, state: string, county?: string): GeocodeResult | undefined
}

export interface NormalizeOptions {
  geocode?: GeocodeLookup
}

export interface NormalizedRowResult {
  case: Case | null
  dropped: boolean
  reason?: string
}

/**
 * Normalizes a single resolved CSV row into a Case, or reports why the
 * row was dropped. Geocoding is injected via `geocode` so this stays a
 * pure function; the build script supplies a lookup backed by the
 * Census batch geocoder cache.
 */
export function normalizeRow(
  row: Record<string, string>,
  columns: ResolvedColumns,
  options: NormalizeOptions = {}
): NormalizedRowResult {
  const caseNumber = row[columns.caseNumber]?.trim() ?? ''
  const name = row[columns.name]?.trim() ?? ''
  const rawStatus = row[columns.status]?.trim() ?? ''
  const city = columns.city ? row[columns.city]?.trim() ?? '' : ''
  const state = columns.state ? row[columns.state]?.trim() ?? '' : ''
  const county = columns.county ? row[columns.county]?.trim() ?? '' : ''
  const tribalAffiliation = columns.tribalAffiliation
    ? row[columns.tribalAffiliation]?.trim() ?? ''
    : ''
  const rawAge = columns.age ? row[columns.age]?.trim() ?? '' : ''
  const dateMissing = columns.dateMissing
    ? row[columns.dateMissing]?.trim() ?? ''
    : ''

  const sourceUrl = deriveNamusUrl(caseNumber)

  if (!name) {
    return { case: null, dropped: true, reason: 'missing name' }
  }

  const status = mapNamusStatus(rawStatus)
  if (!status) {
    return {
      case: null,
      dropped: true,
      reason: `missing or unrecognized status: "${rawStatus}"`,
    }
  }

  if (!sourceUrl) {
    return { case: null, dropped: true, reason: 'missing case number/source URL' }
  }

  // Coordinates are optional only when we explicitly flag the location as
  // unknown; a row with neither is dropped by the validation gate below,
  // matching the "coordinates OR location_unknown: true" rule.
  const geocoded = options.geocode?.(city, state, county)
  const locationUnknown = geocoded === undefined

  const ageNumber = rawAge.length > 0 ? Number.parseInt(rawAge, 10) : NaN
  const age = Number.isFinite(ageNumber) ? ageNumber : null

  const locationName = [city, county].filter(Boolean).join(', ') || city || 'Unknown location'

  const now = new Date().toISOString()

  const caseRecord: Case = {
    id: `namus-${caseNumber.replace(/[^a-zA-Z0-9-]/g, '')}`,
    name,
    photo_url: null,
    tribal_affiliation: tribalAffiliation || 'Not listed',
    date_missing: normalizeDate(dateMissing),
    date_found: null,
    status,
    age_at_disappearance: age,
    location_name: locationName,
    latitude: geocoded?.latitude ?? null,
    longitude: geocoded?.longitude ?? null,
    location_unknown: locationUnknown,
    location_precision: geocoded?.precision ?? 'unknown',
    country: 'US',
    state_province: state,
    summary: `NamUs missing person case for ${name}. Verify all details with the investigating agency via the source link.`,
    source_urls: [sourceUrl],
    source_database: NAMUS_SOURCE_DATABASE,
    additional_info: {},
    created_at: now,
    updated_at: now,
  }

  return validateCase(caseRecord)
}

function normalizeDate(raw: string): string {
  if (!raw) {
    return ''
  }

  // NamUs exports typically use MM/DD/YYYY; fall back to passing through
  // anything already ISO-like (YYYY-MM-DD).
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    return raw.slice(0, 10)
  }

  const usMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (usMatch) {
    const [, month, day, year] = usMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  return raw
}

/**
 * Validation gate: a case is only emitted if it has a name, a status,
 * and a source URL; and it must have either coordinates or an explicit
 * location_unknown: true. This function assumes name/status/source URL
 * were already checked upstream in normalizeRow and re-validates the
 * coordinate/location_unknown invariant as the final gate.
 */
export function validateCase(item: Case): NormalizedRowResult {
  if (!item.name || !item.status || item.source_urls.length === 0) {
    return {
      case: null,
      dropped: true,
      reason: 'missing required field (name, status, or source URL)',
    }
  }

  const hasCoordinates = item.latitude !== null && item.longitude !== null
  if (!hasCoordinates && !item.location_unknown) {
    return {
      case: null,
      dropped: true,
      reason: 'no coordinates and location_unknown not set',
    }
  }

  return { case: item, dropped: false }
}

export interface BuildCaseDataSummary {
  totalRows: number
  emitted: number
  dropped: number
  geocoded: number
  locationUnknown: number
  byPrecision: Record<LocationPrecision, number>
  droppedReasons: { row: number; reason: string }[]
}

export interface BuildCaseDataResult {
  cases: Case[]
  summary: BuildCaseDataSummary
}

export function buildCasesFromRows(
  rows: Record<string, string>[],
  columns: ResolvedColumns,
  options: NormalizeOptions = {}
): BuildCaseDataResult {
  const cases: Case[] = []
  const droppedReasons: { row: number; reason: string }[] = []

  rows.forEach((row, index) => {
    const result = normalizeRow(row, columns, options)
    if (result.case) {
      cases.push(result.case)
    } else {
      droppedReasons.push({
        row: index + 2, // +1 for header row, +1 for 1-indexing
        reason: result.reason ?? 'unknown',
      })
    }
  })

  const geocoded = cases.filter((item) => !item.location_unknown).length
  const locationUnknown = cases.filter((item) => item.location_unknown).length

  const byPrecision: Record<LocationPrecision, number> = {
    address: 0,
    city: 0,
    county: 0,
    state: 0,
    unknown: 0,
  }
  cases.forEach((item) => {
    byPrecision[item.location_precision] += 1
  })

  return {
    cases,
    summary: {
      totalRows: rows.length,
      emitted: cases.length,
      dropped: droppedReasons.length,
      geocoded,
      locationUnknown,
      byPrecision,
      droppedReasons,
    },
  }
}

export function buildMetadata(
  vintage: string,
  summary: BuildCaseDataSummary
): CaseDataMetadata {
  return {
    source: NAMUS_SOURCE_DATABASE,
    vintage,
    generated_at: new Date().toISOString(),
    counts: {
      total: summary.emitted,
      geocoded: summary.geocoded,
      location_unknown: summary.locationUnknown,
      dropped: summary.dropped,
    },
    sample: false,
  }
}

export function buildCaseDataFile(
  vintage: string,
  cases: Case[],
  summary: BuildCaseDataSummary
): CaseDataFile {
  return {
    metadata: buildMetadata(vintage, summary),
    cases,
  }
}

/**
 * US Census Gazetteer support: city (Places) and county centroids used
 * as geocoding fallbacks when the Census batch address geocoder can't
 * match a city/state-only NamUs row. The build script downloads and
 * caches the national Gazetteer files; everything below is pure
 * parse/normalize/lookup logic.
 */

export interface GazetteerRow {
  state: string
  name: string
  latitude: number
  longitude: number
}

/**
 * Parses a Census Gazetteer national file. Recent vintages (2023+) are
 * pipe-delimited; older ones are tab-delimited — the delimiter is
 * detected from the header row. Columns are located by header name
 * (USPS, NAME, INTPTLAT, INTPTLONG) so extra columns like LSAD or
 * GEOIDFQ don't matter. Throws when the required headers are absent.
 */
export function parseGazetteer(text: string): GazetteerRow[] {
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => line.trim().length > 0)

  if (lines.length === 0) {
    return []
  }

  const delimiter = lines[0].includes('|') ? '|' : '\t'
  const headers = lines[0].split(delimiter).map((header) => header.trim())

  const stateIndex = headers.indexOf('USPS')
  const nameIndex = headers.indexOf('NAME')
  const latIndex = headers.indexOf('INTPTLAT')
  const longIndex = headers.indexOf('INTPTLONG')

  if (stateIndex === -1 || nameIndex === -1 || latIndex === -1 || longIndex === -1) {
    throw new Error(
      `Gazetteer file is missing expected columns (USPS, NAME, INTPTLAT, INTPTLONG).\n` +
        `Actual headers found: ${headers.join(' | ')}`
    )
  }

  const rows: GazetteerRow[] = []

  for (const line of lines.slice(1)) {
    const cells = line.split(delimiter)
    const latitude = Number.parseFloat(cells[latIndex]?.trim() ?? '')
    const longitude = Number.parseFloat(cells[longIndex]?.trim() ?? '')

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      continue
    }

    rows.push({
      state: (cells[stateIndex] ?? '').trim().toUpperCase(),
      name: (cells[nameIndex] ?? '').trim(),
      latitude,
      longitude,
    })
  }

  return rows
}

// Census place-type suffixes stripped when normalizing a Places NAME,
// longest first so "city and borough" wins over "borough" and "city".
const PLACE_NAME_SUFFIXES = [
  'consolidated government',
  'metropolitan government',
  'unified government',
  'metro government',
  'city and borough',
  'urban county',
  'zona urbana',
  'municipality',
  'comunidad',
  'borough',
  'village',
  'town',
  'city',
  'cdp',
]

// County-equivalent suffixes for the Gazetteer Counties file: County,
// Parish (LA), Borough / Census Area / City and Borough / Municipality
// (AK), Municipio (PR), and "city" for VA independent cities.
const COUNTY_NAME_SUFFIXES = [
  'city and borough',
  'census area',
  'municipality',
  'municipio',
  'borough',
  'county',
  'parish',
  'city',
]

function stripNameSuffix(name: string, suffixes: string[]): string {
  let normalized = name.trim().toLowerCase()

  // Drop consolidated-city remainders like "Nashville-Davidson
  // metropolitan government (balance)".
  normalized = normalized.replace(/\s*\(balance\)$/, '')

  for (const suffix of suffixes) {
    if (normalized.endsWith(` ${suffix}`)) {
      return normalized.slice(0, -suffix.length - 1).trim()
    }
  }

  return normalized
}

export function normalizePlaceName(name: string): string {
  return stripNameSuffix(name, PLACE_NAME_SUFFIXES)
}

export function normalizeCountyName(name: string): string {
  return stripNameSuffix(name, COUNTY_NAME_SUFFIXES)
}

export interface GazetteerEntry {
  latitude: number
  longitude: number
  ambiguous: boolean
}

export type GazetteerIndex = Map<string, GazetteerEntry>

function gazetteerKey(normalizedName: string, state: string): string {
  return `${normalizedName}|${state.trim().toUpperCase()}`
}

/**
 * Builds a lookup keyed on normalized name + state. When the same
 * normalized name appears more than once in a state, the entry whose
 * raw NAME ends in " city" wins (then first match) and the entry is
 * marked ambiguous so callers can flag it in the run summary.
 */
export function buildGazetteerIndex(
  rows: GazetteerRow[],
  normalize: (name: string) => string
): GazetteerIndex {
  const index: GazetteerIndex = new Map()
  const citySuffixKeys = new Set<string>()

  for (const row of rows) {
    const normalizedName = normalize(row.name)
    if (!normalizedName || !row.state) {
      continue
    }

    const key = gazetteerKey(normalizedName, row.state)
    const isCitySuffix = row.name.trim().toLowerCase().endsWith(' city')
    const existing = index.get(key)

    if (!existing) {
      index.set(key, {
        latitude: row.latitude,
        longitude: row.longitude,
        ambiguous: false,
      })
      if (isCitySuffix) {
        citySuffixKeys.add(key)
      }
      continue
    }

    existing.ambiguous = true

    if (isCitySuffix && !citySuffixKeys.has(key)) {
      existing.latitude = row.latitude
      existing.longitude = row.longitude
      citySuffixKeys.add(key)
    }
  }

  return index
}

export function lookupGazetteer(
  index: GazetteerIndex,
  name: string,
  state: string,
  normalize: (name: string) => string
): GazetteerEntry | undefined {
  const normalizedName = normalize(name)
  if (!normalizedName || !state.trim()) {
    return undefined
  }
  return index.get(gazetteerKey(normalizedName, state))
}
