/**
 * So định dạng thật của tài liệu với bộ quy tắc, trả về danh sách lỗi.
 * Không dùng AI — chỉ so sánh số liệu, nên kết quả ổn định và giải thích được.
 */
import type { FormatCheckStats, FormatIssue, FormatRules } from '@shared/format'
import type { DocxModel, DocxParagraph } from './docx-model'

const TWIPS_PER_PT = 20
const TWIPS_PER_CM = 567
/** Đoạn ngắn hơn mức này (tiêu đề, dòng chú thích...) không bị kiểm tra căn đều / thụt dòng */
const MIN_BODY_CHARS = 80
const SYMBOL_FONTS = new Set(['symbol', 'wingdings', 'wingdings 2', 'wingdings 3', 'cambria math'])
const CAPTION_RE = /^(hình|bảng|biểu đồ|sơ đồ|hinh|bang)\s*\d/i

type Kind = 'heading' | 'caption' | 'body'

export interface CheckOutput {
  stats: FormatCheckStats
  issues: FormatIssue[]
}

const fmt = (n: number, digits = 2): string =>
  Number(n.toFixed(digits)).toLocaleString('vi-VN', { maximumFractionDigits: digits })

export function excerptOf(text: string, max = 60): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

function classify(p: DocxParagraph): Kind {
  if (p.headingLevel !== null) return 'heading'
  if (/caption/i.test(p.styleName ?? '')) return 'caption'
  const t = p.text.trim()
  if (t.length < 200 && CAPTION_RE.test(t)) return 'caption'
  return 'body'
}

/** Giãn dòng ở dạng chữ dễ đọc, ví dụ "1,5 dòng" hoặc "Chính xác 18 pt" */
export function describeLineSpacing(line: number | undefined, rule: string | undefined): string {
  if (line === undefined) return '1 dòng (mặc định)'
  if (rule === 'exact') return `Chính xác ${fmt(line / TWIPS_PER_PT)} pt`
  if (rule === 'atLeast') return `Tối thiểu ${fmt(line / TWIPS_PER_PT)} pt`
  return `${fmt(line / 240)} dòng`
}

function inRange(v: number, r: { min: number; max: number }, eps = 0.01): boolean {
  return v >= r.min - eps && v <= r.max + eps
}

const rangeText = (r: { min: number; max: number }, unit: string): string =>
  r.min === r.max ? `${fmt(r.min)} ${unit}` : `${fmt(r.min)}–${fmt(r.max)} ${unit}`

