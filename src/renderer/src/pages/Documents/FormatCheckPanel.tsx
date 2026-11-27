import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  FORMAT_RULE_LABELS,
  groupIssues,
  type AutoFixResult,
  type FormatCheckResult,
  type FormatIssue,
  type ReportFormat
} from '@shared/format'
import { Button, ErrorBanner, InfoBanner, Loading, Select } from '@renderer/components/ui'
import { useAsyncData } from '@renderer/hooks/useAsyncData'
import { errorMessage, unwrap } from '@renderer/lib/api'
import { formatDateTime } from '@renderer/lib/format'

/** Số dòng hiển thị mỗi nhóm trước khi bấm "Xem thêm" */
const PAGE = 20

const loadTemplates = () => unwrap(window.nexus.templates.list())

export function FormatCheckPanel({
  documentId,
  onOpenDocument
}: {
  documentId: number
  /** Mở một tài liệu khác trong thư viện (ví dụ bản vừa tự sửa) */
  onOpenDocument: (id: number) => void
}) {
  const load = useCallback(
    () => unwrap(window.nexus.format.getLatest({ id: documentId })),
    [documentId]
  )
  const latest = useAsyncData(load)
  const templates = useAsyncData(loadTemplates)
  const [result, setResult] = useState<FormatCheckResult | null | undefined>(undefined)
  const [busy, setBusy] = useState<'check' | 'template' | 'fix' | ReportFormat | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [fixed, setFixed] = useState<AutoFixResult | null>(null)
  const [chosen, setChosen] = useState<number | null>(null)
  const navigate = useNavigate()

  // Kết quả mới vừa kiểm tra ưu tiên hơn kết quả đã lưu
  const current =
    result !== undefined ? result : latest.status === 'ready' ? latest.data : undefined

  const templateList = templates.status === 'ready' ? templates.data : []
  // Mẫu đang chọn: người dùng chọn > mẫu của lần kiểm tra trước > mẫu mặc định
  const templateId =
    chosen ??
    (current?.templateId && templateList.some((t) => t.id === current.templateId)
      ? current.templateId
      : (templateList.find((t) => t.isDefault)?.id ?? null))

  async function runCheck() {
    setBusy('check')
    setError(null)
    setSaved(null)
    try {
      setResult(await unwrap(window.nexus.format.check({ id: documentId, templateId })))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  async function autoFix() {
    setBusy('fix')
    setError(null)
    setSaved(null)
    setFixed(null)
    try {
      const r = await unwrap(window.nexus.format.autoFix({ documentId, templateId }))
      if (!r.cancelled && r.result) setFixed(r.result)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  async function useAsTemplate() {
    setBusy('template')
    setError(null)
    try {
      const t = await unwrap(window.nexus.format.createTemplateFromDocument({ id: documentId }))
      navigate(`/templates?id=${t.id}`)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(null)
    }
  }

  async function exportAs(format: ReportFormat) {
    setBusy(format)
    setError(null)
    setSaved(null)
    try {
      const r = await unwrap(window.nexus.format.exportReport({ documentId, format }))
      if (!r.cancelled && r.path) setSaved(r.path)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  if (latest.status === 'loading') return <Loading />

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-muted">Theo mẫu</span>
        <Select
          value={templateId === null ? '' : String(templateId)}
          onChange={(e) => setChosen(Number(e.target.value))}
          disabled={busy !== null || templateList.length === 0}
          className="max-w-60"
        >
          {templateList.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.isDefault ? ' (mặc định)' : ''}
            </option>
          ))}
        </Select>
        <Button
          variant="primary"
          onClick={runCheck}
          disabled={busy !== null || templateId === null}
        >
          {busy === 'check' ? 'Đang kiểm tra…' : current ? 'Kiểm tra lại' : 'Kiểm tra'}
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {current && current.issues.length > 0 && (
          <Button
            variant="primary"
            onClick={autoFix}
            disabled={busy !== null || templateId === null}
            title="Sửa font, cỡ chữ, giãn dòng, căn lề... theo mẫu và lưu thành file mới"
          >
            {busy === 'fix' ? 'Đang sửa…' : 'Tự sửa định dạng'}
          </Button>
        )}
        {current && (
          <>
            <Button onClick={() => exportAs('docx')} disabled={busy !== null}>
              {busy === 'docx' ? 'Đang xuất…' : 'Xuất báo cáo DOCX'}
            </Button>
            <Button onClick={() => exportAs('md')} disabled={busy !== null}>
              {busy === 'md' ? 'Đang xuất…' : 'Xuất Markdown'}
            </Button>
          </>
        )}
        <div className="ml-auto flex items-center gap-3 text-[12px]">
          <button
            type="button"
            onClick={useAsTemplate}
            disabled={busy !== null}
            className="text-accent hover:underline disabled:opacity-40"
            title="Học định dạng của tài liệu này thành một mẫu mới"
          >
            {busy === 'template' ? 'Đang tạo mẫu…' : 'Dùng tài liệu này làm mẫu'}
          </button>
          <Link to="/templates" className="text-accent hover:underline">
            Quản lý mẫu
          </Link>
        </div>
      </div>

      <div className="mt-4">
        {error && <ErrorBanner message={error} onClose={() => setError(null)} />}
        {latest.status === 'error' && <ErrorBanner message={latest.error} />}
        {saved && (
          <InfoBanner onClose={() => setSaved(null)}>
            Đã lưu báo cáo: <span className="select-text break-all text-muted">{saved}</span>
          </InfoBanner>
        )}
        {fixed && (
          <FixResultBanner
            result={fixed}
            onClose={() => setFixed(null)}
            onOpen={fixed.newDocumentId ? () => onOpenDocument(fixed.newDocumentId!) : undefined}
          />
        )}

        {current === null && !busy && (
          <p className="text-[13px] text-muted">
            Chưa kiểm tra lần nào. Chọn mẫu rồi bấm &quot;Kiểm tra&quot; để so tài liệu với quy định
            trình bày của mẫu (font, cỡ chữ, giãn dòng, heading, lề...).
          </p>
        )}
        {current && <ResultView result={current} />}
      </div>
    </div>
  )
}

function FixResultBanner({
  result,
  onClose,
  onOpen
}: {
  result: AutoFixResult
  onClose: () => void
  onOpen?: () => void
}) {
  const { summary } = result
  return (
    <div className="mb-4 rounded-md border border-success/30 bg-success/10 px-4 py-3 text-[13px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">
            Đã tự sửa theo mẫu &quot;{result.templateName}&quot;: {result.issuesBefore} lỗi →{' '}
            {result.issuesAfter} lỗi
          </p>
          <p className="mt-0.5 text-[12px] text-muted">
            Chỉnh {summary.paragraphsChanged} đoạn, {summary.runsChanged} cụm chữ
            {summary.sectionsChanged > 0 && `, lề trang ${summary.sectionsChanged} phần`}. File gốc
            giữ nguyên. Đã lưu:{' '}
            <span className="select-text break-all text-text/80">{result.path}</span>
          </p>
          {result.issuesAfter > 0 && (
            <p className="mt-1 text-[12px] text-amber-300">
              Còn lại cần sửa tay:{' '}
              {result.remainingRules.map((r) => FORMAT_RULE_LABELS[r]).join(', ')}.
            </p>
          )}
        </div>
        <button type="button" className="shrink-0 text-muted hover:text-text" onClick={onClose}>
          Đóng
        </button>
      </div>
      {onOpen && (
        <Button variant="primary" className="mt-2" onClick={onOpen}>
          Mở bản đã sửa
        </Button>
      )}
    </div>
  )
}

function ResultView({ result }: { result: FormatCheckResult }) {
  const groups = groupIssues(result.issues)
  const { stats } = result

  return (
    <>
      <div
        className={`rounded-md border px-4 py-3 ${
          result.issues.length === 0
            ? 'border-success/30 bg-success/10'
            : 'border-amber-500/30 bg-amber-500/10'
        }`}
      >
        <p className="text-[14px] font-semibold">
          {result.issues.length === 0
            ? 'Không phát hiện lỗi định dạng'
            : `Phát hiện ${result.issues.length} lỗi định dạng`}
        </p>
        <p className="mt-0.5 text-[12px] text-muted">
          Theo mẫu <b className="text-text">{result.templateName}</b> · kiểm tra lúc{' '}
          {formatDateTime(result.checkedAt)} · {stats.paragraphs} đoạn có chữ (thân bài{' '}
          {stats.bodyParagraphs}, heading {stats.headings})
        </p>
        {groups.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {groups.map(([rule, list]) => (
              <a
                key={rule}
                href={`#issues-${rule}`}
                onClick={(e) => {
                  e.preventDefault()
                  document.getElementById(`issues-${rule}`)?.scrollIntoView({ behavior: 'smooth' })
                }}
                className="rounded-full bg-bg/60 px-2.5 py-0.5 text-[11px] hover:bg-bg"
              >
                {FORMAT_RULE_LABELS[rule]}: <b>{list.length}</b>
              </a>
            ))}
          </div>
        )}
      </div>

      {groups.map(([rule, list]) => (
        <IssueGroup
          key={rule}
          id={`issues-${rule}`}
          title={FORMAT_RULE_LABELS[rule]}
          issues={list}
        />
      ))}
    </>
  )
}

function IssueGroup({ id, title, issues }: { id: string; title: string; issues: FormatIssue[] }) {
  const [shown, setShown] = useState(PAGE)
  return (
    <section id={id} className="mt-5">
      <h3 className="mb-2 text-[13px] font-semibold">
        {title} <span className="font-normal text-muted">({issues.length})</span>
      </h3>
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full table-fixed text-left text-[12px]">
          <thead className="bg-surface-2 text-muted">
            <tr>
              <th className="w-36 px-3 py-1.5 font-medium">Vị trí</th>
              <th className="px-3 py-1.5 font-medium">Nội dung đầu đoạn</th>
              <th className="w-40 px-3 py-1.5 font-medium">Hiện tại</th>
              <th className="w-40 px-3 py-1.5 font-medium">Yêu cầu</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {issues.slice(0, shown).map((i, idx) => (
              <tr key={idx} className="align-top">
                <td className="px-3 py-1.5 whitespace-nowrap text-muted">
                  {i.paragraph === null ? '—' : `Đoạn ${i.paragraph}`}
                  <span className="block text-[11px] text-muted/70">{i.context}</span>
                </td>
                <td className="truncate px-3 py-1.5 select-text" title={i.excerpt}>
                  {i.excerpt}
                </td>
                <td className="px-3 py-1.5 text-amber-300">{i.actual}</td>
                <td className="px-3 py-1.5 text-success">{i.expected}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {issues.length > shown && (
        <button
          type="button"
          onClick={() => setShown((s) => s + PAGE * 5)}
          className="mt-1.5 text-[12px] text-accent hover:underline"
        >
          Xem thêm {Math.min(PAGE * 5, issues.length - shown)} dòng (còn {issues.length - shown})
        </button>
      )}
    </section>
  )
}
