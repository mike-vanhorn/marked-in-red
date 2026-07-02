#!/usr/bin/env node

/**
 * Build public/data/cases-YYYY-MM.json from a manually downloaded NamUs
 * Missing Persons CSV export (filtered to American Indian / Alaska
 * Native).
 *
 * Source download, expected in scripts/.case-src/:
 *
 * NamUs (National Missing and Unidentified Persons System)
 * https://namus.nij.ojp.gov/MissingPersons/Search -> filter Ethnicity to
 * American Indian / Alaska Native -> export results to CSV. Save any
 * number of exported .csv files into scripts/.case-src/ (multiple files
 * are merged).
 *
 * Geocoding fallback chain (each case records its precision):
 *
 *   1. US Census batch geocoder (free, no API key)  -> "address"
 *      https://geocoding.geo.census.gov/geocoder/locations/addressbatch
 *      Results cached in scripts/.case-src/geocode-cache.json so re-runs
 *      don't re-hit the API for addresses already resolved.
 *   2. Census Gazetteer national Places file        -> "city"
 *   3. Census Gazetteer national Counties file      -> "county"
 *   4. Built-in state centroid table                -> "state"
 *   5. Left ungecoded, location_unknown: true       -> "unknown"
 *
 * Gazetteer files (2025 vintage, verified resolving 2026-07-02) are
 * downloaded on demand into scripts/.case-src/ and reused offline on
 * re-runs. They are gitignored -- never committed.
 * https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html
 *
 * Usage:
 *   node scripts/build-case-data.mjs [vintage]
 *   node scripts/build-case-data.mjs 2026-07
 *
 * `vintage` defaults to the current year-month (YYYY-MM) and becomes
 * both the metadata.vintage value and the output filename
 * public/data/cases-<vintage>.json.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import {
  buildCaseDataFile,
  buildCasesFromRows,
  buildGazetteerIndex,
  lookupGazetteer,
  normalizeCountyName,
  normalizePlaceName,
  parseCsv,
  parseGazetteer,
  resolveColumns,
} from '../src/lib/case-data.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')
const sourceDir = resolve(__dirname, '.case-src')
const outputDir = resolve(rootDir, 'public/data')
const geocodeCachePath = resolve(sourceDir, 'geocode-cache.json')

const CENSUS_BATCH_URL =
  'https://geocoding.geo.census.gov/geocoder/locations/addressbatch'
const CENSUS_BENCHMARK = 'Public_AR_Current'
const CENSUS_BATCH_MAX_ROWS = 10000

// US Census Gazetteer national files: city (Places) and county
// centroids. 2025 is the newest vintage that resolves (verified
// 2026-07-02). Downloaded once into scripts/.case-src/ and reused
// offline afterwards.
const GAZETTEER_VINTAGE = '2025'
const GAZETTEER_BASE_URL = `https://www2.census.gov/geo/docs/maps-data/data/gazetteer/${GAZETTEER_VINTAGE}_Gazetteer`
const GAZETTEER_FILES = {
  places: {
    zip: `${GAZETTEER_VINTAGE}_Gaz_place_national.zip`,
    txt: `${GAZETTEER_VINTAGE}_Gaz_place_national.txt`,
  },
  counties: {
    zip: `${GAZETTEER_VINTAGE}_Gaz_counties_national.zip`,
    txt: `${GAZETTEER_VINTAGE}_Gaz_counties_national.txt`,
  },
}

// Last-resort centroids for rows neither the address geocoder nor the
// gazetteer can resolve (bad state code, gazetteer download failure).
const STATE_CENTROIDS = {
  AL: [32.806671, -86.79113], AK: [61.370716, -152.404419], AZ: [33.729759, -111.431221],
  AR: [34.969704, -92.373123], CA: [36.116203, -119.681564], CO: [39.059811, -105.311104],
  CT: [41.597782, -72.755371], DE: [39.318523, -75.507141], FL: [27.766279, -81.686783],
  GA: [33.040619, -83.643074], HI: [21.094318, -157.498337], ID: [44.240459, -114.478828],
  IL: [40.349457, -88.986137], IN: [39.849426, -86.258278], IA: [42.011539, -93.210526],
  KS: [38.5266, -96.726486], KY: [37.66814, -84.670067], LA: [31.169546, -91.867805],
  ME: [44.693947, -69.381927], MD: [39.063946, -76.802101], MA: [42.230171, -71.530106],
  MI: [43.326618, -84.536095], MN: [45.694454, -93.900192], MS: [32.741646, -89.678696],
  MO: [38.456085, -92.288368], MT: [46.921925, -110.454353], NE: [41.12537, -98.268082],
  NV: [38.313515, -117.055374], NH: [43.452492, -71.563896], NJ: [40.298904, -74.521011],
  NM: [34.840515, -106.248482], NY: [42.165726, -74.948051], NC: [35.630066, -79.806419],
  ND: [47.528912, -99.784012], OH: [40.388783, -82.764915], OK: [35.565342, -96.928917],
  OR: [44.572021, -122.070938], PA: [40.590752, -77.209755], RI: [41.680893, -71.51178],
  SC: [33.856892, -80.945007], SD: [44.299782, -99.438828], TN: [35.747845, -86.692345],
  TX: [31.054487, -97.563461], UT: [40.150032, -111.862434], VT: [44.045876, -72.710686],
  VA: [37.769337, -78.169968], WA: [47.400902, -121.490494], WV: [38.491226, -80.954453],
  WI: [44.268543, -89.616508], WY: [42.755966, -107.30249],
}

function printNamusInstructions() {
  console.error(`
No NamUs CSV export found in scripts/.case-src/.

To build case data:

  1. Go to https://namus.nij.ojp.gov/MissingPersons/Search
  2. Filter: Case Type = Missing Persons; Ethnicity = American Indian / Alaska Native
  3. Run the search, then export the results to CSV
  4. Save the exported .csv file(s) into:
       ${sourceDir}
  5. Re-run this script:
       node scripts/build-case-data.mjs

scripts/.case-src/ is gitignored -- CSVs never get committed.
`)
}

function findCsvFiles() {
  if (!existsSync(sourceDir)) {
    return []
  }
  return readdirSync(sourceDir)
    .filter((name) => name.toLowerCase().endsWith('.csv'))
    .map((name) => resolve(sourceDir, name))
}

function loadGeocodeCache() {
  if (!existsSync(geocodeCachePath)) {
    return {}
  }
  try {
    return JSON.parse(readFileSync(geocodeCachePath, 'utf8'))
  } catch (error) {
    console.warn(`Could not parse geocode cache, starting fresh: ${error.message}`)
    return {}
  }
}

function saveGeocodeCache(cache) {
  mkdirSync(sourceDir, { recursive: true })
  writeFileSync(geocodeCachePath, JSON.stringify(cache, null, 2))
}

function cacheKey(city, state) {
  return `${city.trim().toLowerCase()}|${state.trim().toUpperCase()}`
}

/**
 * Batches unresolved city/state pairs to the Census address batch
 * geocoder. The endpoint is built for street addresses, so most
 * city/state-only rows won't match -- those fall back to state
 * centroids (or are left ungeocoded) by resolveGeocode below.
 */
