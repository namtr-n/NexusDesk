import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { AI_TASK_INFO, AI_TASKS, type AiAnalysis, type AiTask } from '@shared/ai'
import { Markdown } from '@renderer/components/Markdown'
import { Button, ErrorBanner, Loading, Select } from '@renderer/components/ui'
import { useAsyncData } from '@renderer/hooks/useAsyncData'
import { errorMessage, unwrap } from '@renderer/lib/api'
import { formatDateTime } from '@renderer/lib/format'

const loadStatus = () => unwrap(window.nexus.ai.getStatus())
const loadPrompts = () => unwrap(window.nexus.prompts.list({ query: '' }))

/** Ô đang chọn: một tác vụ có sẵn, hoặc 'prompt' = prompt trong thư viện */
type Choice = AiTask | 'prompt'

/** Khóa lưu kết quả: tên tác vụ, hoặc "p:<id prompt>" */
type ResultKey = AiTask | `p:${number}`
const keyOf = (a: AiAnalysis): ResultKey => (a.task === 'custom' ? `p:${a.promptId ?? 0}` : a.task)

interface Running {
  key: ResultKey
  label: string
  requestId: string
  text: string
}

export function AiAnalysisPanel({ documentId }: { documentId: number }) {
  const status = useAsyncData(loadStatus)
  const prompts = useAsyncData(loadPrompts)
  const loadAnalyses = useCallback(
    () => unwrap(window.nexus.ai.getAnalyses({ id: documentId })),
    [documentId]
  )
  const saved = useAsyncData(loadAnalyses)

  const [choice, setChoice] = useState<Choice>('overview')
  const [promptId, setPromptId] = useState<number | null>(null)
  const [results, setResults] = useState<Partial<Record<ResultKey, AiAnalysis>>>({})
  const [running, setRunning] = useState<Running | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const runningRef = useRef<Running | null>(null)

  // Nhận từng đoạn chữ đang stream từ main process
  useEffect(() => {
    return window.nexus.ai.onChunk(({ requestId, text }) => {
      const cur = runningRef.current
      if (!cur || cur.requestId !== requestId) return
      const next = { ...cur, text: cur.text + text }
      runningRef.current = next
      setRunning(next)
    })
  }, [])

  // Rời trang khi AI đang chạy → hủy yêu cầu
  useEffect(() => {
    return () => {
      const cur = runningRef.current
      if (cur) void window.nexus.ai.cancel({ requestId: cur.requestId })
    }
  }, [])

  const promptList = prompts.status === 'ready' ? prompts.data : []
  const selectedPrompt =
    promptList.find((p) => p.id === promptId) ??
    // Mặc định: prompt hay dùng nhất
    [...promptList].sort((a, b) => b.useCount - a.useCount)[0] ??
    null

  const savedByKey: Partial<Record<ResultKey, AiAnalysis>> =
    saved.status === 'ready' ? Object.fromEntries(saved.data.map((a) => [keyOf(a), a])) : {}
  const resultOf = (k: ResultKey) => results[k] ?? savedByKey[k]
  const customDone = promptList.some((p) => resultOf(`p:${p.id}`))

  const currentKey: ResultKey | null =
    choice === 'prompt' ? (selectedPrompt ? `p:${selectedPrompt.id}` : null) : choice
  const current = currentKey ? resultOf(currentKey) : undefined
  const isRunningThis = running !== null && running.key === currentKey

  async function run() {
    if (!currentKey) return
    const requestId = crypto.randomUUID()
    const label =
      choice === 'prompt' ? `prompt "${selectedPrompt!.title}"` : AI_TASK_INFO[choice].label
    const r: Running = { key: currentKey, label, requestId, text: '' }
    runningRef.current = r
    setRunning(r)
    setError(null)
    try {
      const analysis = await unwrap(
        choice === 'prompt'
          ? window.nexus.ai.analyzeWithPrompt({
              documentId,
              promptId: selectedPrompt!.id,
              requestId
            })
          : window.nexus.ai.analyze({ documentId, task: choice, requestId })
      )
      setResults((prev) => ({ ...prev, [keyOf(analysis)]: analysis }))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      runningRef.current = null
      setRunning(null)
    }
  }

  async function cancel() {
    if (running) await window.nexus.ai.cancel({ requestId: running.requestId })
  }

  async function copy() {
    if (!current) return
    await navigator.clipboard.writeText(current.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (status.status === 'loading') return <Loading />
  if (status.status === 'error') return <ErrorBanner message={status.error} />
  if (!status.data.hasKey) {
    return (
      <div className="rounded-md border border-dashed border-border p-6 text-center text-[13px]">
        <p className="font-medium">Chưa có Gemini API key</p>
        <p className="mt-1 text-muted">
          Vào{' '}
          <Link to="/settings" className="text-accent hover:underline">
            Cài đặt
          </Link>{' '}
          để nhập API key, sau đó quay lại đây để AI nhận xét tài liệu.
        </p>
      </div>
    )
  }

  const cardClass = (active: boolean) =>
    `rounded-md border px-3 py-2 text-left transition-colors ${
      active
        ? 'border-accent bg-accent/10'
        : 'border-border hover:border-muted/50 hover:bg-surface-2/50'
    }`

  return (
    <div>
      <div className="grid grid-cols-4 gap-2">
        {AI_TASKS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setChoice(t)}
            className={cardClass(choice === t)}
          >
            <p className="text-[13px] font-medium">
              {AI_TASK_INFO[t].label}
              {resultOf(t) && <span className="ml-1.5 text-success">✓</span>}
              {running?.key === t && <span className="ml-1.5 text-accent">…</span>}
            </p>
            <p className="mt-0.5 text-[11px] text-muted">{AI_TASK_INFO[t].description}</p>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setChoice('prompt')}
          className={cardClass(choice === 'prompt')}
        >
          <p className="text-[13px] font-medium">
            Prompt của tôi
            {customDone && <span className="ml-1.5 text-success">✓</span>}
            {running?.key.startsWith('p:') && <span className="ml-1.5 text-accent">…</span>}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            Chạy một yêu cầu bạn đã lưu trong Thư viện prompt.
          </p>
        </button>
      </div>

      {choice === 'prompt' && (
        <div className="mt-3 flex items-center gap-2">
          {prompts.status === 'loading' ? (
            <Loading />
          ) : promptList.length === 0 ? (
            <p className="text-[13px] text-muted">
              Thư viện chưa có prompt nào.{' '}
              <Link to="/prompts?id=new" className="text-accent hover:underline">
                Thêm prompt
              </Link>
            </p>
          ) : (
            <>
              <Select
                value={selectedPrompt ? String(selectedPrompt.id) : ''}
                onChange={(e) => setPromptId(Number(e.target.value))}
                disabled={running !== null}
                className="max-w-md min-w-64"
              >
                {promptList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                    {p.category ? ` · ${p.category}` : ''}
                    {resultOf(`p:${p.id}`) ? ' ✓' : ''}
                  </option>
                ))}
              </Select>
              {selectedPrompt && (
                <Link
                  to={`/prompts?id=${selectedPrompt.id}`}
                  className="text-[12px] text-accent hover:underline"
                >
                  Xem / sửa prompt
                </Link>
              )}
            </>
          )}
        </div>
      )}
      {choice === 'prompt' && selectedPrompt && (
        <p className="mt-2 line-clamp-2 text-[11px] text-muted">{selectedPrompt.preview}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {isRunningThis ? (
          <Button variant="danger" onClick={cancel}>
            Hủy
          </Button>
        ) : (
          <Button variant="primary" onClick={run} disabled={running !== null || !currentKey}>
            {current ? 'Chạy lại' : 'Chạy phân tích'}
          </Button>
        )}
        {current && !isRunningThis && (
          <Button variant="ghost" onClick={copy}>
            {copied ? 'Đã sao chép' : 'Sao chép kết quả'}
          </Button>
        )}
        {running && !isRunningThis && (
          <span className="text-[12px] text-muted">Đang chạy {running.label}…</span>
        )}
        {current && !isRunningThis && (
          <span className="ml-auto text-[11px] text-muted">
            {current.model} · {formatDateTime(current.createdAt)}
          </span>
        )}
      </div>

      <div className="mt-4">
        {error && <ErrorBanner message={error} onClose={() => setError(null)} />}
        {isRunningThis ? (
          running.text ? (
            <div className="rounded-md border border-accent/30 p-4">
              <Markdown text={running.text} />
              <p className="mt-3 animate-pulse text-[12px] text-accent">AI đang viết…</p>
            </div>
          ) : (
            <p className="animate-pulse text-[13px] text-muted">
              Đang gửi tài liệu cho Gemini, chờ chút…
            </p>
          )
        ) : current ? (
          <div className="rounded-md border border-border p-4">
            {current.truncated && (
              <p className="mb-3 rounded bg-amber-500/10 px-3 py-1.5 text-[12px] text-amber-300">
                Tài liệu dài nên AI chỉ đọc 100.000 ký tự đầu.
              </p>
            )}
            <Markdown text={current.content} />
          </div>
        ) : (
          saved.status === 'ready' &&
          currentKey && (
            <p className="text-[13px] text-muted">
              Bấm &quot;Chạy phân tích&quot; để Gemini{' '}
              {choice === 'prompt'
                ? `thực hiện prompt "${selectedPrompt?.title}" trên`
                : `${AI_TASK_INFO[choice].label.toLowerCase()}`}{' '}
              tài liệu này. Nội dung tài liệu sẽ được gửi tới Google Gemini.
            </p>
          )
        )}
        <p className="mt-4 text-[11px] text-muted/70">
          Nhận xét của AI chỉ mang tính tham khảo, hãy tự kiểm tra lại trước khi sửa bài.
        </p>
      </div>
    </div>
  )
}
