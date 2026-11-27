/**
 * So định dạng thật của tài liệu với một MẪU, trả về danh sách lỗi.
 * Mỗi loại đoạn (thân bài, heading 1–4, chú thích, bảng) được so với thông số riêng trong mẫu.
 * Không dùng AI — chỉ so sánh số liệu, nên kết quả ổn định và giải thích được.
 */
import {
  ALIGNMENT_LABELS,
  fmtNum,
  HEADING_LEVELS,
  indentText,
  lineSpacingText,
  rangeText,
  type CategorySpec,
  type FormatCheckStats,
  type FormatIssue,
  type Range,
  type TemplateSpec
} from '@shared/format'
import type { DocxModel, DocxParagraph } from './docx-model'
import {
  alignmentOf,
  classifyAll,
  excerptOf,
  indentCmOf,
  isMostlyBold,
  isSymbolFont,
  lineSpacingOf,
  MIN_BODY_CHARS,
  sizeRuns,
  spaceAfterPtOf,
  spaceBeforePtOf,
  textRuns,
  TWIPS_PER_CM,
  type ParagraphKind
} from './paragraph-facts'

export { excerptOf } from './paragraph-facts'

export interface CheckOutput {
  stats: FormatCheckStats
  issues: FormatIssue[]
}

// Sai số cho phép (Word hay làm tròn khi lưu)
const TOL_PT = 0.5
const TOL_SIZE = 0.05
const TOL_MULTIPLE = 0.05
const TOL_CM = 0.1

const within = (v: number, r: Range, tol: number): boolean => v >= r.min - tol && v <= r.max + tol

export function checkFormat(model: DocxModel, spec: TemplateSpec): CheckOutput {
  const issues: FormatIssue[] = []
  const stats: FormatCheckStats = {
    paragraphs: 0,
    bodyParagraphs: 0,
    headings: 0,
    sections: model.sections.length
  }
  let lastHeading = 0
  const kinds = classifyAll(model.paragraphs)

  for (const [index, p] of model.paragraphs.entries()) {
    if (p.number === 0 || p.inToc) continue
    stats.paragraphs++
    const kind = kinds[index]

    const add = (
      rule: FormatIssue['rule'],
      context: string,
      actual: string,
      expected: string
    ): void => {
      issues.push({
        rule,
        paragraph: p.number,
        context,
        excerpt: excerptOf(p.text),
        actual,
        expected
      })
    }

    if (kind.type === 'heading') {
      stats.headings++
      if (spec.checkHeadingOrder && lastHeading > 0 && kind.level > lastHeading + 1) {
        add(
          'heading-order',
          `Heading ${kind.level}`,
          `Heading ${kind.level} ngay sau Heading ${lastHeading}`,
          `Heading ${lastHeading + 1} trước rồi mới tới Heading ${kind.level}`
        )
      }
      lastHeading = kind.level
      const cat = spec.headings[Math.min(kind.level, HEADING_LEVELS) - 1]
      checkCategory(p, kind, cat, `Heading ${kind.level}`, add)
    } else if (kind.type === 'caption') {
      checkCategory(p, kind, spec.caption, 'Chú thích', add)
    } else if (kind.type === 'table' || kind.type === 'cover') {
      // Chữ trong bảng / trang bìa có cỡ chữ, giãn dòng riêng: chỉ kiểm tra font
      const context = kind.type === 'table' ? 'Bảng' : 'Trang bìa'
      checkCategory(p, kind, { ...spec.body, fontSizePt: null }, context, add)
    } else {
      stats.bodyParagraphs++
      checkCategory(p, kind, spec.body, 'Thân bài', add)
    }
  }

  checkMargins(model, spec, issues)
  return { stats, issues }
}

