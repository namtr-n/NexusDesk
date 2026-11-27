/**
 * Mẫu định dạng (template) và kết quả kiểm tra DOCX — dùng chung cho main và giao diện.
 *
 * Một mẫu mô tả định dạng mong muốn cho TỪNG LOẠI ĐOẠN: thân bài, heading cấp 1–4,
 * chú thích hình/bảng, cộng với lề trang. Giá trị null = không kiểm tra mục đó.
 */
import { z } from 'zod'

// ---------- Kiểu dữ liệu ----------

const rangeSchema = z
  .object({ min: z.number(), max: z.number() })
  .refine((r) => r.min <= r.max, 'Giá trị "từ" phải nhỏ hơn hoặc bằng "đến"')

export type Range = z.infer<typeof rangeSchema>

export const alignmentSchema = z.enum(['left', 'center', 'right', 'justify'])
export type Alignment = z.infer<typeof alignmentSchema>

export const lineSpacingSchema = z
  .object({
    /** multiple: bội số dòng (1,5 dòng) · exact: chính xác N pt · atLeast: tối thiểu N pt */
    rule: z.enum(['multiple', 'exact', 'atLeast']),
    min: z.number().positive(),
    max: z.number().positive()
  })
  .refine((r) => r.min <= r.max, 'Giãn dòng: "từ" phải nhỏ hơn hoặc bằng "đến"')
export type LineSpacingSpec = z.infer<typeof lineSpacingSchema>

export const categorySpecSchema = z.object({
  fontFamily: z.string().trim().min(1).max(60).nullable(),
  fontSizePt: rangeSchema.nullable(),
  bold: z.boolean().nullable(),
  lineSpacing: lineSpacingSchema.nullable(),
  spaceBeforePt: rangeSchema.nullable(),
  spaceAfterPt: rangeSchema.nullable(),
  alignment: alignmentSchema.nullable(),
  /** Âm = thụt treo (hanging) */
  firstLineIndentCm: rangeSchema.nullable()
})
export type CategorySpec = z.infer<typeof categorySpecSchema>

export const HEADING_LEVELS = 4

export const templateSpecSchema = z.object({
  body: categorySpecSchema,
  /** headings[0] = Heading 1 ... headings[3] = Heading 4 (cấp sâu hơn dùng Heading 4) */
  headings: z.array(categorySpecSchema).length(HEADING_LEVELS),
  caption: categorySpecSchema,
  marginsCm: z
    .object({
      top: z.number().min(0).max(10),
      bottom: z.number().min(0).max(10),
      left: z.number().min(0).max(10),
      right: z.number().min(0).max(10)
    })
    .nullable(),
  checkHeadingOrder: z.boolean()
})
export type TemplateSpec = z.infer<typeof templateSpecSchema>

export const EMPTY_CATEGORY: CategorySpec = {
  fontFamily: null,
  fontSizePt: null,
  bold: null,
  lineSpacing: null,
  spaceBeforePt: null,
  spaceAfterPt: null,
  alignment: null,
  firstLineIndentCm: null
}

const exact = (v: number): Range => ({ min: v, max: v })

/** Mẫu có sẵn: chuẩn trình bày báo cáo / đồ án sinh viên phổ biến ở Việt Nam. */
export const DEFAULT_TEMPLATE_SPEC: TemplateSpec = {
  body: {
    fontFamily: 'Times New Roman',
    fontSizePt: exact(13),
    bold: null,
    lineSpacing: { rule: 'multiple', min: 1.5, max: 1.5 },
    spaceBeforePt: { min: 0, max: 12 },
    spaceAfterPt: { min: 0, max: 12 },
    alignment: 'justify',
    firstLineIndentCm: { min: 0.9, max: 1.3 }
  },
  headings: Array.from({ length: HEADING_LEVELS }, () => ({
    ...EMPTY_CATEGORY,
    fontFamily: 'Times New Roman',
    fontSizePt: { min: 13, max: 16 }
  })),
  caption: { ...EMPTY_CATEGORY, fontFamily: 'Times New Roman' },
  marginsCm: { top: 2, bottom: 2, left: 3, right: 2 },
  checkHeadingOrder: true
}

export const DEFAULT_TEMPLATE_NAME = 'Chuẩn báo cáo sinh viên'

// ---------- Mẫu đã lưu ----------

/** Thông tin về file mẫu đã dùng để "học" (null nếu mẫu tạo tay) */
export interface TemplateLearnInfo {
  sourceName: string
  bodyParagraphs: number
  headingParagraphs: number[]
  captionParagraphs: number
  warnings: string[]
}

export interface FormatTemplateSummary {
  id: number
  name: string
  isDefault: boolean
  sourceName: string | null
  updatedAt: number
}

export interface FormatTemplate extends FormatTemplateSummary {
  spec: TemplateSpec
  learned: TemplateLearnInfo | null
}

export const templateNameSchema = z
  .string('Tên mẫu phải là chữ')
  .trim()
  .min(1, 'Tên mẫu không được để trống')
  .max(100, 'Tên mẫu tối đa 100 ký tự')

// ---------- Kết quả kiểm tra ----------

export type FormatRuleId =
  | 'font-family'
  | 'font-size'
  | 'bold'
  | 'line-spacing'
  | 'spacing-before'
  | 'spacing-after'
  | 'alignment'
  | 'first-line-indent'
  | 'margin'
  | 'heading-order'

