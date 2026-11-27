import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import type { PromptSummary } from '@shared/prompts'
import { ProjectSelect } from '@renderer/components/ProjectSelect'
import {
  Button,
  EmptyState,
  ErrorBanner,
  Loading,
  PageHeader,
  Select,
  TextInput
} from '@renderer/components/ui'
import { useAsyncData } from '@renderer/hooks/useAsyncData'
import { unwrap } from '@renderer/lib/api'
import { filterToProjectId, type ProjectFilter } from '@renderer/lib/project-filter'
import { PromptEditor } from './PromptEditor'

const loadProjects = () => unwrap(window.nexus.projects.list())
const loadCategories = () => unwrap(window.nexus.prompts.categories())

export function PromptsPage() {
  const [params, setParams] = useSearchParams()
  const [version, setVersion] = useState(0)
  const [queryText, setQueryText] = useState('')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('')
  const [project, setProject] = useState<ProjectFilter>('all')
  const refresh = useCallback(() => setVersion((v) => v + 1), [])

  // Gõ xong 250ms mới tìm, tránh gọi liên tục từng phím
  useEffect(() => {
    const t = setTimeout(() => setQuery(queryText), 250)
    return () => clearTimeout(t)
  }, [queryText])

  const projects = useAsyncData(loadProjects)
  const categories = useAsyncData(loadCategories, version)
  const loadList = useCallback(
    () =>
      unwrap(
        window.nexus.prompts.list({
          query,
          category: category || undefined,
          projectId: filterToProjectId(project)
        })
      ),
    [query, category, project]
  )
  const list = useAsyncData(loadList, version)

  const items = list.status === 'ready' ? list.data : []
  const param = params.get('id')
  const creating = param === 'new'
  const selectedId = creating
    ? null
    : (items.find((p) => p.id === Number(param))?.id ?? (param ? Number(param) : null))
  const select = (id: number | 'new') => setParams({ id: String(id) })
  const filtering = query.trim() !== '' || category !== '' || project !== 'all'

  return (
    <>
      <PageHeader
        title="Thư viện prompt"
        subtitle="Lưu những yêu cầu bạn hay nhờ AI làm. Dùng prompt ở tab Phân tích AI của từng tài liệu, hoặc sao chép sang công cụ khác."
        actions={
          <Button variant="primary" onClick={() => select('new')}>
            Prompt mới
          </Button>
        }
      />

      <div className="grid grid-cols-[300px_minmax(0,1fr)] gap-5">
        <section className="self-start overflow-hidden rounded-lg border border-border bg-surface">
          <div className="space-y-2 border-b border-border p-3">
            <TextInput
              type="search"
              placeholder="Tìm theo tiêu đề, nội dung, tag…"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
            />
            <div className="flex gap-2">
              <Select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="min-w-0 flex-1"
              >
                <option value="">Mọi danh mục</option>
                {categories.status === 'ready' &&
                  categories.data.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.count})
                    </option>
                  ))}
              </Select>
              {projects.status === 'ready' && projects.data.length > 0 && (
                <ProjectSelect
                  projects={projects.data}
                  value={project}
                  onChange={setProject}
                  includeAll
                />
              )}
            </div>
          </div>
          {list.status === 'loading' && <Loading />}
          {list.status === 'error' && (
            <div className="p-3">
              <ErrorBanner message={list.error} />
            </div>
          )}
          {list.status === 'ready' &&
            (items.length === 0 ? (
              <EmptyState
                title={filtering ? 'Không tìm thấy prompt nào' : 'Chưa có prompt nào'}
                hint={filtering ? 'Thử từ khóa khác hoặc bỏ bộ lọc.' : 'Bấm "Prompt mới" để thêm.'}
              />
            ) : (
              <ul className="max-h-[calc(100vh-260px)] divide-y divide-border overflow-y-auto">
                {items.map((p) => (
                  <PromptRow
                    key={p.id}
                    prompt={p}
                    selected={p.id === selectedId}
                    onSelect={() => select(p.id)}
                  />
                ))}
              </ul>
            ))}
        </section>

        {creating || selectedId !== null ? (
          <PromptEditor
            key={creating ? 'new' : selectedId}
            id={creating ? null : selectedId}
            projects={projects.status === 'ready' ? projects.data : []}
            categories={categories.status === 'ready' ? categories.data.map((c) => c.name) : []}
            onSaved={(id) => {
              select(id)
              refresh()
            }}
            onRemoved={() => {
              setParams({})
              refresh()
            }}
            onCancelNew={() => setParams({})}
          />
        ) : (
          <section className="rounded-lg border border-dashed border-border p-8">
            <EmptyState
              title="Chọn một prompt để xem / sửa"
              hint="Mẹo: viết prompt như đang dặn một trợ lý — nói rõ vai trò, việc cần làm và cách trình bày kết quả. Khi chạy trên tài liệu, app tự gửi kèm toàn văn tài liệu."
            />
          </section>
        )}
      </div>
    </>
  )
}

function PromptRow({
  prompt,
  selected,
  onSelect
}: {
  prompt: PromptSummary
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
          <span className="truncate">{prompt.title}</span>
          {prompt.useCount > 0 && (
            <span className="ml-auto shrink-0 text-[10px] text-muted" title="Số lần đã dùng">
              {prompt.useCount}×
            </span>
          )}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[11px] text-muted">{prompt.preview}</p>
        {(prompt.category || prompt.tags.length > 0) && (
          <p className="mt-1 flex flex-wrap gap-1">
            {prompt.category && (
              <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                {prompt.category}
              </span>
            )}
            {prompt.tags.map((t) => (
              <span key={t} className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">
                #{t}
              </span>
            ))}
          </p>
        )}
      </button>
    </li>
  )
}
