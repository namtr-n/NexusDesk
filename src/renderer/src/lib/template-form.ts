/**
 * Chuyển đổi giữa TemplateSpec và dạng chữ trong form sửa mẫu.
 * Quy ước nhập: để trống = không kiểm tra · khoảng "0-12" · giãn dòng "1,5" (bội số),
 * "18 pt" (chính xác), "≥18 pt" (tối thiểu) · dấu phẩy hoặc chấm thập phân đều được.
 */
import {
  categoryLabel,
  HEADING_LEVELS,
  templateSpecSchema,
  type Alignment,
  type CategorySpec,
  type LineSpacingSpec,
  type Range,
  type TemplateSpec
} from '@shared/format'

export interface CategoryForm {
  font: string
  size: string
  bold: '' | 'true' | 'false'
  line: string
  before: string
  after: string
  align: '' | Alignment
  indent: string
}

export interface TemplateForm {
  name: string
  categories: { key: 'body' | 'caption' | number; label: string; value: CategoryForm }[]
  checkMargins: boolean
  margins: { top: string; bottom: string; left: string; right: string }
  checkHeadingOrder: boolean
}

const num = (n: number): string => String(Number(n.toFixed(2))).replace('.', ',')

function rangeToText(r: Range | null): string {
  if (!r) return ''
  return r.min === r.max ? num(r.min) : `${num(r.min)}-${num(r.max)}`
}

function lineToText(ls: LineSpacingSpec | null): string {
  if (!ls) return ''
  const v = rangeToText(ls)
  if (ls.rule === 'exact') return `${v} pt`
  if (ls.rule === 'atLeast') return `≥${v} pt`
  return v
}

function categoryToForm(c: CategorySpec): CategoryForm {
  return {
    font: c.fontFamily ?? '',
    size: rangeToText(c.fontSizePt),
    bold: c.bold === null ? '' : c.bold ? 'true' : 'false',
    line: lineToText(c.lineSpacing),
    before: rangeToText(c.spaceBeforePt),
    after: rangeToText(c.spaceAfterPt),
    align: c.alignment ?? '',
    indent: rangeToText(c.firstLineIndentCm)
  }
}

export function specToForm(name: string, spec: TemplateSpec): TemplateForm {
  const m = spec.marginsCm
  return {
    name,
    categories: [
      { key: 'body', label: categoryLabel('body'), value: categoryToForm(spec.body) },
      ...spec.headings.map((h, i) => ({
        key: i,
        label: categoryLabel(i),
        value: categoryToForm(h)
      })),
      { key: 'caption', label: 'Chú thích', value: categoryToForm(spec.caption) }
    ],
    checkMargins: m !== null,
    margins: {
      top: m ? num(m.top) : '2',
      bottom: m ? num(m.bottom) : '2',
      left: m ? num(m.left) : '3',
      right: m ? num(m.right) : '2'
    },
    checkHeadingOrder: spec.checkHeadingOrder
  }
}

class FormError extends Error {}

const NUMBER = String.raw`(-?\d+(?:[.,]\d+)?)`
const RANGE_RE = new RegExp(String.raw`^${NUMBER}(?:\s*[-–]\s*${NUMBER})?$`)

function parseRange(text: string, where: string): Range | null {
  const t = text.trim()
  if (!t) return null
  const m = RANGE_RE.exec(t)
  if (!m) throw new FormError(`${where}: "${text}" không hợp lệ (ví dụ: 13 hoặc 0-12)`)
  const min = Number(m[1].replace(',', '.'))
  const max = m[2] !== undefined ? Number(m[2].replace(',', '.')) : min
  if (min > max) throw new FormError(`${where}: giá trị đầu phải nhỏ hơn giá trị sau`)
  return { min, max }
}

function parseLine(text: string, where: string): LineSpacingSpec | null {
  let t = text.trim().toLowerCase()
  if (!t) return null
  let rule: LineSpacingSpec['rule'] = 'multiple'
  if (t.startsWith('>=') || t.startsWith('≥')) {
    rule = 'atLeast'
    t = t.replace(/^(>=|≥)/, '')
  }
  if (t.endsWith('pt')) {
    if (rule === 'multiple') rule = 'exact'
    t = t.slice(0, -2)
  } else if (rule === 'atLeast') {
    throw new FormError(`${where}: giãn dòng tối thiểu phải ghi đơn vị pt (ví dụ ≥18 pt)`)
  }
  const r = parseRange(t, where)
  if (!r || r.min <= 0) throw new FormError(`${where}: giãn dòng phải lớn hơn 0`)
  return { rule, ...r }
}

function parseMargin(text: string, where: string): number {
  const n = Number(text.trim().replace(',', '.'))
  if (!text.trim() || !Number.isFinite(n) || n < 0 || n > 10) {
    throw new FormError(`${where}: nhập số cm từ 0 đến 10`)
  }
  return n
}

function formToCategory(f: CategoryForm, label: string): CategorySpec {
  return {
    fontFamily: f.font.trim() || null,
    fontSizePt: parseRange(f.size, `${label} – Cỡ chữ`),
    bold: f.bold === '' ? null : f.bold === 'true',
    lineSpacing: parseLine(f.line, `${label} – Giãn dòng`),
    spaceBeforePt: parseRange(f.before, `${label} – Cách trước`),
    spaceAfterPt: parseRange(f.after, `${label} – Cách sau`),
    alignment: f.align || null,
    firstLineIndentCm: parseRange(f.indent, `${label} – Thụt đầu dòng`)
  }
}

export function formToSpec(form: TemplateForm): { spec: TemplateSpec } | { error: string } {
  try {
    const byKey = new Map(form.categories.map((c) => [c.key, c]))
    const cat = (key: 'body' | 'caption' | number): CategorySpec => {
      const c = byKey.get(key)!
      return formToCategory(c.value, c.label)
    }
    const spec: TemplateSpec = {
      body: cat('body'),
      headings: Array.from({ length: HEADING_LEVELS }, (_, i) => cat(i)),
      caption: cat('caption'),
      marginsCm: form.checkMargins
        ? {
            top: parseMargin(form.margins.top, 'Lề trên'),
            bottom: parseMargin(form.margins.bottom, 'Lề dưới'),
            left: parseMargin(form.margins.left, 'Lề trái'),
            right: parseMargin(form.margins.right, 'Lề phải')
          }
        : null,
      checkHeadingOrder: form.checkHeadingOrder
    }
    const parsed = templateSpecSchema.safeParse(spec)
    if (!parsed.success)
      return { error: parsed.error.issues[0]?.message ?? 'Thông số không hợp lệ' }
    return { spec: parsed.data }
  } catch (err) {
    if (err instanceof FormError) return { error: err.message }
    throw err
  }
}
