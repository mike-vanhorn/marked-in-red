# Data Policy

This document covers how case data enters Marked in Red, how it's kept
current, and the rules governing photos, verification language, and
review before publishing an update. It applies to the NamUs pipeline in
`scripts/build-case-data.mjs` and the resulting `public/data/cases-YYYY-MM.json`
files.

## Inclusion criteria

A case is only included in a generated data file if it has:

1. A name (NamUs "Legal Name" or equivalent).
2. A recognized case status (see status mapping below).
3. A source URL derived from its NamUs case number.
4. Either geocoded coordinates (`latitude`/`longitude`) or an explicit
   `location_unknown: true` flag.

Rows failing any of these checks are dropped and reported in the build
summary printed by `build-case-data.mjs`, along with a reason (e.g.
"missing name", "no coordinates and location_unknown not set"). Dropped
rows never enter the output file, so nothing partially-formed reaches
the site.

The current pipeline is scoped to NamUs Missing Persons records filtered
to American Indian / Alaska Native. It does not yet ingest the Canadian
MMIWG database or advocacy-org sources named in the project's original
scope (`context.md`); those remain future pipeline work.

## Geocoding & location precision

NamUs exports carry city/county/state, not street addresses, so most
coordinates on the map are approximations. Every case records how
approximate in `location_precision`, populated by this fallback chain
(first hit wins):

| Order | Source                                            | `location_precision` | Meaning |
|-------|----------------------------------------------------|----------------------|---------|
| 1     | US Census batch address geocoder (cached)          | `address`            | Matched a real street address; rare for NamUs rows. |
| 2     | Census Gazetteer national Places file (2025)       | `city`               | Centroid of the named city/town/village/CDP. |
| 3     | Census Gazetteer national Counties file (2025)     | `county`             | Centroid of the county (or parish/borough/census area equivalent). |
| 4     | Built-in state centroid table                      | `state`              | Center of the state only -- the point says "somewhere in this state", nothing more. |
| 5     | None of the above                                  | `unknown`            | `location_unknown: true`, no coordinates; case appears in the list, not on the map. |

The map does not yet surface precision visually; `location_precision`
exists so it can (e.g. dimming or ringing state-level points) without a
data migration later. Until then, treat any mapped point as a locality
indicator, not an incident location.

Gazetteer details: the pipeline downloads the Census Gazetteer national
Places and Counties files (2025 vintage, ~1.4 MB total) on first run
into `scripts/.case-src/` (gitignored) and reuses them offline
afterwards. Place names are matched case-insensitively after stripping
Census place-type suffixes ("city", "town", "village", "CDP",
"municipality", "city and borough", etc.). When the same normalized
name appears more than once in a state, the entry suffixed "city" is
preferred (then first match) and the build summary flags the match as
ambiguous for human review.

## NamUs status -> app status mapping

| NamUs "Case Status" (as exported)        | App `CaseStatus` |
|-------------------------------------------|-------------------|
| Missing, Open, Active                      | `missing`         |
| Found Deceased, Deceased, Homicide         | `murdered`        |
| Found Alive, Found                         | `found`           |
| Resolved, Closed                           | `resolved`        |

Matching is case-insensitive. Any status value not in this table is
**not** guessed at -- the row is dropped and flagged in the build
summary rather than silently defaulted to a status. If NamUs introduces
a new status value, extend `NAMUS_STATUS_MAP` in `src/lib/case-data.ts`
deliberately, as a reviewed code change, not by loosening the fallback.

## Resolved / located cases on refresh

Each monthly refresh re-runs NamUs's own export and filter, which
reflects NamUs's current case status at export time. There is no diff
against the previous month's file:

- A case NamUs has since marked **Resolved** or **Found** will simply
  carry that updated status in the new file, replacing its prior
  `missing` entry (same `id`, since it's derived from the stable NamUs
  case number).
- A case that has **dropped out of NamUs's public export entirely**
  (e.g. removed at a family's request, or no longer meets the
  Ethnicity filter for administrative reasons) will not appear in the
  new file at all. It disappears from the map/list on the next deploy
  of that file. This is intentional: the site should reflect what NamUs
  is currently making public, not maintain its own shadow record of
  cases NamUs has withdrawn.
- The previous month's JSON file is retained in git history (each
  vintage is its own filename, e.g. `cases-2026-07.json`), so past
  states remain auditable even though the live site only serves the
  latest vintage.

## Photo rule

The pipeline never downloads, stores, or rehosts photos. `photo_url` is
always `null` for NamUs-sourced cases. The app links out to the case's
NamUs page (`source_urls`) for anyone who wants to see a photo or read
the full NamUs record. This is a hard rule, not a current limitation --
rehosting missing-persons photos outside NamUs's own controls raises
consent and takedown problems this project is not equipped to manage.

## Verify-with-agency disclaimer

Every NamUs-sourced case's `summary` field includes a standard
disclaimer directing readers to verify with the investigating agency:

> NamUs missing person case for [name]. Verify all details with the
> investigating agency via the source link.

The site-wide footer additionally shows, whenever non-sample data is
loaded:

> Data: NamUs, updated YYYY-MM. Verify details with the investigating
> agency.

Neither of these replace the NamUs source link itself (`source_urls`),
which remains the canonical record for any case.

## Refresh cadence

**Manual, monthly, reviewed PR. No cron, no scheduled automation.**

1. Someone with NamUs search access downloads a fresh Missing Persons
   CSV export (American Indian / Alaska Native filter) from
   `namus.nij.ojp.gov` and drops it into `scripts/.case-src/`
   (gitignored, never committed).
2. Run `node scripts/build-case-data.mjs` (optionally passing a
   `YYYY-MM` vintage override). Review the printed summary --
   especially dropped/flagged rows -- before proceeding.
3. Commit the new `public/data/cases-YYYY-MM.json` file and open a PR.
   A human reviews the diff (case counts, dropped-row summary, spot
   checks) before merging.
4. Merging to the deploy branch is what actually publishes the new
   data; there is no automatic re-run, scheduled job, or webhook that
   triggers a refresh on its own.

This keeps a human in the loop on every data change and avoids an
unattended process writing case data about real people into the repo
without review.
