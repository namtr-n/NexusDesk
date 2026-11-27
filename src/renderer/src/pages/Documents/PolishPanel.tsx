import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import {
  POLISH_MODE_INFO,
  POLISH_MODES,
  type PolishMode,
  type PolishProgressEvent,
  type PolishResult
} from '@shared/polish'
import { Button, ErrorBanner, Loading, Select } from '@renderer/components/ui'
import { useAsyncData } from '@renderer/hooks/useAsyncData'
import { errorMessage, unwrap } from '@renderer/lib/api'

const loadTemplates = () => unwrap(window.nexus.templates.list())
const loadStatus = () => unwrap(window.nexus.ai.getStatus())

const STAGE_LABEL: Record<PolishProgressEvent['stage'], string> = {
  format: 'Đang sửa định dạng theo mẫu',
  ai: 'AI đang hiệu đính câu chữ',
  save: 'Đang lưu file'
}

export function PolishPanel({
  documentId,
  onOpenDocument
}: {
  documentId: number
  onOpenDocument: (id: number) => void
}) {
  const templates = useAsyncData(loadTemplates)
  const status = useAsyncData(loadStatus)
  const [fixFormat, setFixFormat] = useState(true)
  const [templateId, setTemplateId] = useState<number | null>(null)
  const [mode, setMode] = useState<PolishMode>('spelling')
  const [running, setRunning] = useState<string | null>(null)
  const [progress, setProgress] = useState<PolishProgressEvent | null>(null)
  const [result, setResult] = useState<PolishResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const runningRef = useRef<string | null>(null)

  useEffect(() => {
    return window.nexus.polish.onProgress((e) => {
      if (e.requestId === runningRef.current) setProgress(e)
    })
  }, [])

  // Rời trang khi đang chạy → hủy
  useEffect(() => {
    return () => {
      if (runningRef.current) void window.nexus.polish.cancel({ requestId: runningRef.current })
    }
  }, [])

  if (templates.status === 'loading' || status.status === 'loading') return <Loading />
  if (status.status === 'error') return <ErrorBanner message={status.error} />
  const templateList = templates.status === 'ready' ? templates.data : []
  const selectedTemplate = templateId ?? templateList.find((t) => t.isDefault)?.id ?? null

  if (!status.data.hasKey) {
    return (
      <div className="rounded-md border border-dashed border-border p-6 text-center text-[13px]">
        <p className="font-medium">Cần Gemini API key để AI hiệu đính câu chữ</p>
        <p className="mt-1 text-muted">
          Vào{' '}
          <Link to="/settings" className="text-accent hover:underline">
            Cài đặt
          </Link>{' '}
          để nhập key. Nếu chỉ cần sửa định dạng, dùng nút &quot;Tự sửa định dạng&quot; ở tab Kiểm
          tra định dạng.
        </p>
      </div>
    )
  }

  async function run() {
    const requestId = crypto.randomUUID()
    runningRef.current = requestId
    setRunning(requestId)
    setProgress(null)
    setResult(null)
    setError(null)
    try {
      const r = await unwrap(
        window.nexus.polish.run({
          documentId,
          mode,
          fixFormat,
          templateId: fixFormat ? selectedTemplate : null,
          requestId
        })
      )
      if (!r.cancelled && r.result) setResult(r.result)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      runningRef.current = null
      setRunning(null)
      setProgress(null)
    }
  }

  async function cancel() {
    if (running) await window.nexus.polish.cancel({ requestId: running })
  }

  const percent =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted">
        Tạo một <b className="text-text">bản hoàn thiện</b>: sửa định dạng theo mẫu và nhờ AI sửa
        câu chữ. Mọi sửa đổi câu chữ được ghi bằng <b className="text-text">Track Changes</b> — mở
        file trong Word để xem từng chỗ và bấm Accept / Reject. File gốc giữ nguyên. AI không thêm
        nội dung mới.
      </p>

      <div className="space-y-3 rounded-md border border-border p-4">
        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={fixFormat}
            onChange={(e) => setFixFormat(e.target.checked)}
            disabled={running !== null}
            className="size-4 accent-[var(--color-accent)]"
          />
          Sửa định dạng theo mẫu
          <Select
            value={selectedTemplate === null ? '' : String(selectedTemplate)}
            onChange={(e) => setTemplateId(Number(e.target.value))}
            disabled={!fixFormat || running !== null}
            className="ml-1 max-w-64"
          >
            {templateList.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.isDefault ? ' (mặc định)' : ''}
              </option>
            ))}
          </Select>
        </label>

        <div>
          <p className="mb-1.5 text-[13px]">Mức AI hiệu đính</p>
          <div className="grid grid-cols-2 gap-2">
            {POLISH_MODES.map((m) => (
              <button
                key={m}
                type="button"
                disabled={running !== null}
                onClick={() => setMode(m)}
                className={`rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-60 ${
                  mode === m
                    ? 'border-accent bg-accent/10'
                    : 'border-border hover:border-muted/50 hover:bg-surface-2/50'
                }`}
              >
                <p className="text-[13px] font-medium">{POLISH_MODE_INFO[m].label}</p>
                <p className="mt-0.5 text-[11px] text-muted">{POLISH_MODE_INFO[m].description}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {running ? (
            <Button variant="danger" onClick={cancel}>
              Hủy
            </Button>
          ) : (
            <Button variant="primary" onClick={run}>
              Hoàn thiện báo cáo
            </Button>
          )}
          <span className="text-[11px] text-muted">
            Nội dung tài liệu sẽ được gửi tới Google Gemini. Báo cáo dài có thể mất vài phút.
          </span>
        </div>

        {running && (
          <div>
            <p className="text-[12px] text-muted">
              {progress ? STAGE_LABEL[progress.stage] : 'Đang chuẩn bị…'}
              {progress?.stage === 'ai' &&
                progress.total > 0 &&
                ` (phần ${Math.min(progress.done + 1, progress.total)}/${progress.total})`}
            </p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: `${progress?.stage === 'ai' ? percent : progress ? 5 : 2}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {error && <ErrorBanner message={error} onClose={() => setError(null)} />}
      {result && <ResultView result={result} onOpen={onOpenDocument} />}
    </div>
  )
}

function ResultView({ result, onOpen }: { result: PolishResult; onOpen: (id: number) => void }) {
  const [showAll, setShowAll] = useState(false)
  const list = showAll ? result.changes : result.changes.slice(0, 30)
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-success/30 bg-success/10 px-4 py-3 text-[13px]">
        <p className="font-semibold">Đã tạo bản hoàn thiện</p>
        <ul className="mt-1 space-y-0.5 text-[12px] text-muted">
          {result.format && (
            <li>
              Định dạng: {result.format.issuesBefore} lỗi → {result.format.issuesAfter} lỗi (chỉnh{' '}
              {result.format.paragraphsChanged} đoạn)
            </li>
          )}
          <li>
            Câu chữ: <b className="text-text">{result.editsApplied}</b> sửa đổi (Track Changes) trên{' '}
            {result.paragraphsReviewed} đoạn đã đọc
            {result.editsSkipped > 0 && `, bỏ qua ${result.editsSkipped} đề xuất không an toàn`} ·
            model {result.model}
          </li>
          <li>
            Đã lưu: <span className="select-text break-all text-text/80">{result.path}</span>
          </li>
        </ul>
        <p className="mt-2 text-[12px]">
          Mở file bằng Word → tab <b>Review</b> → xem từng sửa đổi → <b>Accept All</b> (hoặc Reject
          chỗ không ưng).
        </p>
        {result.newDocumentId && (
          <Button variant="primary" className="mt-2" onClick={() => onOpen(result.newDocumentId!)}>
            Mở bản hoàn thiện trong app
          </Button>
        )}
      </div>

      {result.changes.length > 0 && (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full table-fixed text-left text-[12px]">
            <thead className="bg-surface-2 text-muted">
              <tr>
                <th className="w-20 px-3 py-1.5 font-medium">Vị trí</th>
                <th className="px-3 py-1.5 font-medium">Chữ cũ</th>
                <th className="px-3 py-1.5 font-medium">Chữ mới</th>
                <th className="w-28 px-3 py-1.5 font-medium">Lý do</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((c, i) => (
                <tr key={i} className="align-top">
                  <td className="px-3 py-1.5 text-muted">Đoạn {c.paragraph}</td>
                  <td className="px-3 py-1.5 text-rose-300 line-through decoration-rose-400/60 select-text">
                    {c.find}
                  </td>
                  <td className="px-3 py-1.5 text-success select-text">{c.replace || '(xóa)'}</td>
                  <td className="px-3 py-1.5 text-muted">{c.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result.changes.length > 30 && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-[12px] text-accent hover:underline"
        >
          Xem tất cả {result.changes.length} sửa đổi
        </button>
      )}
    </div>
  )
}
