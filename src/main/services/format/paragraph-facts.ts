/**
 * Các "sự thật" đo được từ một đoạn văn (dùng chung cho kiểm tra và học mẫu):
 * loại đoạn, font/cỡ chữ chiếm ưu thế, giãn dòng, căn lề, thụt dòng... theo đơn vị dễ hiểu.
 */
import type { Alignment, LineSpacingSpec } from '@shared/format'
import type { DocxParagraph, DocxRun } from './docx-model'

export const TWIPS_PER_PT = 20
export const TWIPS_PER_CM = 567
/** Đoạn ngắn hơn mức này (tiêu đề, dòng chú thích...) không xét căn lề / thụt dòng ở thân bài */
export const MIN_BODY_CHARS = 80
const SYMBOL_FONTS = new Set(['symbol', 'wingdings', 'wingdings 2', 'wingdings 3', 'cambria math'])
const CAPTION_RE = /^(hình|bảng|biểu đồ|sơ đồ|hinh|bang)\s*\d+([.-]\d+)*/i

export type ParagraphKind =
  | { type: 'heading'; level: number }
  | { type: 'caption' }
  | { type: 'body' }
  | { type: 'table' }
  /** Dòng ngắn ở trang bìa / phần đầu (trước mục lục hoặc heading đầu tiên) */
  | { type: 'cover' }

/**
 * Phân loại mọi đoạn trong tài liệu (cần ngữ cảnh cả tài liệu để nhận ra trang bìa).
 * - heading: có style Heading / outline level
 * - caption: style Caption, dòng "Hình 1.2..." ngắn hoặc căn giữa, hoặc dòng ngắn căn giữa
 * - table: chữ trong bảng
 * - cover: dòng ngắn nằm trước mục lục / heading đầu tiên (tên trường, tên đề tài...)
 * - body: còn lại
 */
export function classifyAll(paragraphs: DocxParagraph[]): ParagraphKind[] {
  const firstMain = paragraphs.findIndex((p) => p.headingLevel !== null || p.inToc)
  return paragraphs.map((p, i) => {
    if (p.headingLevel !== null) return { type: 'heading', level: p.headingLevel }
    if (/caption/i.test(p.styleName ?? '')) return { type: 'caption' }
    if (p.inTable) return { type: 'table' }
    const t = p.text.trim()
    const short = t.length < MIN_BODY_CHARS
    if (firstMain > 0 && i < firstMain && short) return { type: 'cover' }
    const centered = alignmentOf(p) === 'center'
    if (CAPTION_RE.test(t) && (centered || t.length < 100)) return { type: 'caption' }
    if (centered && short) return { type: 'caption' }
    return { type: 'body' }
  })
}

/** Các cụm chữ có nội dung thật (bỏ khoảng trắng) */
export function textRuns(p: DocxParagraph): DocxRun[] {
  return p.runs.filter((r) => r.text.trim().length > 0)
}

export function isSymbolFont(font: string | undefined): boolean {
  return !!font && SYMBOL_FONTS.has(font.trim().toLowerCase())
}

/** Cụm chữ dùng để xét cỡ chữ (bỏ chỉ số trên/dưới) */
export function sizeRuns(p: DocxParagraph): DocxRun[] {
  return textRuns(p).filter((r) => r.vertAlign !== 'superscript' && r.vertAlign !== 'subscript')
}

/** Đoạn có phần lớn chữ in đậm? */
export function isMostlyBold(p: DocxParagraph): boolean {
  let bold = 0
  let total = 0
  for (const r of textRuns(p)) {
    const n = r.text.trim().length
    total += n
    if (r.bold) bold += n
  }
  return total > 0 && bold / total > 0.5
}

export function lineSpacingOf(p: DocxParagraph): { rule: LineSpacingSpec['rule']; value: number } {
  const { line, lineRule } = p.props
  if (line === undefined) return { rule: 'multiple', value: 1 }
  if (lineRule === 'exact') return { rule: 'exact', value: line / TWIPS_PER_PT }
  if (lineRule === 'atLeast') return { rule: 'atLeast', value: line / TWIPS_PER_PT }
  return { rule: 'multiple', value: line / 240 }
}

export function alignmentOf(p: DocxParagraph): Alignment {
  switch (p.props.jc) {
    case 'both':
    case 'distribute':
      return 'justify'
    case 'center':
      return 'center'
    case 'right':
    case 'end':
      return 'right'
    default:
      return 'left'
  }
}

/** Thụt dòng đầu theo cm; âm = thụt treo */
export function indentCmOf(p: DocxParagraph): number {
  if (p.props.hanging) return -p.props.hanging / TWIPS_PER_CM
  return (p.props.firstLine ?? 0) / TWIPS_PER_CM
}

export const spaceBeforePtOf = (p: DocxParagraph): number => (p.props.before ?? 0) / TWIPS_PER_PT
export const spaceAfterPtOf = (p: DocxParagraph): number => (p.props.after ?? 0) / TWIPS_PER_PT

export function excerptOf(text: string, max = 60): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}
