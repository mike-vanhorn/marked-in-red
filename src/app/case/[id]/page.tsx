import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import SampleDataBanner from '@/components/layout/sample-data-banner'
import {
  ADDITIONAL_INFO_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
} from '@/lib/constants'
import { getCaseById, getCaseDataMetadata } from '@/lib/get-cases'
import type { Case } from '@/lib/types'

type CasePageProps = {
  params: Promise<{ id: string }>
}

function formatDate(value: string | null) {
  if (!value) {
    return 'Not listed'
  }

  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

function formatLocation(item: Case) {
  return `${item.location_name}, ${item.state_province}, ${item.country}`
}

export async function generateMetadata({
  params,
}: CasePageProps): Promise<Metadata> {
  const { id } = await params
  const item = await getCaseById(id)

  if (!item) {
    return {
      title: 'Case not found — Marked in Red',
      description:
        'The requested sample case record was not found in the Marked in Red demonstration build.',
    }
  }

  return {
    title: `${item.name} — Marked in Red`,
    description: `${STATUS_LABELS[item.status]} sample case record for ${formatLocation(
      item
    )}. Demonstration data only.`,
  }
}

export default async function CasePage({ params }: CasePageProps) {
  const { id } = await params
  const [item, metadata] = await Promise.all([
    getCaseById(id),
    getCaseDataMetadata(),
  ])

  if (!item) {
    notFound()
  }

  const additionalInfoEntries = Object.entries(item.additional_info)

  return (
    <div className="bg-surface">
      <article className="mx-auto flex max-w-[1440px] flex-col gap-6 px-6 py-10">
        <SampleDataBanner sample={metadata.sample} />

        <Link
          href="/list"
          className="w-fit text-sm font-semibold text-primary underline-offset-4 hover:underline focus:underline"
        >
          Back to cases
        </Link>

        <header className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-semibold uppercase text-primary">
                Sample Case Profile
              </p>
              <span
                className="inline-flex items-center gap-2 bg-surface-container-low px-3 py-1 text-sm font-semibold text-on-surface"
                aria-label={`Status: ${STATUS_LABELS[item.status]}`}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: STATUS_COLORS[item.status] }}
                  aria-hidden="true"
                />
                {STATUS_LABELS[item.status]}
              </span>
            </div>
            <h1 className="font-display text-4xl font-extrabold leading-tight text-on-surface md:text-6xl">
              {item.name}
            </h1>
            <p className="max-w-3xl text-lg leading-8 text-on-surface-variant">
              {item.summary}
            </p>
          </div>

          <div className="flex aspect-[4/3] items-center justify-center border border-outline-variant/60 bg-surface-container-low p-6 text-center text-sm font-semibold text-on-surface-variant">
            No image shown for demonstration records.
          </div>
        </header>

        <section
          aria-labelledby="case-details-heading"
          className="border border-outline-variant/50 bg-white p-5"
        >
          <h2 id="case-details-heading" className="sr-only">
            Case details
          </h2>
          <dl className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Detail
              label="Tribal affiliation"
              value={item.tribal_affiliation}
            />
            <Detail
              label="Date missing"
              value={formatDate(item.date_missing)}
            />
            <Detail label="Date found" value={formatDate(item.date_found)} />
            <Detail
              label="Age at disappearance"
              value={item.age_at_disappearance?.toString() ?? 'Not listed'}
            />
            <Detail label="Location" value={formatLocation(item)} />
            <Detail label="Country" value={item.country} />
          </dl>
        </section>

        <section
          aria-labelledby="sources-heading"
          className="space-y-4 border border-outline-variant/50 bg-white p-5"
        >
          <div>
            <h2
              id="sources-heading"
              className="font-display text-2xl font-extrabold text-on-surface"
            >
              Sources
            </h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              Source database: {item.source_database}
            </p>
          </div>

          {item.source_urls.length > 0 ? (
            <ul className="list-disc space-y-2 pl-5 text-sm">
              {item.source_urls.map((url) => (
                <li key={url}>
                  <a
                    href={url}
                    className="text-primary underline-offset-4 hover:underline focus:underline"
                    rel="noreferrer"
                    target="_blank"
                  >
                    {url}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm font-medium text-on-surface-variant">
              No source links are included for this fictional sample record.
            </p>
          )}
        </section>

        <section
          aria-labelledby="additional-info-heading"
          className="space-y-4 border border-outline-variant/50 bg-white p-5"
        >
          <h2
            id="additional-info-heading"
            className="font-display text-2xl font-extrabold text-on-surface"
          >
            Additional Information
          </h2>

          {additionalInfoEntries.length > 0 ? (
            <dl className="grid gap-4 md:grid-cols-2">
              {additionalInfoEntries.map(([key, value]) => (
                <div
                  key={key}
                  className="border-l-4 border-primary bg-surface-container-low px-4 py-3"
                >
                  <dt className="text-sm font-semibold text-on-surface">
                    {ADDITIONAL_INFO_LABELS[key] ?? key}
                  </dt>
                  <dd className="mt-1 text-sm leading-6 text-on-surface-variant">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm font-medium text-on-surface-variant">
              No additional details are included for this fictional sample
              record.
            </p>
          )}
        </section>
      </article>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm font-semibold text-on-surface-variant">
        {label}
      </dt>
      <dd className="mt-1 text-base font-semibold text-on-surface">{value}</dd>
    </div>
  )
}
