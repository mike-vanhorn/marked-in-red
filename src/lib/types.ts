export type CaseStatus = 'missing' | 'murdered' | 'found' | 'resolved'
export type LocationPrecision =
  | 'address'
  | 'city'
  | 'county'
  | 'state'
  | 'unknown'
export type Country = 'US' | 'CA'
export type EditStatus = 'live_unverified' | 'approved' | 'rejected' | 'auto_flagged'
export type TrustLevel = 'new' | 'trusted' | 'moderator' | 'admin'
export type TributeStatus = 'pending' | 'approved' | 'rejected'
export type SubscriptionType = 'area_alerts' | 'weekly_digest' | 'both'
export type CaseSortField = 'name' | 'date_missing'
export type SortDirection = 'asc' | 'desc'

export interface Case {
  id: string
  name: string
  photo_url: string | null
  tribal_affiliation: string
  date_missing: string
  date_found: string | null
  status: CaseStatus
  age_at_disappearance: number | null
  location_name: string
  latitude: number | null
  longitude: number | null
  location_unknown: boolean
  location_precision: LocationPrecision
  country: Country
  state_province: string
  summary: string
  source_urls: string[]
  source_database: string
  additional_info: Record<string, string>
  created_at: string
  updated_at: string
}

export interface CaseDataMetadata {
  source: string
  vintage: string
  generated_at: string
  counts: {
    total: number
    geocoded: number
    location_unknown: number
    dropped: number
  }
  sample: boolean
}

export interface CaseDataFile {
  metadata: CaseDataMetadata
  cases: Case[]
}

export interface WikiEdit {
  id: string
  case_id: string
  user_id: string
  field_changed: string
  old_value: string
  new_value: string
  source_citation: string
  edit_status: EditStatus
  submitted_at: string
  reviewed_at: string | null
  reviewed_by: string | null
}

export interface UserProfile {
  id: string
  display_name: string
  tribal_affiliation: string | null
  contribution_count: number
  trust_level: TrustLevel
  created_at: string
}

export interface Tribute {
  id: string
  case_id: string
  user_id: string
  text: string
  tribute_status: TributeStatus
  submitted_at: string
  reviewed_at: string | null
}

export interface NewsletterSubscription {
  id: string
  email: string
  subscription_type: SubscriptionType
  state_province: string | null
  country: Country | null
  subscribed_at: string
  unsubscribed_at: string | null
}

export interface CaseGeoJSON {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: {
    id: string
    name: string
    status: CaseStatus
    tribal_affiliation: string
    date_missing: string
    location_name: string
  }
}

export interface MapFilters {
  statuses: CaseStatus[]
  yearRange: [number, number]
  stateProvince: string | null
  tribalNation: string | null
  ageRange: [number, number] | null
}

export interface CaseFilters extends MapFilters {
  query: string
  countries: Country[]
  sortField: CaseSortField
  sortDirection: SortDirection
}
