export default function SampleDataBanner({
  sample = true,
}: {
  sample?: boolean
}) {
  if (!sample) {
    return null
  }

  return (
    <p className="border-l-4 border-primary bg-surface-container-low px-4 py-3 text-sm font-semibold text-on-surface">
      Demonstration build. The points shown are sample data, not real cases.
    </p>
  )
}
