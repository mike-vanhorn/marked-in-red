import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@/lib/supabase/server'
import { sampleCaseDataMetadata, sampleCases } from './sample-cases'
import type { Case, CaseDataFile, CaseDataMetadata } from './types'

const DATA_DIR = path.join(process.cwd(), 'public', 'data')
const CASE_DATA_FILENAME_PATTERN = /^cases-(\d{4}-\d{2})\.json$/

function hasSupabaseConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

/**
 * Finds the newest public/data/cases-YYYY-MM.json by vintage (not file
 * mtime, so this is stable regardless of how the file was checked out).
 * Returns null when no generated case data file exists yet, in which
 * case callers fall back to the bundled sample data.
 */
function findLatestCaseDataFile(): string | null {
  let entries: string[]

  try {
    entries = readdirSync(DATA_DIR)
  } catch {
    return null
  }

  const matches = entries
    .map((name) => name.match(CASE_DATA_FILENAME_PATTERN))
    .filter((match): match is RegExpMatchArray => match !== null)
    .sort((a, b) => b[1].localeCompare(a[1]))

  if (matches.length === 0) {
    return null
  }

  return path.join(DATA_DIR, matches[0][0])
}

let cachedCaseDataFile: CaseDataFile | 'none' | undefined

function loadCaseDataFile(): CaseDataFile | null {
  if (cachedCaseDataFile !== undefined) {
    return cachedCaseDataFile === 'none' ? null : cachedCaseDataFile
  }

  const filePath = findLatestCaseDataFile()

  if (!filePath) {
    cachedCaseDataFile = 'none'
    return null
  }

  try {
    const raw = readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw) as CaseDataFile
    cachedCaseDataFile = parsed
    return parsed
  } catch {
    cachedCaseDataFile = 'none'
    return null
  }
}

export async function getCaseDataMetadata(): Promise<CaseDataMetadata> {
  if (hasSupabaseConfig()) {
    // Live Supabase data isn't produced by the static build pipeline, so
    // it has no generated metadata block; treat it as non-sample.
    return {
      source: 'Supabase',
      vintage: 'live',
      generated_at: new Date().toISOString(),
      counts: { total: 0, geocoded: 0, location_unknown: 0, dropped: 0 },
      sample: false,
    }
  }

  const caseDataFile = loadCaseDataFile()
  return caseDataFile?.metadata ?? sampleCaseDataMetadata
}

export async function getCases(): Promise<Case[]> {
  if (!hasSupabaseConfig()) {
    const caseDataFile = loadCaseDataFile()
    return caseDataFile?.cases ?? sampleCases
  }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase.from('cases').select('*')

    if (error || !data || data.length === 0) {
      return sampleCases
    }

    return data as Case[]
  } catch {
    return sampleCases
  }
}

export async function getCaseById(id: string): Promise<Case | null> {
  if (!hasSupabaseConfig()) {
    const caseDataFile = loadCaseDataFile()
    const cases = caseDataFile?.cases ?? sampleCases
    return cases.find((item) => item.id === id) ?? null
  }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('cases')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error || !data) {
      return sampleCases.find((item) => item.id === id) ?? null
    }

    return data as Case
  } catch {
    return sampleCases.find((item) => item.id === id) ?? null
  }
}