export const FORMAT_RULE_LABELS: Record<FormatRuleId, string> = {
  'font-family': 'Font chữ',
  'font-size': 'Cỡ chữ',
  bold: 'In đậm',
  'line-spacing': 'Giãn dòng',
  'spacing-before': 'Khoảng cách trước đoạn',
  'spacing-after': 'Khoảng cách sau đoạn',
  alignment: 'Căn lề đoạn văn',
  'first-line-indent': 'Thụt đầu dòng',
  margin: 'Lề trang',
  'heading-order': 'Thứ tự heading'
}

export interface FormatIssue {
  rule: FormatRuleId
  /** Số thứ tự đoạn (chỉ đếm đoạn có chữ, bắt đầu từ 1). null với lỗi cấp trang (lề). */
  paragraph: number | null
  /** Loại đoạn: "Thân bài", "Heading 1", "Chú thích", "Bảng"... */
  context: string
  /** Vài chữ đầu của đoạn để dễ tìm trong Word */
  excerpt: string
  actual: string
  expected: string
}

export interface FormatCheckStats {
  /** Tổng số đoạn có chữ */
  paragraphs: number
  /** Số đoạn thân bài (không tính heading, chú thích hình/bảng, mục lục, bảng) */
  bodyParagraphs: number
  headings: number
  sections: number
}

export interface FormatCheckResult {
  id: number
  documentId: number
  checkedAt: number
  templateId: number | null
  templateName: string
  spec: TemplateSpec
  stats: FormatCheckStats
  issues: FormatIssue[]
}

export type ReportFormat = 'docx' | 'md'

/** Gom lỗi theo loại, đúng thứ tự trong FORMAT_RULE_LABELS, bỏ loại không có lỗi. */
export function groupIssues(issues: FormatIssue[]): [FormatRuleId, FormatIssue[]][] {
  const order = Object.keys(FORMAT_RULE_LABELS) as FormatRuleId[]
  return order
    .map((rule) => [rule, issues.filter((i) => i.rule === rule)] as [FormatRuleId, FormatIssue[]])
    .filter(([, list]) => list.length > 0)
}

// ---------- Hiển thị giá trị ----------

export function fmtNum(n: number, digits = 2): string {
  return Number(n.toFixed(digits)).toLocaleString('vi-VN', { maximumFractionDigits: digits })
}

export function rangeText(r: Range, unit: string): string {
  return r.min === r.max ? `${fmtNum(r.min)} ${unit}` : `${fmtNum(r.min)}–${fmtNum(r.max)} ${unit}`
}

export function lineSpacingText(ls: LineSpacingSpec): string {
  const v = ls.min === ls.max ? fmtNum(ls.min) : `${fmtNum(ls.min)}–${fmtNum(ls.max)}`
  if (ls.rule === 'exact') return `Chính xác ${v} pt`
  if (ls.rule === 'atLeast') return `Tối thiểu ${v} pt`
  return `${v} dòng`
}

export const ALIGNMENT_LABELS: Record<Alignment, string> = {
  left: 'Căn trái',
  center: 'Căn giữa',
  right: 'Căn phải',
  justify: 'Căn đều hai bên'
}

export function indentText(r: Range): string {
  if (r.min === 0 && r.max === 0) return 'Không thụt'
  if (r.max < 0) return `Thụt treo ${rangeText({ min: -r.max, max: -r.min }, 'cm')}`
  return rangeText(r, 'cm')
}

export function categoryLabel(index: 'body' | 'caption' | number): string {
  if (index === 'body') return 'Thân bài'
  if (index === 'caption') return 'Chú thích hình/bảng'
  return `Heading ${index + 1}`
}

/** Mô tả ngắn một loại đoạn, ví dụ "Times New Roman, 13 pt, 1,5 dòng, căn đều hai bên" */
export function describeCategory(c: CategorySpec): string {
  const parts: string[] = []
  if (c.fontFamily) parts.push(c.fontFamily)
  if (c.fontSizePt) parts.push(rangeText(c.fontSizePt, 'pt'))
  if (c.bold !== null) parts.push(c.bold ? 'in đậm' : 'không đậm')
  if (c.lineSpacing) parts.push(`giãn ${lineSpacingText(c.lineSpacing)}`)
  if (c.spaceBeforePt) parts.push(`trước ${rangeText(c.spaceBeforePt, 'pt')}`)
  if (c.spaceAfterPt) parts.push(`sau ${rangeText(c.spaceAfterPt, 'pt')}`)
  if (c.alignment) parts.push(ALIGNMENT_LABELS[c.alignment].toLowerCase())
  if (c.firstLineIndentCm) parts.push(`thụt dòng ${indentText(c.firstLineIndentCm).toLowerCase()}`)
  return parts.length ? parts.join(', ') : 'Không kiểm tra'
}

export function describeSpec(spec: TemplateSpec): string[] {
  const lines = [`${categoryLabel('body')}: ${describeCategory(spec.body)}`]
  spec.headings.forEach((h, i) => {
    const d = describeCategory(h)
    if (d !== 'Không kiểm tra') lines.push(`${categoryLabel(i)}: ${d}`)
  })
  const cap = describeCategory(spec.caption)
  if (cap !== 'Không kiểm tra') lines.push(`${categoryLabel('caption')}: ${cap}`)
  if (spec.marginsCm) {
    const m = spec.marginsCm
    lines.push(
      `Lề trang: trên ${fmtNum(m.top)}, dưới ${fmtNum(m.bottom)}, trái ${fmtNum(m.left)}, phải ${fmtNum(m.right)} cm`
    )
  }
  lines.push(`Thứ tự heading: ${spec.checkHeadingOrder ? 'có kiểm tra' : 'không kiểm tra'}`)
  return lines
}
