import type { DocumentKind } from '@shared/ipc-contract'

const styles: Record<DocumentKind, string> = {
  docx: 'bg-sky-500/15 text-sky-300',
  pdf: 'bg-rose-500/15 text-rose-300',
  txt: 'bg-zinc-500/20 text-zinc-300'
}

export function KindBadge({ kind }: { kind: DocumentKind }) {
  return (
    <span
      className={`inline-flex h-5 w-11 shrink-0 items-center justify-center rounded text-[10px] font-bold uppercase ${styles[kind]}`}
    >
      {kind}
    </span>
  )
}
