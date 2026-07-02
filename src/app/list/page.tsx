import type { Metadata } from 'next'
import CasesListTable from '@/components/cases/cases-list-table'
import SampleDataBanner from '@/components/layout/sample-data-banner'
import { getCaseDataMetadata, getCases } from '@/lib/get-cases'

export const metadata: Metadata = {
  title: 'Cases — Marked in Red',
  description:
    'Browse fictional sample case records in the Marked in Red demonstration build.',
}

export default async function ListPage() {
  const [cases, caseDataMetadata] = await Promise.all([
    getCases(),
    getCaseDataMetadata(),
  ])

  return (
    <div className="bg-surface">
      <section className="mx-auto flex max-w-[1440px] flex-col gap-6 px-6 py-10">
        <SampleDataBanner sample={caseDataMetadata.sample} />

        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold uppercase text-primary">
            Sample Case List
          </p>
          <h1 className="font-display text-4xl font-extrabold text-on-surface md:text-5xl">
            Cases
          </h1>
          <p className="max-w-3xl text-base leading-7 text-on-surface-variant">
            Browse all fictional demonstration records, including records that
            may not have coordinates for map display.
          </p>
        </div>

        <CasesListTable cases={cases} />
      </section>
    </div>
  )
}
