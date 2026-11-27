import { useEffect, useState } from 'react'
import { DEFAULT_FORMAT_RULES, formatRulesSchema, type FormatRules } from '@shared/format'
import { Button, ErrorBanner, InfoBanner, Loading, Panel, TextInput } from '@renderer/components/ui'
import { DocumentIcon } from '@renderer/components/icons'
import { errorMessage, unwrap } from '@renderer/lib/api'

/** Form giữ số dạng chuỗi để người dùng gõ thoải mái (cho phép dấu phẩy thập phân). */
type Form = {
  fontFamily: string
  bodyFontSizePt: string
  lineSpacing: string
  beforeMin: string
  beforeMax: string
  afterMin: string
  afterMax: string
  justifyBody: boolean
  indentEnabled: boolean
  indentMin: string
  indentMax: string
  top: string
  bottom: string
  left: string
  right: string
  checkHeadingOrder: boolean
}

const s = (n: number) => String(n).replace('.', ',')
const toNum = (v: string) => Number(v.trim().replace(',', '.'))

function toForm(r: FormatRules): Form {
  const indent = r.firstLineIndentCm ?? DEFAULT_FORMAT_RULES.firstLineIndentCm ?? { min: 1, max: 1 }
  return {
    fontFamily: r.fontFamily,
    bodyFontSizePt: s(r.bodyFontSizePt),
    lineSpacing: s(r.lineSpacing),
    beforeMin: s(r.spaceBeforePt.min),
    beforeMax: s(r.spaceBeforePt.max),
    afterMin: s(r.spaceAfterPt.min),
    afterMax: s(r.spaceAfterPt.max),
    justifyBody: r.justifyBody,
    indentEnabled: r.firstLineIndentCm !== null,
    indentMin: s(indent.min),
    indentMax: s(indent.max),
    top: s(r.marginsCm.top),
    bottom: s(r.marginsCm.bottom),
    left: s(r.marginsCm.left),
    right: s(r.marginsCm.right),
    checkHeadingOrder: r.checkHeadingOrder
  }
}

function fromForm(f: Form) {
  return formatRulesSchema.safeParse({
    fontFamily: f.fontFamily,
    bodyFontSizePt: toNum(f.bodyFontSizePt),
    lineSpacing: toNum(f.lineSpacing),
    spaceBeforePt: { min: toNum(f.beforeMin), max: toNum(f.beforeMax) },
    spaceAfterPt: { min: toNum(f.afterMin), max: toNum(f.afterMax) },
    justifyBody: f.justifyBody,
    firstLineIndentCm: f.indentEnabled
      ? { min: toNum(f.indentMin), max: toNum(f.indentMax) }
      : null,
    marginsCm: {
      top: toNum(f.top),
      bottom: toNum(f.bottom),
      left: toNum(f.left),
      right: toNum(f.right)
    },
    checkHeadingOrder: f.checkHeadingOrder
  })
}

