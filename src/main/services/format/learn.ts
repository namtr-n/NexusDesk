/**
 * "Học" một mẫu định dạng từ file DOCX mẫu: với mỗi loại đoạn (thân bài, heading 1–4,
 * chú thích), lấy giá trị PHỔ BIẾN NHẤT của từng thuộc tính, tính trọng số theo độ dài chữ.
 * Nếu mẫu dùng không thống nhất hoặc quá ít đoạn, trả kèm cảnh báo để người dùng xem lại.
 */
import {
  ALIGNMENT_LABELS,
  EMPTY_CATEGORY,
  fmtNum,
  HEADING_LEVELS,
  lineSpacingText,
  type CategorySpec,
  type TemplateLearnInfo,
  type TemplateSpec
} from '@shared/format'
import type { DocxModel, DocxParagraph } from './docx-model'
import {
  alignmentOf,
  classifyAll,
  indentCmOf,
  isMostlyBold,
  isSymbolFont,
  lineSpacingOf,
  MIN_BODY_CHARS,
  sizeRuns,
  spaceAfterPtOf,
  spaceBeforePtOf,
  textRuns,
  TWIPS_PER_CM
} from './paragraph-facts'

/** Dưới ngưỡng này (tỉ lệ của giá trị phổ biến nhất) thì cảnh báo "không thống nhất" */
const CONSISTENT_SHARE = 0.6
const MIN_BODY_SAMPLES = 3

/** Làm tròn theo bước, bỏ sai số dấu phẩy động (1.1500000000000001 → 1.15) */
const round = (v: number, step: number): number => Number((Math.round(v / step) * step).toFixed(4))

class Tally<T> {
  private items = new Map<string, { value: T; weight: number }>()
  private total = 0

  add(key: string, value: T, weight: number): void {
    if (weight <= 0) return
    const cur = this.items.get(key)
    if (cur) cur.weight += weight
    else this.items.set(key, { value, weight })
    this.total += weight
  }

  /** Giá trị phổ biến nhất và tỉ lệ của nó (0–1) */
  top(): { value: T; share: number } | null {
    let best: { value: T; weight: number } | null = null
    for (const item of this.items.values()) if (!best || item.weight > best.weight) best = item
    return best ? { value: best.value, share: best.weight / this.total } : null
  }
}

interface Learned {
  spec: CategorySpec
  /** Thuộc tính có giá trị không thống nhất: tên → mô tả giá trị đã chọn + tỉ lệ */
  mixed: string[]
  samples: number
}

function learnCategory(paragraphs: DocxParagraph[], isBody: boolean): Learned {
  const font = new Tally<string>()
  const size = new Tally<number>()
  const bold = new Tally<boolean>()
  const line = new Tally<{ rule: 'multiple' | 'exact' | 'atLeast'; value: number }>()
  const before = new Tally<number>()
  const after = new Tally<number>()
  const align = new Tally<ReturnType<typeof alignmentOf>>()
  const indent = new Tally<number>()

  for (const p of paragraphs) {
    const weight = p.text.trim().length
    for (const r of textRuns(p)) {
      if (r.font && !isSymbolFont(r.font))
        font.add(r.font.toLowerCase(), r.font, r.text.trim().length)
    }
    for (const r of sizeRuns(p)) {
      if (r.sizePt !== undefined) {
        const v = round(r.sizePt, 0.5)
        size.add(String(v), v, r.text.trim().length)
      }
    }
    bold.add(String(isMostlyBold(p)), isMostlyBold(p), weight)

    const ls = lineSpacingOf(p)
    const lsValue = round(ls.value, ls.rule === 'multiple' ? 0.01 : 0.5)
    line.add(`${ls.rule}:${lsValue}`, { rule: ls.rule, value: lsValue }, weight)

    const b = round(spaceBeforePtOf(p), 0.5)
    before.add(String(b), b, weight)
    const a = round(spaceAfterPtOf(p), 0.5)
    after.add(String(a), a, weight)

    // Căn lề / thụt dòng của thân bài chỉ học từ đoạn dài, không phải danh sách
    const layoutOk = !isBody || (weight >= MIN_BODY_CHARS && !p.isList)
    if (layoutOk) align.add(alignmentOf(p), alignmentOf(p), weight)
    if (layoutOk && !p.isList) {
      const cm = round(indentCmOf(p), 0.01)
      indent.add(String(cm), cm, weight)
    }
  }

  const mixed: string[] = []
  const pct = (share: number): string => `${Math.round(share * 100)}%`
  function pick<T, R>(
    t: Tally<T>,
    label: string,
    show: (v: T) => string,
    map: (v: T) => R
  ): R | null {
    const top = t.top()
    if (!top) return null
    if (top.share < CONSISTENT_SHARE)
      mixed.push(`${label} (chọn ${show(top.value)}, chiếm ${pct(top.share)})`)
    return map(top.value)
  }
  const exact = (v: number): { min: number; max: number } => ({ min: v, max: v })

  const spec: CategorySpec = {
    fontFamily: pick(
      font,
      'font chữ',
      (v) => v,
      (v) => v
    ),
    fontSizePt: pick(size, 'cỡ chữ', (v) => `${fmtNum(v)} pt`, exact),
    bold: pick(
      bold,
      'in đậm',
      (v) => (v ? 'in đậm' : 'không đậm'),
      (v) => v
    ),
    lineSpacing: pick(
      line,
      'giãn dòng',
      (v) => lineSpacingText({ rule: v.rule, min: v.value, max: v.value }),
      (v) => ({ rule: v.rule, min: v.value, max: v.value })
    ),
    spaceBeforePt: pick(before, 'khoảng cách trước đoạn', (v) => `${fmtNum(v)} pt`, exact),
    spaceAfterPt: pick(after, 'khoảng cách sau đoạn', (v) => `${fmtNum(v)} pt`, exact),
    alignment: pick(
      align,
      'căn lề',
      (v) => ALIGNMENT_LABELS[v].toLowerCase(),
      (v) => v
    ),
    firstLineIndentCm: pick(indent, 'thụt đầu dòng', (v) => `${fmtNum(v)} cm`, exact)
  }
  // Thân bài: in đậm từng chữ là nhấn mạnh, không phải định dạng chung → không kiểm tra
  if (isBody) spec.bold = null
  return { spec, mixed, samples: paragraphs.length }
}

