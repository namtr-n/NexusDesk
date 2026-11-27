import { useCallback, useState } from 'react'
import { Link } from 'react-router'
import {
  FORMAT_RULE_LABELS,
  groupIssues,
  type FormatCheckResult,
  type FormatIssue,
  type ReportFormat
} from '@shared/format'
import { Button, ErrorBanner, InfoBanner, Loading } from '@renderer/components/ui'
import { useAsyncData } from '@renderer/hooks/useAsyncData'
import { errorMessage, unwrap } from '@renderer/lib/api'
import { formatDateTime, formatNumber } from '@renderer/lib/format'

/** Số dòng hiển thị mỗi nhóm trước khi bấm "Xem thêm" */
const PAGE = 20

export function FormatCheckPanel({ documentId }: { documentId: number }) {
  const load = useCallback(
    () => unwrap(window.nexus.format.getLatest({ id: documentId })),
    [documentId]
  )
  const latest = useAsyncData(load)
  const [result, setResult] = useState<FormatCheckResult | null | undefined>(undefined)
  const [busy, setBusy] = useState<'check' | ReportFormat | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  // Kết quả mới vừa kiểm tra ưu tiên hơn kết quả đã lưu
  const current =
    result !== undefined ? result : latest.status === 'ready' ? latest.data : undefined

  async function runCheck() {
    setBusy('check')
    setError(null)
    setSaved(null)
    try {
      setResult(await unwrap(window.nexus.format.check({ id: documentId })))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
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
        <Button variant="primary" onClick={runCheck} disabled={busy !== null}>
          {busy === 'check' ? 'Đang kiểm tra…' : current ? 'Kiểm tra lại' : 'Kiểm tra định dạng'}
        </Button>
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
        <Link to="/settings" className="ml-auto text-[12px] text-accent hover:underline">
          Sửa quy tắc định dạng
        </Link>
      </div>

      <div className="mt-4">
        {error && <ErrorBanner message={error} onClose={() => setError(null)} />}
        {latest.status === 'error' && <ErrorBanner message={latest.error} />}
        {saved && (
          <InfoBanner onClose={() => setSaved(null)}>
            Đã lưu báo cáo: <span className="select-text break-all text-muted">{saved}</span>
          </InfoBanner>
        )}

        {current === null && !busy && (
          <p className="text-[13px] text-muted">
            Chưa kiểm tra lần nào. Bấm &quot;Kiểm tra định dạng&quot; để so tài liệu với quy tắc
            trình bày (font, cỡ chữ, giãn dòng, lề...).
          </p>
        )}
        {current && <ResultView result={current} />}
      </div>
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
          Kiểm tra lúc {formatDateTime(result.checkedAt)} · {stats.paragraphs} đoạn có chữ (thân bài{' '}
          {stats.bodyParagraphs}, heading {stats.headings}) · Quy tắc: {result.rules.fontFamily}{' '}
          {formatNumber(result.rules.bodyFontSizePt)} pt, giãn{' '}
          {formatNumber(result.rules.lineSpacing)} dòng
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
              <th className="w-20 px-3 py-1.5 font-medium">Vị trí</th>
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
