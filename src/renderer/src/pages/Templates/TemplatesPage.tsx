import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router'
import { DEFAULT_TEMPLATE_NAME, type FormatTemplateSummary } from '@shared/format'
import { Button, EmptyState, ErrorBanner, Loading, PageHeader } from '@renderer/components/ui'
import { useAsyncData } from '@renderer/hooks/useAsyncData'
import { errorMessage, unwrap } from '@renderer/lib/api'
import { TemplateEditor } from './TemplateEditor'

const loadTemplates = () => unwrap(window.nexus.templates.list())

export function TemplatesPage() {
  const [params, setParams] = useSearchParams()
  const [version, setVersion] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const list = useAsyncData(loadTemplates, version)
  const refresh = useCallback(() => setVersion((v) => v + 1), [])

  const templates = list.status === 'ready' ? list.data : []
  const paramId = Number(params.get('id'))
  const selectedId =
    templates.find((t) => t.id === paramId)?.id ??
    templates.find((t) => t.isDefault)?.id ??
    templates[0]?.id ??
    null
  const select = (id: number) => setParams({ id: String(id) })

  async function create(kind: 'file' | 'preset') {
    setBusy(true)
    setError(null)
    try {
      if (kind === 'file') {
        const r = await unwrap(window.nexus.templates.createFromFile())
        if (r.cancelled || !r.template) return
        select(r.template.id)
      } else {
        const t = await unwrap(
          window.nexus.templates.createFromPreset({ name: `${DEFAULT_TEMPLATE_NAME} (bản sao)` })
        )
        select(t.id)
      }
      refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Mẫu định dạng"
        subtitle="Mỗi mẫu là một bộ quy định trình bày. Tạo mẫu từ file báo cáo mẫu của khách hàng / nhà trường, rồi kiểm tra bài làm theo mẫu đó."
        actions={
          <>
            <Button onClick={() => create('preset')} disabled={busy}>
              Tạo từ chuẩn mặc định
            </Button>
            <Button variant="primary" onClick={() => create('file')} disabled={busy}>
              {busy ? 'Đang xử lý…' : 'Tạo mẫu từ file DOCX'}
            </Button>
          </>
        }
      />
      {error && <ErrorBanner message={error} onClose={() => setError(null)} />}

      <div className="grid grid-cols-[230px_minmax(0,1fr)] gap-5">
        <section className="self-start overflow-hidden rounded-lg border border-border bg-surface">
          {list.status === 'loading' && <Loading />}
          {list.status === 'error' && (
            <div className="p-3">
              <ErrorBanner message={list.error} />
            </div>
          )}
          {list.status === 'ready' && (
            <ul className="divide-y divide-border">
              {templates.map((t) => (
                <TemplateRow
                  key={t.id}
                  template={t}
                  selected={t.id === selectedId}
                  onSelect={() => select(t.id)}
                />
              ))}
            </ul>
          )}
        </section>

        {selectedId === null ? (
          list.status === 'ready' && <EmptyState title="Chưa có mẫu nào" />
        ) : (
          <TemplateEditor
            key={selectedId}
            id={selectedId}
            onChanged={refresh}
            onRemoved={() => {
              setParams({})
              refresh()
            }}
          />
        )}
      </div>
    </>
  )
}

function TemplateRow({
  template,
  selected,
  onSelect
}: {
  template: FormatTemplateSummary
  selected: boolean
  onSelect: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`w-full px-3 py-2.5 text-left transition-colors ${
          selected ? 'bg-surface-2' : 'hover:bg-surface-2/50'
        }`}
      >
        <p className="flex items-center gap-2 text-[13px] font-medium">
          <span className="truncate">{template.name}</span>
          {template.isDefault && (
            <span className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
              MẶC ĐỊNH
            </span>
          )}
        </p>
        <p className="truncate text-[11px] text-muted">
          {template.sourceName ? `Học từ ${template.sourceName}` : 'Tạo tay / có sẵn'}
        </p>
      </button>
    </li>
  )
}