export function checkFormat(model: DocxModel, rules: FormatRules): CheckOutput {
  const issues: FormatIssue[] = []
  const add = (
    p: DocxParagraph | null,
    rule: FormatIssue['rule'],
    actual: string,
    expected: string
  ): void => {
    issues.push({
      rule,
      paragraph: p ? p.number : null,
      excerpt: p ? excerptOf(p.text) : '',
      actual,
      expected
    })
  }

  const stats: FormatCheckStats = {
    paragraphs: 0,
    bodyParagraphs: 0,
    headings: 0,
    sections: model.sections.length
  }
  const wantFont = rules.fontFamily.trim().toLowerCase()
  let lastHeading = 0

  for (const p of model.paragraphs) {
    if (p.number === 0 || p.inToc) continue
    stats.paragraphs++
    const kind = classify(p)
    const textRuns = p.runs.filter((r) => r.text.trim().length > 0)

    // --- Font chữ: mọi loại đoạn ---
    const badFonts = new Set<string>()
    for (const r of textRuns) {
      const f = r.font?.trim()
      if (f && SYMBOL_FONTS.has(f.toLowerCase())) continue
      if (!f) badFonts.add('Không xác định')
      else if (f.toLowerCase() !== wantFont) badFonts.add(f)
    }
    if (badFonts.size > 0) add(p, 'font-family', [...badFonts].join(', '), rules.fontFamily)

    // --- Heading ---
    if (kind === 'heading') {
      stats.headings++
      const level = p.headingLevel ?? 1
      if (rules.checkHeadingOrder && lastHeading > 0 && level > lastHeading + 1) {
        add(
          p,
          'heading-order',
          `Heading ${level} ngay sau Heading ${lastHeading}`,
          `Heading ${lastHeading + 1} trước rồi mới tới Heading ${level}`
        )
      }
      lastHeading = level
      const small = new Set<string>()
      for (const r of textRuns) {
        if (r.sizePt !== undefined && r.sizePt < rules.bodyFontSizePt - 0.01)
          small.add(`${fmt(r.sizePt)} pt`)
      }
      if (small.size > 0) {
        add(
          p,
          'font-size',
          [...small].join(', '),
          `Heading từ ${fmt(rules.bodyFontSizePt)} pt trở lên`
        )
      }
      continue
    }

    if (kind === 'caption' || p.inTable) continue

    // --- Đoạn thân bài ---
    stats.bodyParagraphs++

    const sizes = new Set<string>()
    for (const r of textRuns) {
      if (r.vertAlign === 'superscript' || r.vertAlign === 'subscript') continue
      const s = r.sizePt
      if (s === undefined) sizes.add('Không xác định')
      else if (Math.abs(s - rules.bodyFontSizePt) > 0.01) sizes.add(`${fmt(s)} pt`)
    }
    if (sizes.size > 0)
      add(p, 'font-size', [...sizes].join(', '), `${fmt(rules.bodyFontSizePt)} pt`)

    const { line, lineRule } = p.props
    const multiple = line === undefined ? 1 : line / 240
    const isMultiple = lineRule === undefined || lineRule === 'auto'
    if (!isMultiple || Math.abs(multiple - rules.lineSpacing) > 0.05) {
      add(p, 'line-spacing', describeLineSpacing(line, lineRule), `${fmt(rules.lineSpacing)} dòng`)
    }

    const before = (p.props.before ?? 0) / TWIPS_PER_PT
    if (!inRange(before, rules.spaceBeforePt)) {
      add(p, 'spacing-before', `${fmt(before)} pt`, rangeText(rules.spaceBeforePt, 'pt'))
    }
    const after = (p.props.after ?? 0) / TWIPS_PER_PT
    if (!inRange(after, rules.spaceAfterPt)) {
      add(p, 'spacing-after', `${fmt(after)} pt`, rangeText(rules.spaceAfterPt, 'pt'))
    }

    const longEnough = p.text.trim().length >= MIN_BODY_CHARS
    if (rules.justifyBody && longEnough && !p.isList) {
      const jc = p.props.jc ?? 'left'
      if (jc !== 'both' && jc !== 'distribute') {
        const names: Record<string, string> = {
          left: 'Căn trái',
          start: 'Căn trái',
          center: 'Căn giữa',
          right: 'Căn phải',
          end: 'Căn phải'
        }
        add(p, 'alignment', names[jc] ?? jc, 'Căn đều hai bên')
      }
    }

    if (rules.firstLineIndentCm && longEnough && !p.isList) {
      const cm = p.props.hanging
        ? -p.props.hanging / TWIPS_PER_CM
        : (p.props.firstLine ?? 0) / TWIPS_PER_CM
      if (!inRange(cm, rules.firstLineIndentCm, 0.05)) {
        const actual =
          cm === 0 ? 'Không thụt' : cm < 0 ? `Thụt treo ${fmt(-cm)} cm` : `${fmt(cm)} cm`
        add(p, 'first-line-indent', actual, rangeText(rules.firstLineIndentCm, 'cm'))
      }
    }
  }

  // --- Lề trang (mỗi section) ---
  const sides = [
    ['top', 'trên'],
    ['bottom', 'dưới'],
    ['left', 'trái'],
    ['right', 'phải']
  ] as const
  model.sections.forEach((s, i) => {
    const wrong: string[] = []
    const want: string[] = []
    for (const [key, label] of sides) {
      const twips = s.margins[key]
      if (twips === undefined) continue
      const cm = Math.abs(twips) / TWIPS_PER_CM
      if (Math.abs(cm - rules.marginsCm[key]) > 0.1) {
        wrong.push(`${label} ${fmt(cm)} cm`)
        want.push(`${label} ${fmt(rules.marginsCm[key])} cm`)
      }
    }
    if (wrong.length > 0) {
      issues.push({
        rule: 'margin',
        paragraph: null,
        excerpt: model.sections.length > 1 ? `Phần (section) ${i + 1}` : 'Toàn bộ tài liệu',
        actual: wrong.join(', '),
        expected: want.join(', ')
      })
    }
  })

  return { stats, issues }
}