function checkCategory(
  p: DocxParagraph,
  kind: ParagraphKind,
  cat: CategorySpec,
  context: string,
  add: (rule: FormatIssue['rule'], context: string, actual: string, expected: string) => void
): void {
  // --- Font ---
  if (cat.fontFamily) {
    const want = cat.fontFamily.trim().toLowerCase()
    const bad = new Set<string>()
    for (const r of textRuns(p)) {
      if (isSymbolFont(r.font)) continue
      const f = r.font?.trim()
      if (!f) bad.add('Không xác định')
      else if (f.toLowerCase() !== want) bad.add(f)
    }
    if (bad.size > 0) add('font-family', context, [...bad].join(', '), cat.fontFamily)
  }

  // --- Cỡ chữ ---
  if (cat.fontSizePt) {
    const range = cat.fontSizePt
    const bad = new Set<string>()
    for (const r of sizeRuns(p)) {
      if (r.sizePt === undefined) bad.add('Không xác định')
      else if (!within(r.sizePt, range, TOL_SIZE)) bad.add(`${fmtNum(r.sizePt)} pt`)
    }
    if (bad.size > 0) add('font-size', context, [...bad].join(', '), rangeText(range, 'pt'))
  }

  if (kind.type === 'table' || kind.type === 'cover') return

  // --- In đậm ---
  if (cat.bold !== null) {
    const bold = isMostlyBold(p)
    if (bold !== cat.bold) {
      add('bold', context, bold ? 'In đậm' : 'Không đậm', cat.bold ? 'In đậm' : 'Không đậm')
    }
  }

  // --- Giãn dòng ---
  if (cat.lineSpacing) {
    const ls = lineSpacingOf(p)
    const want = cat.lineSpacing
    const tol = want.rule === 'multiple' ? TOL_MULTIPLE : TOL_PT
    if (ls.rule !== want.rule || !within(ls.value, want, tol)) {
      add(
        'line-spacing',
        context,
        lineSpacingText({ rule: ls.rule, min: ls.value, max: ls.value }),
        lineSpacingText(want)
      )
    }
  }

  // --- Khoảng cách trước / sau đoạn ---
  if (cat.spaceBeforePt) {
    const v = spaceBeforePtOf(p)
    if (!within(v, cat.spaceBeforePt, TOL_PT)) {
      add('spacing-before', context, `${fmtNum(v)} pt`, rangeText(cat.spaceBeforePt, 'pt'))
    }
  }
  if (cat.spaceAfterPt) {
    const v = spaceAfterPtOf(p)
    if (!within(v, cat.spaceAfterPt, TOL_PT)) {
      add('spacing-after', context, `${fmtNum(v)} pt`, rangeText(cat.spaceAfterPt, 'pt'))
    }
  }

  // Thân bài: căn lề / thụt dòng chỉ xét đoạn đủ dài và không phải danh sách
  const layoutApplies =
    kind.type !== 'body' || (p.text.trim().length >= MIN_BODY_CHARS && !p.isList)

  if (cat.alignment && layoutApplies) {
    const a = alignmentOf(p)
    if (a !== cat.alignment)
      add('alignment', context, ALIGNMENT_LABELS[a], ALIGNMENT_LABELS[cat.alignment])
  }

  // Đoạn có đánh số tự động: thụt dòng do định nghĩa danh sách quyết định → bỏ qua
  if (cat.firstLineIndentCm && layoutApplies && !p.isList) {
    const cm = indentCmOf(p)
    if (!within(cm, cat.firstLineIndentCm, TOL_CM)) {
      add(
        'first-line-indent',
        context,
        indentText({ min: cm, max: cm }),
        indentText(cat.firstLineIndentCm)
      )
    }
  }
}

function checkMargins(model: DocxModel, spec: TemplateSpec, issues: FormatIssue[]): void {
  const want = spec.marginsCm
  if (!want) return
  const sides = [
    ['top', 'trên'],
    ['bottom', 'dưới'],
    ['left', 'trái'],
    ['right', 'phải']
  ] as const
  // Gộp các section có cùng lỗi lề thành một dòng
  const groups = new Map<string, { actual: string; expected: string; sections: number[] }>()
  model.sections.forEach((s, i) => {
    const wrong: string[] = []
    const expected: string[] = []
    for (const [key, label] of sides) {
      const twips = s.margins[key]
      if (twips === undefined) continue
      const cm = Math.abs(twips) / TWIPS_PER_CM
      if (Math.abs(cm - want[key]) > TOL_CM) {
        wrong.push(`${label} ${fmtNum(cm)} cm`)
        expected.push(`${label} ${fmtNum(want[key])} cm`)
      }
    }
    if (wrong.length === 0) return
    const actual = wrong.join(', ')
    const g = groups.get(actual) ?? { actual, expected: expected.join(', '), sections: [] }
    g.sections.push(i + 1)
    groups.set(actual, g)
  })

  const total = model.sections.length
  for (const g of groups.values()) {
    issues.push({
      rule: 'margin',
      paragraph: null,
      context: 'Trang',
      excerpt:
        g.sections.length === total
          ? 'Toàn bộ tài liệu'
          : `Phần (section) ${g.sections.join(', ')} / ${total}`,
      actual: g.actual,
      expected: g.expected
    })
  }
}