async function geocodeViaCensus(pairs) {
  if (pairs.length === 0) {
    return new Map()
  }

  const results = new Map()

  for (let start = 0; start < pairs.length; start += CENSUS_BATCH_MAX_ROWS) {
    const batch = pairs.slice(start, start + CENSUS_BATCH_MAX_ROWS)

    const csvLines = batch.map(
      ({ city, state }, index) =>
        `${start + index + 1},"${city.replace(/"/g, '""')}",,"${state.replace(/"/g, '""')}",`
    )
    const csvBody = csvLines.join('\n')

    const form = new FormData()
    form.append(
      'addressFile',
      new Blob([csvBody], { type: 'text/csv' }),
      'addresses.csv'
    )
    form.append('benchmark', CENSUS_BENCHMARK)

    let response
    try {
      response = await fetch(CENSUS_BATCH_URL, { method: 'POST', body: form })
    } catch (error) {
      console.warn(`Census geocoder request failed: ${error.message}`)
      continue
    }

    if (!response.ok) {
      console.warn(
        `Census geocoder returned HTTP ${response.status}; skipping this batch.`
      )
      continue
    }

    const text = await response.text()
    // Census batch response has no header row: columns are
    // id, input address, match flag, match type, matched address,
    // coordinates ("lon,lat"), tigerLineId, side. parseCsv assumes a
    // header row, so this response is split and parsed manually instead.
    const rawRows = text
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)

    rawRows.forEach((line) => {
      const cells = splitCensusCsvLine(line)
      const id = Number.parseInt(cells[0], 10)
      const matched = cells[2] === 'Match'
      const coordinates = cells[5]

      if (!matched || !coordinates) {
        return
      }

      const [lon, lat] = coordinates.split(',').map(Number)
      const pairIndex = id - start - 1
      const pair = batch[pairIndex]
      if (!pair || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        return
      }

      results.set(cacheKey(pair.city, pair.state), { latitude: lat, longitude: lon })
    })
  }

  return results
}

