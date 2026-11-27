import { useCallback, useEffect, useState } from 'react'
import type { Project } from '@shared/ipc-contract'
import { PROMPT_CONTENT_MAX, type Prompt, type PromptVersion } from '@shared/prompts'
import { Button, ErrorBanner, Loading, Select, TextInput } from '@renderer/components/ui'
import { errorMessage, unwrap } from '@renderer/lib/api'
import { formatDateTime, formatNumber } from '@renderer/lib/format'
import {
  EMPTY_PROMPT_FORM,
  formToFields,
  isFormDirty,
  promptToForm,
  type PromptForm
} from '@renderer/lib/prompt-form'

export function PromptEditor({
  id,
  projects,
  categories,
  onSaved,
  onRemoved,
  onCancelNew
}: {
  /** null = tạo prompt mới */
  id: number | null
  projects: Project[]
  categories: string[]
  onSaved: (id: number) => void
  onRemoved: () => void
  onCancelNew: () => void
}) {
  const [prompt, setPrompt] = useState<Prompt | null>(null)
  const [saved, setSaved] = useState<PromptForm>(EMPTY_PROMPT_FORM)
  const [form, setForm] = useState<PromptForm>(EMPTY_PROMPT_FORM)
  const [loading, setLoading] = useState(id !== null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [historyVersion, setHistoryVersion] = useState(0)

  const apply = useCallback((p: Prompt) => {
    setPrompt(p)
    const f = promptToForm(p)
    setSaved(f)
    setForm(f)
  }, [])

  useEffect(() => {
    if (id === null) return
    let active = true
    unwrap(window.nexus.prompts.get({ id }))
      .then((p) => active && apply(p))
      .catch((err: unknown) => active && setError(errorMessage(err)))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [id, apply])

  const dirty = isFormDirty(form, saved)
  const set = <K extends keyof PromptForm>(key: K, value: PromptForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const save = () =>
    run(async () => {
      const fields = formToFields(form)
      if (id === null) {
        const p = await unwrap(window.nexus.prompts.create(fields))
        onSaved(p.id)
      } else {
        const p = await unwrap(window.nexus.prompts.update({ id, ...fields }))
        apply(p)
        setHistoryVersion((v) => v + 1)
        onSaved(p.id)
      }
    })

  const duplicate = () =>
    run(async () => {
      if (id === null) return
      const p = await unwrap(window.nexus.prompts.duplicate({ id }))
      onSaved(p.id)
    })

  const remove = () => {
    if (!prompt) return
    if (!window.confirm(`Xóa prompt "${prompt.title}"? Lịch sử phiên bản cũng bị xóa.`)) return
    void run(async () => {
      await unwrap(window.nexus.prompts.remove({ id: prompt.id }))
      onRemoved()
    })
  }

  async function copy() {
    await navigator.clipboard.writeText(form.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (loading) return <Loading />
  if (id !== null && !prompt) return <ErrorBanner message={error ?? 'Không tải được prompt.'} />

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-surface p-4">
        {error && <ErrorBanner message={error} onClose={() => setError(null)} />}
        <div className="space-y-3">
          <Field label="Tiêu đề">
            <TextInput
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Ví dụ: Câu hỏi phản biện của hội đồng"
              maxLength={120}
              autoFocus={id === null}
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Danh mục">
              <TextInput
                value={form.category}
                onChange={(e) => set('category', e.target.value)}
                list="prompt-categories"
                placeholder="Ví dụ: Bảo vệ đồ án"
                maxLength={40}
              />
              <datalist id="prompt-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Tag (cách nhau bằng dấu phẩy)">
              <TextInput
                value={form.tagsText}
                onChange={(e) => set('tagsText', e.target.value)}
                placeholder="slide, thuyết trình"
              />
            </Field>
            <Field label="Dự án">
              <Select
                value={form.project}
                onChange={(e) => set('project', e.target.value)}
                className="w-full"
              >
                <option value="none">— Không gắn dự án —</option>
                {projects.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field
            label="Nội dung prompt"
            hint={`${formatNumber(form.content.length)} / ${formatNumber(PROMPT_CONTENT_MAX)} ký tự`}
          >
            <textarea
              value={form.content}
              onChange={(e) => set('content', e.target.value)}
              maxLength={PROMPT_CONTENT_MAX}
              rows={14}
              spellCheck={false}
              placeholder={
                'Viết yêu cầu cho AI. Ví dụ:\nĐóng vai giảng viên hướng dẫn. Đọc tài liệu và liệt kê 5 điểm cần sửa nhất, mỗi điểm nêu vị trí và cách sửa.'
              }
              className="w-full resize-y rounded-md border border-border bg-bg px-3 py-2 text-[13px] leading-relaxed text-text placeholder:text-muted/60 focus:border-accent focus:outline-none"
            />
          </Field>
          <p className="text-[11px] text-muted">
            Khi chạy trên một tài liệu, app tự gửi kèm toàn văn tài liệu sau prompt — không cần dán
            nội dung bài vào đây.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            onClick={save}
            disabled={busy || !dirty || !form.title.trim() || !form.content.trim()}
          >
            {id === null ? 'Lưu prompt' : 'Lưu thay đổi'}
          </Button>
          {id === null ? (
            <Button variant="ghost" onClick={onCancelNew} disabled={busy}>
              Hủy
            </Button>
          ) : (
            <>
              {dirty && (
                <Button variant="ghost" onClick={() => setForm(saved)} disabled={busy}>
                  Bỏ thay đổi
                </Button>
              )}
              <Button onClick={copy} disabled={!form.content.trim()}>
                {copied ? 'Đã sao chép' : 'Sao chép nội dung'}
              </Button>
              <Button onClick={duplicate} disabled={busy}>
                Nhân bản
              </Button>
              <Button variant="danger" className="ml-auto" onClick={remove} disabled={busy}>
                Xóa
              </Button>
            </>
          )}
        </div>
        {prompt && (
          <p className="mt-3 text-[11px] text-muted">
            Sửa lần cuối {formatDateTime(prompt.updatedAt)}
            {prompt.useCount > 0 &&
              ` · đã dùng ${prompt.useCount} lần, gần nhất ${formatDateTime(prompt.lastUsedAt!)}`}
          </p>
        )}
      </section>

      {prompt && (
        <VersionHistory
          key={historyVersion}
          promptId={prompt.id}
          current={prompt}
          dirty={dirty}
          onRestored={(p) => {
            apply(p)
            setHistoryVersion((v) => v + 1)
            onSaved(p.id)
          }}
        />
      )}
    </div>
  )
}

function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between text-[12px] text-muted">
        {label}
        {hint && <span className="text-[11px] text-muted/70">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

function VersionHistory({
  promptId,
  current,
  dirty,
  onRestored
}: {
  promptId: number
  current: Prompt
  dirty: boolean
  onRestored: (p: Prompt) => void
}) {
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<PromptVersion[] | null>(null)
  const [viewing, setViewing] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let active = true
    unwrap(window.nexus.prompts.versions({ id: promptId }))
      .then((v) => active && setVersions(v))
      .catch((err: unknown) => active && setError(errorMessage(err)))
    return () => {
      active = false
    }
  }, [open, promptId])

  async function restore(v: PromptVersion) {
    const warn = dirty ? ' Những thay đổi chưa lưu trong ô soạn thảo sẽ mất.' : ''
    if (!window.confirm(`Khôi phục phiên bản lúc ${formatDateTime(v.createdAt)}?${warn}`)) return
    try {
      onRestored(await unwrap(window.nexus.prompts.restore({ id: promptId, versionId: v.id })))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const isCurrent = (v: PromptVersion) => v.title === current.title && v.content === current.content

  return (
    <section className="rounded-lg border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 w-full items-center justify-between px-4 text-left text-[13px] font-semibold"
      >
        <span>Lịch sử phiên bản ({current.versionCount})</span>
        <span className="text-[12px] font-normal text-muted">{open ? 'Thu gọn' : 'Xem'}</span>
      </button>
      {open && (
        <div className="border-t border-border p-4">
          {error && <ErrorBanner message={error} onClose={() => setError(null)} />}
          {!versions ? (
            !error && <Loading />
          ) : (
            <ul className="space-y-2">
              {versions.map((v, i) => (
                <li key={v.id} className="rounded-md border border-border px-3 py-2">
                  <div className="flex items-center gap-2 text-[12px]">
                    <span className="font-medium">{formatDateTime(v.createdAt)}</span>
                    <span className="truncate text-muted">{v.title}</span>
                    {i === versions.length - 1 && (
                      <span className="text-[10px] text-muted">(bản đầu tiên)</span>
                    )}
                    <span className="ml-auto flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        className="h-6 px-2 text-[12px]"
                        onClick={() => setViewing(viewing === v.id ? null : v.id)}
                      >
                        {viewing === v.id ? 'Ẩn' : 'Xem'}
                      </Button>
                      {isCurrent(v) ? (
                        <span className="px-2 text-[11px] leading-6 text-success">Đang dùng</span>
                      ) : (
                        <Button
                          variant="ghost"
                          className="h-6 px-2 text-[12px]"
                          onClick={() => restore(v)}
                        >
                          Khôi phục
                        </Button>
                      )}
                    </span>
                  </div>
                  {viewing === v.id && (
                    <pre className="mt-2 max-h-64 overflow-auto rounded bg-bg p-2 font-sans text-[12px] whitespace-pre-wrap text-text/90 select-text">
                      {v.content}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
