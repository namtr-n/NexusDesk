import { useCallback, useEffect, useState } from 'react'
import type { Alignment, FormatTemplate } from '@shared/format'
import { Button, ErrorBanner, InfoBanner, Loading, TextInput } from '@renderer/components/ui'
import { useAsyncData } from '@renderer/hooks/useAsyncData'
import { errorMessage, unwrap } from '@renderer/lib/api'
import { formatDateTime } from '@renderer/lib/format'
import {
  formToSpec,
  specToForm,
  type CategoryForm,
  type TemplateForm
} from '@renderer/lib/template-form'

const SHORT_ALIGN: Record<Alignment, string> = {
  left: 'Trái',
  center: 'Giữa',
  right: 'Phải',
  justify: 'Đều'
}

interface Props {
  id: number
  onChanged: () => void
  onRemoved: () => void
}

export function TemplateEditor({ id, onChanged, onRemoved }: Props) {
  const load = useCallback(() => unwrap(window.nexus.templates.get({ id })), [id])
  const state = useAsyncData(load)

  if (state.status === 'loading') return <Loading />
  if (state.status === 'error') return <ErrorBanner message={state.error} />
  return <EditorForm template={state.data} onChanged={onChanged} onRemoved={onRemoved} />
}

function EditorForm({
  template,
  onChanged,
  onRemoved
}: {
  template: FormatTemplate
  onChanged: () => void
  onRemoved: () => void
}) {
  const [form, setForm] = useState<TemplateForm>(() => specToForm(template.name, template.spec))
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(t)
  }, [notice])

  const update = (fn: (f: TemplateForm) => TemplateForm) => {
    setForm(fn)
    setDirty(true)
  }
  const setCat = (index: number, key: keyof CategoryForm, value: string) =>
    update((f) => ({
      ...f,
      categories: f.categories.map((c, i) =>
        i === index ? { ...c, value: { ...c.value, [key]: value } } : c
      )
    }))

  async function run(action: () => Promise<unknown>, message: string): Promise<boolean> {
    setBusy(true)
    setError(null)
    try {
      await action()
      setNotice(message)
      onChanged()
      return true
    } catch (err) {
      setError(errorMessage(err))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    const parsed = formToSpec(form)
    if ('error' in parsed) return setError(parsed.error)
    const ok = await run(
      () =>
        unwrap(
          window.nexus.templates.update({ id: template.id, name: form.name, spec: parsed.spec })
        ),
      'Đã lưu mẫu.'
    )
    if (ok) setDirty(false)
  }

  async function remove() {
    if (!window.confirm(`Xóa mẫu "${template.name}"? Lịch sử kiểm tra cũ vẫn được giữ.`)) return
    setBusy(true)
    try {
      await unwrap(window.nexus.templates.remove({ id: template.id }))
      onRemoved()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  const learned = template.learned

  return (
    <section className="rounded-lg border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border p-4">
        <div className="min-w-0 flex-1">
          <TextInput
            value={form.name}
            maxLength={100}
            onChange={(e) => update((f) => ({ ...f, name: e.target.value }))}
            className="max-w-md text-[14px] font-semibold"
          />
          <p className="mt-1 text-[11px] text-muted">
            Cập nhật {formatDateTime(template.updatedAt)}
          </p>
        </div>
        {!template.isDefault && (
          <Button
            onClick={() =>
              run(
                () => unwrap(window.nexus.templates.setDefault({ id: template.id })),
                'Đã đặt làm mẫu mặc định.'
              )
            }
            disabled={busy}
          >
            Đặt làm mặc định
          </Button>
        )}
        <Button variant="danger" onClick={remove} disabled={busy}>
          Xóa
        </Button>
        <Button variant="primary" onClick={save} disabled={busy || !dirty}>
          Lưu mẫu
        </Button>
      </div>

      <div className="space-y-4 p-4">
        {error && <ErrorBanner message={error} onClose={() => setError(null)} />}
        {notice && <InfoBanner onClose={() => setNotice(null)}>{notice}</InfoBanner>}

        {learned && (
          <div className="rounded-md border border-border bg-bg/40 px-3 py-2.5 text-[12px]">
            <p>
              Học từ <b>{learned.sourceName}</b>: {learned.bodyParagraphs} đoạn thân bài,{' '}
              {learned.headingParagraphs
                .map((n, i) => (n > 0 ? `${n} Heading ${i + 1}` : null))
                .filter(Boolean)
                .join(', ') || 'không có heading'}
              , {learned.captionParagraphs} chú thích.
            </p>
            {learned.warnings.length > 0 && (
              <ul className="mt-1.5 space-y-1 text-amber-300">
                {learned.warnings.map((w, i) => (
                  <li key={i}>⚠ {w}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <p className="text-[12px] text-muted">
          Ô để trống = không kiểm tra. Nhập khoảng như <code>0-12</code>. Giãn dòng:{' '}
          <code>1,5</code> (bội số), <code>18 pt</code> (chính xác), <code>≥18 pt</code> (tối
          thiểu). Thụt đầu dòng âm = thụt treo.
        </p>

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[760px] table-fixed text-left text-[12px]">
            <thead className="bg-surface-2 text-muted">
              <tr>
                <Th className="w-24">Loại đoạn</Th>
                <Th className="w-36">Font</Th>
                <Th className="w-16">Cỡ (pt)</Th>
                <Th className="w-20">In đậm</Th>
                <Th className="w-20">Giãn dòng</Th>
                <Th className="w-16">Trước (pt)</Th>
                <Th className="w-16">Sau (pt)</Th>
                <Th className="w-20">Căn lề</Th>
                <Th className="w-20">Thụt (cm)</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {form.categories.map((c, i) => (
                <tr key={String(c.key)}>
                  <td className="px-2 py-1.5 font-medium whitespace-nowrap">{c.label}</td>
                  <Cell value={c.value.font} onChange={(v) => setCat(i, 'font', v)} />
                  <Cell value={c.value.size} onChange={(v) => setCat(i, 'size', v)} />
                  <td className="px-1 py-1">
                    <MiniSelect
                      value={c.value.bold}
                      onChange={(v) => setCat(i, 'bold', v)}
                      options={[
                        ['', '—'],
                        ['true', 'Đậm'],
                        ['false', 'Thường']
                      ]}
                    />
                  </td>
                  <Cell value={c.value.line} onChange={(v) => setCat(i, 'line', v)} />
                  <Cell value={c.value.before} onChange={(v) => setCat(i, 'before', v)} />
                  <Cell value={c.value.after} onChange={(v) => setCat(i, 'after', v)} />
                  <td className="px-1 py-1">
                    <MiniSelect
                      value={c.value.align}
                      onChange={(v) => setCat(i, 'align', v)}
                      options={[
                        ['', '—'],
                        ...(Object.entries(SHORT_ALIGN) as [Alignment, string][])
                      ]}
                    />
                  </td>
                  <Cell value={c.value.indent} onChange={(v) => setCat(i, 'indent', v)} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-[13px]">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={form.checkMargins}
              onChange={(e) => update((f) => ({ ...f, checkMargins: e.target.checked }))}
              className="size-4 accent-[var(--color-accent)]"
            />
            Kiểm tra lề trang (cm)
          </label>
          {form.checkMargins &&
            (['top', 'bottom', 'left', 'right'] as const).map((side) => (
              <label key={side} className="flex items-center gap-1.5 text-[12px] text-muted">
                {{ top: 'Trên', bottom: 'Dưới', left: 'Trái', right: 'Phải' }[side]}
                <div className="w-16">
                  <TextInput
                    value={form.margins[side]}
                    onChange={(e) =>
                      update((f) => ({ ...f, margins: { ...f.margins, [side]: e.target.value } }))
                    }
                    className="text-right"
                  />
                </div>
              </label>
            ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={form.checkHeadingOrder}
            onChange={(e) => update((f) => ({ ...f, checkHeadingOrder: e.target.checked }))}
            className="size-4 accent-[var(--color-accent)]"
          />
          Báo lỗi khi heading nhảy cấp (ví dụ Heading 1 → Heading 3)
        </label>
      </div>
    </section>
  )
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-2 py-1.5 font-medium ${className}`}>{children}</th>
}

function Cell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <td className="px-1 py-1">
      <input
        value={value}
        title={value}
        placeholder="—"
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-full rounded border border-transparent bg-transparent px-1.5 text-[12px] text-text placeholder:text-muted/50 hover:border-border focus:border-accent focus:bg-bg focus:outline-none"
      />
    </td>
  )
}

function MiniSelect<T extends string>({
  value,
  onChange,
  options
}: {
  value: T
  onChange: (v: T) => void
  options: [T, string][]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="h-7 w-full rounded border border-transparent bg-transparent px-1 text-[12px] text-text hover:border-border focus:border-accent focus:bg-bg focus:outline-none"
    >
      {options.map(([v, label]) => (
        <option key={v} value={v} className="bg-surface">
          {label}
        </option>
      ))}
    </select>
  )
}
