import { useCallback, useState } from 'react'
import type { DocumentSummary, ImportResult } from '@shared/ipc-contract'
import { ProjectSelect } from '@renderer/components/ProjectSelect'
import { filterToProjectId, type ProjectFilter } from '@renderer/lib/project-filter'
import {
  Button,
  EmptyState,
  ErrorBanner,
  InfoBanner,
  Loading,
  PageHeader
} from '@renderer/components/ui'
import { useAsyncData } from '@renderer/hooks/useAsyncData'
import { errorMessage, unwrap } from '@renderer/lib/api'
import { formatBytes, formatDateTime } from '@renderer/lib/format'
import { DocumentDetailPanel } from './DocumentDetailPanel'
import { KindBadge } from './KindBadge'

const loadProjects = () => unwrap(window.nexus.projects.list())

export function DocumentsPage() {
  const [filter, setFilter] = useState<ProjectFilter>('all')
  const [version, setVersion] = useState(0)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const projects = useAsyncData(loadProjects)
  const loadDocs = useCallback(
    () => unwrap(window.nexus.documents.list({ projectId: filterToProjectId(filter) })),
    [filter]
  )
  const docs = useAsyncData(loadDocs, version)
  const refresh = () => setVersion((v) => v + 1)

  async function handleImport() {
    setImporting(true)
    setError(null)
    setResult(null)
    try {
      // Đang lọc theo một dự án cụ thể → tài liệu mới gắn luôn vào dự án đó
      const projectId = filterToProjectId(filter) ?? null
      const r = await unwrap(window.nexus.documents.pickAndImport({ projectId }))
      if (r.cancelled) return
      setResult(r)
      if (r.imported.length > 0) setSelectedId(r.imported[0].id)
      refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setImporting(false)
    }
  }

  const projectList = projects.status === 'ready' ? projects.data : []
  const projectName = (id: number | null) =>
    id === null ? null : (projectList.find((p) => p.id === id)?.name ?? null)

  return (
    <>
      <PageHeader
        title="Tài liệu"
        subtitle="Nhập DOCX, PDF, TXT để đọc và kiểm tra. File gốc của bạn luôn được giữ nguyên."
        actions={
          <>
            <ProjectSelect
              projects={projectList}
              value={filter}
              onChange={(f) => {
                setFilter(f)
                setSelectedId(null)
              }}
              includeAll
            />
            <Button variant="primary" onClick={handleImport} disabled={importing}>
              {importing ? 'Đang nhập…' : 'Mở tài liệu'}
            </Button>
          </>
        }
      />

      {error && <ErrorBanner message={error} onClose={() => setError(null)} />}
      {result && <ImportSummary result={result} onClose={() => setResult(null)} />}

      <div className="grid min-h-[480px] grid-cols-[320px_minmax(0,1fr)] gap-5">
        <section className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface">
          {docs.status === 'loading' && <Loading />}
          {docs.status === 'error' && (
            <div className="p-3">
              <ErrorBanner message={docs.error} />
            </div>
          )}
          {docs.status === 'ready' &&
            (docs.data.length === 0 ? (
              <EmptyState
                title="Chưa có tài liệu"
                hint='Bấm "Mở tài liệu" để chọn file DOCX, PDF hoặc TXT.'
              />
            ) : (
              <ul className="max-h-[calc(100vh-220px)] divide-y divide-border overflow-y-auto">
                {docs.data.map((d) => (
                  <DocumentRow
                    key={d.id}
                    doc={d}
                    projectName={projectName(d.projectId)}
                    selected={d.id === selectedId}
                    onSelect={() => setSelectedId(d.id)}
                  />
                ))}
              </ul>
            ))}
        </section>

        {selectedId === null ? (
          <section className="grid place-items-center rounded-lg border border-dashed border-border">
            <EmptyState title="Chọn một tài liệu" hint="Nội dung và thông tin sẽ hiện ở đây." />
          </section>
        ) : (
          <DocumentDetailPanel
            key={selectedId}
            id={selectedId}
            projects={projectList}
            onChanged={refresh}
            onRemoved={() => {
              setSelectedId(null)
              refresh()
            }}
          />
        )}
      </div>
    </>
  )
}

function DocumentRow({
  doc,
  projectName,
  selected,
  onSelect
}: {
  doc: DocumentSummary
  projectName: string | null
  selected: boolean
  onSelect: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors ${
          selected ? 'bg-surface-2' : 'hover:bg-surface-2/50'
        }`}
      >
        <span className="mt-0.5">
          <KindBadge kind={doc.kind} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium" title={doc.name}>
            {doc.name}
          </p>
          <p className="truncate text-[11px] text-muted">
            {formatBytes(doc.sizeBytes)} · {formatDateTime(doc.importedAt)}
            {projectName && ` · ${projectName}`}
          </p>
          {doc.extractStatus === 'empty' && (
            <p className="mt-0.5 text-[11px] text-amber-400">Không có nội dung chữ</p>
          )}
        </div>
      </button>
    </li>
  )
}

function ImportSummary({ result, onClose }: { result: ImportResult; onClose: () => void }) {
  return (
    <InfoBanner onClose={onClose}>
      <p>
        Đã nhập <b>{result.imported.length}</b> tài liệu
        {result.skipped.length > 0 && (
          <>
            , bỏ qua <b>{result.skipped.length}</b>:
          </>
        )}
      </p>
      {result.skipped.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-[12px] text-muted">
          {result.skipped.map((s, i) => (
            <li key={i}>
              • <span className="text-text">{s.name}</span>: {s.reason}
            </li>
          ))}
        </ul>
      )}
    </InfoBanner>
  )
}
