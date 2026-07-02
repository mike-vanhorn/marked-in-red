// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  applyMapFilters,
  getMissingYear,
  getStateProvinceOptions,
} from './filter-cases'
import type { Case, MapFilters } from './types'

function buildCase(overrides: Partial<Case>): Case {
  return {
    id: 'test-case',
    name: 'Test Case',
    photo_url: null,
    tribal_affiliation: 'Sample Nation',
    date_missing: '2022-06-21',
    date_found: null,
    status: 'missing',
    age_at_disappearance: null,
    location_name: 'Test Location',
    latitude: 46.8,
    longitude: -100.7,
    location_unknown: false,
    location_precision: 'city',
    country: 'US',
    state_province: 'ND',
    summary: 'Test summary.',
    source_urls: [],
    source_database: 'SAMPLE',
    additional_info: {},
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const OPEN_FILTERS: MapFilters = {
  statuses: [],
  yearRange: [1950, 2100],
  stateProvince: null,
  tribalNation: null,
  ageRange: null,
}

describe('getMissingYear', () => {
  it('reads the year from date_missing', () => {
    expect(getMissingYear(buildCase({ date_missing: '2019-11-02' }))).toBe(2019)
  })
})

describe('applyMapFilters', () => {
  const cases = [
    buildCase({ id: 'a', status: 'missing', date_missing: '2024-01-15' }),
    buildCase({
      id: 'b',
      status: 'murdered',
      date_missing: '2010-06-21',
      state_province: 'NM',
    }),
    buildCase({
      id: 'c',
      status: 'resolved',
      date_missing: '1998-03-08',
      state_province: 'MB',
      tribal_affiliation: 'Demonstration Community',
      age_at_disappearance: 24,
    }),
  ]

  it('returns every case when all filters are open', () => {
    expect(applyMapFilters(cases, OPEN_FILTERS)).toHaveLength(3)
  })

  it('treats an empty status list as no status filter', () => {
    const result = applyMapFilters(cases, { ...OPEN_FILTERS, statuses: [] })
    expect(result.map((item) => item.id)).toEqual(['a', 'b', 'c'])
  })

  it('filters by one or more statuses', () => {
    const result = applyMapFilters(cases, {
      ...OPEN_FILTERS,
      statuses: ['missing', 'murdered'],
    })
    expect(result.map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('applies the year range inclusively at both bounds', () => {
    const result = applyMapFilters(cases, {
      ...OPEN_FILTERS,
      yearRange: [1998, 2010],
    })
    expect(result.map((item) => item.id)).toEqual(['b', 'c'])
  })

  it('filters by state/province when set', () => {
    const result = applyMapFilters(cases, {
      ...OPEN_FILTERS,
      stateProvince: 'NM',
    })
    expect(result.map((item) => item.id)).toEqual(['b'])
  })

  it('filters by tribal nation when set', () => {
    const result = applyMapFilters(cases, {
      ...OPEN_FILTERS,
      tribalNation: 'Demonstration Community',
    })
    expect(result.map((item) => item.id)).toEqual(['c'])
  })

  it('excludes cases with no listed age when an age range is set', () => {
    const result = applyMapFilters(cases, {
      ...OPEN_FILTERS,
      ageRange: [18, 30],
    })
    expect(result.map((item) => item.id)).toEqual(['c'])
  })

  it('combines filters with AND semantics', () => {
    const result = applyMapFilters(cases, {
      ...OPEN_FILTERS,
      statuses: ['murdered'],
      yearRange: [2015, 2030],
    })
    expect(result).toHaveLength(0)
  })
})

describe('getStateProvinceOptions', () => {
  it('returns sorted unique values', () => {
    const cases = [
      buildCase({ state_province: 'ND' }),
      buildCase({ state_province: 'MB' }),
      buildCase({ state_province: 'ND' }),
    ]
    expect(getStateProvinceOptions(cases)).toEqual(['MB', 'ND'])
  })
})
