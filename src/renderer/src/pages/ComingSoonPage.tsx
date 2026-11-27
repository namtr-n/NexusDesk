import { PageHeader } from '@renderer/components/ui'

interface Props {
  title: string
  description: string
  phase: number
  features: string[]
}

/** Trang cho module chưa làm: nói rõ khi nào có, không giả vờ có chức năng. */
export function ComingSoonPage({ title, description, phase, features }: Props) {
  return (
    <>
      <PageHeader title={title} subtitle={description} />
      <div className="rounded-lg border border-dashed border-border bg-surface/50 p-8">
        <span className="rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-medium text-accent">
          Sẽ có ở Giai đoạn {phase}
        </span>
        <ul className="mt-4 space-y-1.5 text-[13px] text-muted">
          {features.map((f) => (
            <li key={f}>• {f}</li>
          ))}
        </ul>
      </div>
    </>
  )
}
