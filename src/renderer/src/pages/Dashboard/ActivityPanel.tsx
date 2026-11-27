import type { ActivityEntry } from '@shared/ipc-contract'
import { ActivityIcon } from '@renderer/components/icons'
import { EmptyState, ErrorBanner, Loading, Panel } from '@renderer/components/ui'
import type { AsyncState } from '@renderer/hooks/useAsyncData'
import { formatDateTime } from '@renderer/lib/format'

export function ActivityPanel({ state }: { state: AsyncState<ActivityEntry[]> }) {
  return (
    <Panel title="Hoạt động gần đây" icon={<ActivityIcon />}>
      {state.status === 'loading' && <Loading />}
      {state.status === 'error' && <ErrorBanner message={state.error} />}
      {state.status === 'ready' &&
        (state.data.length === 0 ? (
          <EmptyState
            title="Chưa có hoạt động"
            hint="Mọi thao tác của bạn sẽ được ghi lại ở đây."
          />
        ) : (
          <ol className="space-y-3">
            {state.data.map((entry) => (
              <li key={entry.id} className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                <div className="min-w-0">
                  <p className="text-[13px]">{entry.message}</p>
                  <p className="text-[11px] text-muted">{formatDateTime(entry.createdAt)}</p>
                </div>
              </li>
            ))}
          </ol>
        ))}
    </Panel>
  )
}