function splitCensusCsvLine(line) {
  // Same quoted-CSV shape as parseCsv's format, split manually since
  // this response has no header row.
  const cells = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const next = line[i + 1]

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
      cells.push(field)
      field = ''
    } else {
      field += char
    }
  }
  cells.push(field)
  return cells
}

/**
 * Returns parsed gazetteer rows for `kind` ("places" | "counties"),
 * downloading and unzipping the national file into scripts/.case-src/
 * on first use. Returns null (with a warning) on any failure so the
 * pipeline degrades to the state-centroid fallback instead of dying.
 */
async function ensureGazetteerRows(kind) {
  const { zip, txt } = GAZETTEER_FILES[kind]
  const txtPath = resolve(sourceDir, txt)

  if (!existsSync(txtPath)) {
    const url = `${GAZETTEER_BASE_URL}/${zip}`
    console.log(`Downloading ${kind} gazetteer: ${url}`)

    let response
    try {
      response = await fetch(url)
    } catch (error) {
      console.warn(`Gazetteer download failed (${kind}): ${error.message}`)
      return null
    }

    if (!response.ok) {
      console.warn(`Gazetteer download failed (${kind}): HTTP ${response.status}`)
      return null
    }

    mkdirSync(sourceDir, { recursive: true })
    const zipPath = resolve(sourceDir, zip)
    writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()))

    const result = spawnSync('unzip', ['-o', '-q', zipPath, '-d', sourceDir], {
      stdio: 'inherit',
    })

    if (result.status !== 0 || !existsSync(txtPath)) {
      console.warn(`Could not unzip ${zipPath}; skipping ${kind} gazetteer.`)
      return null
    }
  } else {
    console.log(`Using cached ${kind} gazetteer: ${txtPath}`)
  }

  try {
    return parseGazetteer(readFileSync(txtPath, 'utf8'))
  } catch (error) {
    console.warn(`Could not parse ${kind} gazetteer: ${error.message}`)
    return null
  }
}

/**
 * Full fallback chain: cached Census address match -> city gazetteer ->
 * county gazetteer -> state centroid -> undefined (location_unknown).
 * Every result carries its precision so cases stay honest about how
 * approximate their coordinates are.
 */
function resolveGeocode(city, state, county, { cache, placeIndex, countyIndex }) {
  const key = cacheKey(city, state)
  if (cache[key]) {
    return { ...cache[key], precision: 'address' }
  }

  if (placeIndex && city) {
    const entry = lookupGazetteer(placeIndex, city, state, normalizePlaceName)
    if (entry) {
      return {
        latitude: entry.latitude,
        longitude: entry.longitude,
        precision: 'city',
        ambiguous: entry.ambiguous,
      }
    }
  }

  if (countyIndex && county) {
    const entry = lookupGazetteer(countyIndex, county, state, normalizeCountyName)
    if (entry) {
      return {
        latitude: entry.latitude,
        longitude: entry.longitude,
        precision: 'county',
        ambiguous: entry.ambiguous,
      }
    }
  }

  const stateCentroid = STATE_CENTROIDS[state.trim().toUpperCase()]
  if (stateCentroid) {
    return {
      latitude: stateCentroid[0],
      longitude: stateCentroid[1],
      precision: 'state',
    }
  }

  return undefined
}

function defaultVintage() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

