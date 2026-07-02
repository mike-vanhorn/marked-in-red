import MapExplorer from '@/components/map/map-explorer'
import SampleDataBanner from '@/components/layout/sample-data-banner'
import { getCaseDataMetadata, getCases } from '@/lib/get-cases'

export default async function MapPage() {
  const [cases, metadata] = await Promise.all([
    getCases(),
    getCaseDataMetadata(),
  ])

  return (
    <div className="bg-surface">
      <section className="mx-auto flex max-w-[1440px] flex-col gap-6 px-6 py-10">
        <SampleDataBanner sample={metadata.sample} />

        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold uppercase text-primary">
            Awareness Map
          </p>
          <h1 className="font-display text-4xl font-extrabold text-on-surface md:text-5xl">
            Marked in Red
          </h1>
          <p className="max-w-3xl text-base leading-7 text-on-surface-variant">
            A working demo map for understanding how MMIWG2S case information
            could be explored across the United States and Canada.
          </p>
        </div>

        <MapExplorer cases={cases} />
      </section>
    </div>
  )
}