export function FormatRulesPanel() {
  const [form, setForm] = useState<Form | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    unwrap(window.nexus.format.getRules())
      .then((r) => active && setForm(toForm(r)))
      .catch((err: unknown) => active && setError(errorMessage(err)))
    return () => {
      active = false
    }
  }, [])

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f))

  async function save() {
    if (!form) return
    const parsed = fromForm(form)
    if (!parsed.success) {
      setNotice(null)
      return setError(parsed.error.issues[0]?.message ?? 'Giá trị không hợp lệ')
    }
    setBusy(true)
    setError(null)
    try {
      setForm(toForm(await unwrap(window.nexus.format.saveRules(parsed.data))))
      setNotice('Đã lưu quy tắc. Lần kiểm tra tiếp theo sẽ dùng quy tắc mới.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function reset() {
    if (!window.confirm('Khôi phục quy tắc mặc định (Times New Roman 13, giãn 1,5 dòng...)?'))
      return
    setBusy(true)
    setError(null)
    try {
      setForm(toForm(await unwrap(window.nexus.format.resetRules())))
      setNotice('Đã khôi phục quy tắc mặc định.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Quy tắc định dạng báo cáo" icon={<DocumentIcon />}>
      {error && <ErrorBanner message={error} onClose={() => setError(null)} />}
      {notice && <InfoBanner onClose={() => setNotice(null)}>{notice}</InfoBanner>}
      {!form ? (
        !error && <Loading />
      ) : (
        <div className="space-y-5">
          <p className="text-[12px] text-muted">
            Mỗi trường có quy định trình bày riêng. Sửa các con số dưới đây theo hướng dẫn của
            trường/khoa bạn.
          </p>

          <Group title="Chữ">
            <Field label="Font chữ">
              <div className="w-56">
                <TextInput
                  value={form.fontFamily}
                  onChange={(e) => set('fontFamily', e.target.value)}
                />
              </div>
            </Field>
            <Field label="Cỡ chữ thân bài" unit="pt">
              <Num value={form.bodyFontSizePt} onChange={(v) => set('bodyFontSizePt', v)} />
            </Field>
          </Group>

          <Group title="Đoạn văn">
            <Field label="Giãn dòng" unit="dòng">
              <Num value={form.lineSpacing} onChange={(v) => set('lineSpacing', v)} />
            </Field>
            <Field label="Cách trước đoạn" unit="pt">
              <Range
                min={form.beforeMin}
                max={form.beforeMax}
                onMin={(v) => set('beforeMin', v)}
                onMax={(v) => set('beforeMax', v)}
              />
            </Field>
            <Field label="Cách sau đoạn" unit="pt">
              <Range
                min={form.afterMin}
                max={form.afterMax}
                onMin={(v) => set('afterMin', v)}
                onMax={(v) => set('afterMax', v)}
              />
            </Field>
            <Field label="Thụt đầu dòng" unit="cm">
              <Check
                checked={form.indentEnabled}
                onChange={(v) => set('indentEnabled', v)}
                label="Kiểm tra"
              />
              {form.indentEnabled && (
                <Range
                  min={form.indentMin}
                  max={form.indentMax}
                  onMin={(v) => set('indentMin', v)}
                  onMax={(v) => set('indentMax', v)}
                />
              )}
            </Field>
            <Field label="Căn lề">
              <Check
                checked={form.justifyBody}
                onChange={(v) => set('justifyBody', v)}
                label="Đoạn thân bài phải căn đều hai bên"
              />
            </Field>
          </Group>

          <Group title="Lề trang (cm)">
            <Field label="Trên">
              <Num value={form.top} onChange={(v) => set('top', v)} />
            </Field>
            <Field label="Dưới">
              <Num value={form.bottom} onChange={(v) => set('bottom', v)} />
            </Field>
            <Field label="Trái">
              <Num value={form.left} onChange={(v) => set('left', v)} />
            </Field>
            <Field label="Phải">
              <Num value={form.right} onChange={(v) => set('right', v)} />
            </Field>
          </Group>

          <Group title="Heading">
            <Field label="Thứ tự">
              <Check
                checked={form.checkHeadingOrder}
                onChange={(v) => set('checkHeadingOrder', v)}
                label="Báo lỗi khi heading nhảy cấp (ví dụ Chương → 1.1.1)"
              />
            </Field>
          </Group>

          <div className="flex gap-2 border-t border-border pt-4">
            <Button variant="primary" onClick={save} disabled={busy}>
              Lưu quy tắc
            </Button>
            <Button variant="ghost" onClick={reset} disabled={busy}>
              Khôi phục mặc định
            </Button>
          </div>
        </div>
      )}
    </Panel>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2 text-[12px] font-semibold tracking-wide text-muted uppercase">
        {title}
      </legend>
      <div className="space-y-2">{children}</div>
    </fieldset>
  )
}

function Field({
  label,
  unit,
  children
}: {
  label: string
  unit?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[160px_minmax(0,1fr)] items-center gap-4">
      <span className="text-[13px]">{label}</span>
      <div className="flex items-center gap-2">
        {children}
        {unit && <span className="text-[12px] text-muted">{unit}</span>}
      </div>
    </div>
  )
}

function Num({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="w-20 shrink-0">
      <TextInput
        value={value}
        inputMode="decimal"
        onChange={(e) => onChange(e.target.value)}
        className="text-right"
      />
    </div>
  )
}

function Range(props: {
  min: string
  max: string
  onMin: (v: string) => void
  onMax: (v: string) => void
}) {
  return (
    <>
      <span className="text-[12px] text-muted">từ</span>
      <Num value={props.min} onChange={props.onMin} />
      <span className="text-[12px] text-muted">đến</span>
      <Num value={props.max} onChange={props.onMax} />
    </>
  )
}

function Check({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[13px]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[var(--color-accent)]"
      />
      {label}
    </label>
  )
}