export function learnTemplate(
  model: DocxModel,
  sourceName: string
): { spec: TemplateSpec; learned: TemplateLearnInfo } {
  const body: DocxParagraph[] = []
  const caption: DocxParagraph[] = []
  const headings: DocxParagraph[][] = Array.from({ length: HEADING_LEVELS }, () => [])

  const kinds = classifyAll(model.paragraphs)
  for (const [index, p] of model.paragraphs.entries()) {
    if (p.number === 0 || p.inToc) continue
    const kind = kinds[index]
    if (kind.type === 'heading') headings[Math.min(kind.level, HEADING_LEVELS) - 1].push(p)
    else if (kind.type === 'caption') caption.push(p)
    else if (kind.type === 'body') body.push(p)
  }

  const warnings: string[] = []
  const learnedBody = learnCategory(body, true)
  const learnedHeadings = headings.map((list) => learnCategory(list, false))
  const learnedCaption = learnCategory(caption, false)

  if (body.length === 0) {
    warnings.push(
      'Không tìm thấy đoạn thân bài nào trong mẫu. Hãy nhập thông số thân bài bằng tay.'
    )
  } else if (body.length < MIN_BODY_SAMPLES) {
    warnings.push(
      `Mẫu chỉ có ${body.length} đoạn thân bài, thông số học được có thể chưa chính xác. Hãy xem lại.`
    )
  }
  if (headings.every((h) => h.length === 0)) {
    warnings.push(
      'Không tìm thấy heading dùng style Heading của Word. Nếu mẫu chỉ in đậm chữ để làm tiêu đề, app sẽ coi đó là thân bài; hãy nhập thông số heading bằng tay nếu cần.'
    )
  }
  const mixedNote = (label: string, l: Learned): void => {
    if (l.mixed.length > 0) {
      warnings.push(`${label} trong mẫu không thống nhất về ${l.mixed.join('; ')}.`)
    }
  }
  mixedNote('Thân bài', learnedBody)
  learnedHeadings.forEach((l, i) => mixedNote(`Heading ${i + 1}`, l))
  mixedNote('Chú thích', learnedCaption)

  const sect = model.sections[model.sections.length - 1]
  const cm = (t: number | undefined): number | undefined =>
    t === undefined ? undefined : round(Math.abs(t) / TWIPS_PER_CM, 0.01)
  const m = sect?.margins
  const marginsCm =
    m && [m.top, m.bottom, m.left, m.right].every((v) => v !== undefined)
      ? { top: cm(m.top)!, bottom: cm(m.bottom)!, left: cm(m.left)!, right: cm(m.right)! }
      : null
  if (!marginsCm) warnings.push('Không đọc được lề trang của mẫu, lề trang sẽ không được kiểm tra.')

  return {
    spec: {
      body: body.length ? learnedBody.spec : { ...EMPTY_CATEGORY },
      headings: learnedHeadings.map((l) => (l.samples ? l.spec : { ...EMPTY_CATEGORY })),
      caption: caption.length ? learnedCaption.spec : { ...EMPTY_CATEGORY },
      marginsCm,
      checkHeadingOrder: true
    },
    learned: {
      sourceName,
      bodyParagraphs: body.length,
      headingParagraphs: headings.map((h) => h.length),
      captionParagraphs: caption.length,
      warnings
    }
  }
}
