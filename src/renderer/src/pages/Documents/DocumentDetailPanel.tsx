import { useCallback, useState } from 'react'
import type { Project } from '@shared/ipc-contract'
import { ProjectSelect } from '@renderer/components/ProjectSelect'
import { filterToProjectId, type ProjectFilter } from '@renderer/lib/project-filter'
import { Button, ErrorBanner, Loading } from '@renderer/components/ui'
import { useAsyncData } from '@renderer/hooks/useAsyncData'
import { errorMessage, unwrap } from '@renderer/lib/api'
import { formatBytes, formatDateTime, formatNumber } from '@renderer/lib/format'
import { AiAnalysisPanel } from './AiAnalysisPanel'
import { FormatCheckPanel } from './FormatCheckPanel'
import { KindBadge } from './KindBadge'

interface Props {
  id: number
  projects: Project[]
  onChanged: () => void
  onRemoved: () => void
}

export function DocumentDetailPanel({ id, projects, onChanged, onRemoved }: Props) {
  const [version, setVersion] = useState(0)
  const load = useCallback(() => unwrap(window.nexus.documents.get({ id })), [id])
  const state = useAsyncData(load, version)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'format' | 'ai' | 'content'>('format')

  if (state.status === 'loading')
    return (
      <Panel>
        <Loading />
      </Panel>
    )
  if (state.status === 'error')
    return (
      <Panel>
        <div className="p-4">
          <ErrorBanner message={state.error} />
        </div>
      </Panel>
    )

  const doc = state.data
  // Tab "Kiểm tra định dạng" chỉ có với DOCX, "Phân tích AI" chỉ khi có chữ
  const activeTab =
    tab === 'format' && doc.kind !== 'docx'
      ? doc.text
        ? 'ai'
        : 'content'
      : tab === 'ai' && !doc.text
        ? 'content'
        : tab

  async function changeProject(f: ProjectFilter) {
    setBusy(true)
    setError(null)
    try {
      await unwrap(
        window.nexus.documents.setProject({ id, projectId: filterToProjectId(f) ?? null })
      )
      setVersion((v) => v + 1)
      onChanged()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    const ok = window.confirm(
      `Xóa "${doc.name}" khỏi thư viện?\n\nChỉ xóa bản sao trong Nexus Desk. File gốc trên máy bạn không bị ảnh hưởng.`
    )
    if (!ok) return
    setBusy(true)
    try {
      await unwrap(window.nexus.documents.remove({ id }))
      onRemoved()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Panel>
      <div className="border-b border-border p-4">
        <div className="flex items-center gap-3">
          <KindBadge kind={doc.kind} />
          <h2 className="min-w-0 flex-1 text-[15px] font-semibold break-words select-text">
            {doc.name}
          </h2>
          <Button variant="danger" onClick={remove} disabled={busy}>
            Xóa
          </Button>
        </div>

        {error && (
          <div className="mt-3">
            <ErrorBanner message={error} onClose={() => setError(null)} />
          </div>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-[12px] lg:grid-cols-4">
          <Meta label="Dung lượng" value={formatBytes(doc.sizeBytes)} />
          <Meta label="Số ký tự" value={formatNumber(doc.charCount)} />
          <Meta label="Số trang" value={doc.pageCount === null ? '—' : String(doc.pageCount)} />
          <Meta label="Ngày nhập" value={formatDateTime(doc.importedAt)} />
        </dl>

        <div className="mt-4 flex items-center gap-2 text-[12px] text-muted">
          <span>Dự án:</span>
          <ProjectSelect
            projects={projects}
            value={doc.projectId === null ? 'none' : `${doc.projectId}`}
            onChange={changeProject}
            disabled={busy}
          />
        </div>

        {doc.extractMessage && (
          <p className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-[12px] text-amber-300">
            {doc.extractMessage}
          </p>
        )}
      </div>

      <div className="flex gap-1 border-b border-border px-4">
        {doc.kind === 'docx' && (
          <Tab active={activeTab === 'format'} onClick={() => setTab('format')}>
            Kiểm tra định dạng
          </Tab>
        )}
        {doc.text && (
          <Tab active={activeTab === 'ai'} onClick={() => setTab('ai')}>
            Phân tích AI
          </Tab>
        )}
        <Tab active={activeTab === 'content'} onClick={() => setTab('content')}>
          Nội dung
        </Tab>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {activeTab === 'format' ? (
          <FormatCheckPanel documentId={doc.id} />
        ) : activeTab === 'ai' ? (
          <AiAnalysisPanel documentId={doc.id} />
        ) : doc.text ? (
          <>
            <pre className="font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-text/90 select-text">
              {doc.text}
            </pre>
            {doc.textTruncated && (
              <p className="mt-4 text-[12px] text-muted">
                (Chỉ hiển thị 200.000 ký tự đầu. Toàn bộ nội dung vẫn được lưu.)
              </p>
            )}
          </>
        ) : (
          <p className="text-[13px] text-muted">Không có nội dung chữ để hiển thị.</p>
        )}
      </div>
    </Panel>
  )
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex max-h-[calc(100vh-180px)] flex-col overflow-hidden rounded-lg border border-border bg-surface">
      {children}
    </section>
  )
}

function Tab({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-2.5 text-[13px] transition-colors ${
        active
          ? 'border-accent font-medium text-text'
          : 'border-transparent text-muted hover:text-text'
      }`}
    >
      {children}
    </button>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  )
}
