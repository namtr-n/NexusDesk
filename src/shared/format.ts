/**
 * Quy tắc định dạng và kết quả kiểm tra DOCX — dùng chung cho main và giao diện.
 */
import { z } from 'zod'

function range(min: number, max: number, unit: string): z.ZodType<{ min: number; max: number }> {
  return z
    .object({
      min: z.number().min(min, `Tối thiểu ${min} ${unit}`).max(max, `Tối đa ${max} ${unit}`),
      max: z.number().min(min, `Tối thiểu ${min} ${unit}`).max(max, `Tối đa ${max} ${unit}`)
    })
    .refine((r) => r.min <= r.max, 'Giá trị "từ" phải nhỏ hơn hoặc bằng "đến"')
}

export const formatRulesSchema = z.object({
  fontFamily: z.string().trim().min(1, 'Chưa nhập tên font').max(60),
  bodyFontSizePt: z.number().min(8, 'Cỡ chữ tối thiểu 8').max(20, 'Cỡ chữ tối đa 20'),
  /** Giãn dòng dạng bội số: 1 = đơn, 1.5 = 1,5 dòng */
  lineSpacing: z.number().min(1, 'Giãn dòng tối thiểu 1').max(3, 'Giãn dòng tối đa 3'),
  spaceBeforePt: range(0, 48, 'pt'),
  spaceAfterPt: range(0, 48, 'pt'),
  /** Đoạn văn thân bài phải căn đều hai bên */
  justifyBody: z.boolean(),
  /** null = không kiểm tra thụt đầu dòng */
  firstLineIndentCm: range(0, 3, 'cm').nullable(),
  marginsCm: z.object({
    top: z.number().min(0).max(6),
    bottom: z.number().min(0).max(6),
    left: z.number().min(0).max(6),
    right: z.number().min(0).max(6)
  }),
  /** Heading không được nhảy cấp (Chương → 1.1 → 1.1.1, không nhảy thẳng Chương → 1.1.1) */
  checkHeadingOrder: z.boolean()
})

export type FormatRules = z.infer<typeof formatRulesSchema>

/** Bộ quy tắc mặc định: chuẩn trình bày báo cáo / đồ án sinh viên phổ biến ở Việt Nam. */
export const DEFAULT_FORMAT_RULES: FormatRules = {
  fontFamily: 'Times New Roman',
  bodyFontSizePt: 13,
  lineSpacing: 1.5,
  spaceBeforePt: { min: 0, max: 12 },
  spaceAfterPt: { min: 0, max: 12 },
  justifyBody: true,
  firstLineIndentCm: { min: 0.9, max: 1.3 },
  marginsCm: { top: 2, bottom: 2, left: 3, right: 2 },
  checkHeadingOrder: true
}

export type FormatRuleId =
  | 'font-family'
  | 'font-size'
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
  rules: FormatRules
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