async function main() {
  const vintageArg = process.argv[2]
  const vintage = vintageArg ?? defaultVintage()

  if (vintageArg && !/^\d{4}-\d{2}$/.test(vintageArg)) {
    console.error(`Invalid vintage "${vintageArg}", expected format YYYY-MM.`)
    process.exit(1)
  }

  const csvFiles = findCsvFiles()

  if (csvFiles.length === 0) {
    printNamusInstructions()
    process.exit(1)
  }

  console.log(`Found ${csvFiles.length} CSV file(s) in ${sourceDir}:`)
  csvFiles.forEach((file) => console.log(`  - ${file}`))

  let headers = null
  const allRows = []

  for (const file of csvFiles) {
    const text = readFileSync(file, 'utf8')
    const parsed = parseCsv(text)

    if (parsed.headers.length === 0) {
      console.warn(`Skipping empty CSV: ${file}`)
      continue
    }

    if (headers === null) {
      headers = parsed.headers
    }

    allRows.push(...parsed.rows)
  }

  if (!headers || allRows.length === 0) {
    console.error('No data rows found across the provided CSV file(s).')
    process.exit(1)
  }

  // Fails loudly with the actual header list if expected columns are
  // missing, rather than guessing silently.
  const columns = resolveColumns(headers)

  console.log(`\nColumn mapping detected:`)
  for (const [key, actual] of Object.entries(columns)) {
    console.log(`  ${key} -> "${actual}"`)
  }

  // Geocode unique city/state pairs that aren't already cached.
  const geocodeCache = loadGeocodeCache()
  const uniquePairs = new Map()

  for (const row of allRows) {
    const city = columns.city ? row[columns.city]?.trim() ?? '' : ''
    const state = columns.state ? row[columns.state]?.trim() ?? '' : ''
    if (!city && !state) {
      continue
    }
    const key = cacheKey(city, state)
    if (!geocodeCache[key] && !uniquePairs.has(key)) {
      uniquePairs.set(key, { city, state })
    }
  }

  if (uniquePairs.size > 0) {
    console.log(
      `\nGeocoding ${uniquePairs.size} new city/state pair(s) via US Census batch geocoder...`
    )
    const newResults = await geocodeViaCensus([...uniquePairs.values()])
    newResults.forEach((value, key) => {
      geocodeCache[key] = value
    })
    saveGeocodeCache(geocodeCache)
    console.log(
      `Census geocoder matched ${newResults.size} of ${uniquePairs.size} pair(s); the rest fall back to the gazetteer, state centroids, or are left ungeocoded.`
    )
  } else {
    console.log('\nAll city/state pairs already cached; skipping geocoder call.')
  }

  // City/county centroid fallbacks from the Census Gazetteer. Either
  // index may be null (download/parse failure); the chain degrades to
  // state centroids in that case.
  console.log('')
  const placeRows = await ensureGazetteerRows('places')
  const countyRows = await ensureGazetteerRows('counties')
  const placeIndex = placeRows
    ? buildGazetteerIndex(placeRows, normalizePlaceName)
    : null
  const countyIndex = countyRows
    ? buildGazetteerIndex(countyRows, normalizeCountyName)
    : null

  if (placeIndex) {
    console.log(`City gazetteer loaded: ${placeIndex.size} place(s).`)
  }
  if (countyIndex) {
    console.log(`County gazetteer loaded: ${countyIndex.size} county(ies).`)
  }

  const ambiguousMatches = new Map()

  const geocode = (city, state, county) => {
    if (!city && !state) {
      return undefined
    }
    const result = resolveGeocode(city ?? '', state ?? '', county ?? '', {
      cache: geocodeCache,
      placeIndex,
      countyIndex,
    })
    if (result?.ambiguous) {
      const label = `${city || county}, ${state} (${result.precision})`
      ambiguousMatches.set(label, (ambiguousMatches.get(label) ?? 0) + 1)
    }
    return result
  }

  const { cases, summary } = buildCasesFromRows(allRows, columns, { geocode })

  console.log(`\nSummary:`)
  console.log(`  Total rows read:     ${summary.totalRows}`)
  console.log(`  Cases emitted:       ${summary.emitted}`)
  console.log(`  Geocoded:            ${summary.geocoded}`)
  console.log(`  Location unknown:    ${summary.locationUnknown}`)
  console.log(`  Dropped:             ${summary.dropped}`)
  console.log(`  By precision:        address ${summary.byPrecision.address}, city ${summary.byPrecision.city}, county ${summary.byPrecision.county}, state ${summary.byPrecision.state}, unknown ${summary.byPrecision.unknown}`)

  if (ambiguousMatches.size > 0) {
    console.log(`\nAmbiguous gazetteer matches (same name appears more than once in the state; verify coordinates):`)
    ambiguousMatches.forEach((count, label) => {
      console.log(`  ${label}: ${count} case(s)`)
    })
  }

  if (summary.droppedReasons.length > 0) {
    console.log(`\nDropped/flagged rows:`)
    summary.droppedReasons.forEach(({ row, reason }) => {
      console.log(`  Row ${row}: ${reason}`)
    })
  }

  if (cases.length === 0) {
    console.error('\nNo cases passed validation; refusing to write an empty output file.')
    process.exit(1)
  }

  const outputFile = buildCaseDataFile(vintage, cases, summary)
  mkdirSync(outputDir, { recursive: true })
  const outputPath = resolve(outputDir, `cases-${vintage}.json`)
  writeFileSync(outputPath, JSON.stringify(outputFile, null, 2))

  console.log(`\nWrote ${cases.length} case(s) to ${outputPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
