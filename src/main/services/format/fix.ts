/**
 * TỰ SỬA định dạng DOCX theo mẫu: chỉnh trực tiếp các thuộc tính sai trong word/document.xml
 * (font, cỡ chữ, in đậm, giãn dòng, cách đoạn, căn lề, thụt dòng, lề trang) rồi xuất FILE MỚI.
 * Không đụng tới nội dung chữ, hình ảnh, bảng, mục lục. Chỉ sửa chỗ đang sai, chỗ đúng giữ nguyên.
 */
import {
  HEADING_LEVELS,
  type Alignment,
  type CategorySpec,
  type Range,
  type TemplateSpec
} from '@shared/format'
import { openDocx, type DocxParagraph } from './docx-model'
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
  TWIPS_PER_CM,
  TWIPS_PER_PT,
  type ParagraphKind
} from './paragraph-facts'
import {
  attr,
  buildXml,
  child,
  ensureChild,
  ensureFirstChild,
  removeAttr,
  removeChild,
  setAttr,
  type XNode
} from './xml'

/** Thứ tự phần tử con trong w:pPr theo chuẩn OOXML */
const PPR_ORDER = [
  'w:pStyle',
  'w:keepNext',
  'w:keepLines',
  'w:pageBreakBefore',
  'w:framePr',
  'w:widowControl',
  'w:numPr',
  'w:suppressLineNumbers',
  'w:pBdr',
  'w:shd',
  'w:tabs',
  'w:suppressAutoHyphens',
  'w:kinsoku',
  'w:wordWrap',
  'w:overflowPunct',
  'w:topLinePunct',
  'w:autoSpaceDE',
  'w:autoSpaceDN',
  'w:bidi',
  'w:adjustRightInd',
  'w:snapToGrid',
  'w:spacing',
  'w:ind',
  'w:contextualSpacing',
  'w:mirrorIndents',
  'w:suppressOverlap',
  'w:jc',
  'w:textDirection',
  'w:textAlignment',
  'w:textboxTightWrap',
  'w:outlineLvl',
  'w:divId',
  'w:cnfStyle',
  'w:rPr',
  'w:sectPr',
  'w:pPrChange'
] as const

/** Thứ tự phần tử con trong w:rPr theo chuẩn OOXML */
const RPR_ORDER = [
  'w:rStyle',
  'w:rFonts',
  'w:b',
  'w:bCs',
  'w:i',
  'w:iCs',
  'w:caps',
  'w:smallCaps',
  'w:strike',
  'w:dstrike',
  'w:outline',
  'w:shadow',
  'w:emboss',
  'w:imprint',
  'w:noProof',
  'w:snapToGrid',
  'w:vanish',
  'w:webHidden',
  'w:color',
  'w:spacing',
  'w:w',
  'w:kern',
  'w:position',
  'w:sz',
  'w:szCs',
  'w:highlight',
  'w:u',
  'w:effect',
  'w:bdr',
  'w:shd',
  'w:fitText',
  'w:vertAlign',
  'w:rtl',
  'w:cs',
  'w:em',
  'w:lang',
  'w:eastAsianLayout',
  'w:specVanish',
  'w:oMath',
  'w:rPrChange'
] as const

/** Thứ tự phần tử con trong w:sectPr (đủ để chèn w:pgMar đúng chỗ) */
const SECT_ORDER = [
  'w:headerReference',
  'w:footerReference',
  'w:footnotePr',
  'w:endnotePr',
  'w:type',
  'w:pgSz',
  'w:pgMar',
  'w:paperSrc',
  'w:pgBorders',
  'w:lnNumType',
  'w:pgNumType',
  'w:cols',
  'w:formProt',
  'w:vAlign',
  'w:noEndnote',
  'w:titlePg',
  'w:textDirection',
  'w:bidi',
  'w:rtlGutter',
  'w:docGrid',
  'w:printerSettings',
  'w:sectPrChange'
] as const

const TOL_PT = 0.5
const TOL_SIZE = 0.05
const TOL_MULTIPLE = 0.05
const TOL_CM = 0.1

const within = (v: number, r: Range, tol: number): boolean => v >= r.min - tol && v <= r.max + tol
/** Đưa giá trị về trong khoảng cho phép (chọn điểm gần nhất) */
const clamp = (v: number, r: Range): number => Math.min(Math.max(v, r.min), r.max)

const JC: Record<Alignment, string> = {
  left: 'left',
  center: 'center',
  right: 'right',
  justify: 'both'
}

export interface FixSummary {
  /** Số đoạn đã chỉnh ít nhất một thuộc tính */
  paragraphsChanged: number
  /** Số cụm chữ đã chỉnh font / cỡ chữ / in đậm */
  runsChanged: number
  /** Số section đã chỉnh lề trang */
  sectionsChanged: number
}

function categoryFor(kind: ParagraphKind, spec: TemplateSpec): CategorySpec | null {
  if (kind.type === 'heading') return spec.headings[Math.min(kind.level, HEADING_LEVELS) - 1]
  if (kind.type === 'caption') return spec.caption
  if (kind.type === 'body') return spec.body
  return null // bảng, trang bìa: chỉ sửa font
}

/** Sửa định dạng một đoạn; trả về [đoạn có đổi không, số cụm chữ đã đổi] */
function fixParagraph(
  p: DocxParagraph,
  kind: ParagraphKind,
  spec: TemplateSpec
): [boolean, number] {
  const node = p.xml
  if (!node) return [false, 0]
  const cat = categoryFor(kind, spec)
  const fontFamily = cat ? cat.fontFamily : spec.body.fontFamily
  let paraChanged = false
  const runChanged = new Set<XNode>()

  // ---- Chữ: font ----
  if (fontFamily) {
    const want = fontFamily.trim()
    for (const r of textRuns(p)) {
      if (!r.xml || isSymbolFont(r.font)) continue
      if (r.font?.trim().toLowerCase() === want.toLowerCase()) continue
      const fonts = ensureChild(ensureFirstChild(r.xml, 'w:rPr'), 'w:rFonts', RPR_ORDER)
      for (const a of ['w:ascii', 'w:hAnsi', 'w:cs']) setAttr(fonts, a, want)
      for (const a of ['w:asciiTheme', 'w:hAnsiTheme', 'w:cstheme']) removeAttr(fonts, a)
      runChanged.add(r.xml)
    }
  }

  if (cat) {
    // ---- Chữ: cỡ chữ ----
    if (cat.fontSizePt) {
      for (const r of sizeRuns(p)) {
        if (!r.xml) continue
        if (r.sizePt !== undefined && within(r.sizePt, cat.fontSizePt, TOL_SIZE)) continue
        const target = clamp(r.sizePt ?? cat.fontSizePt.min, cat.fontSizePt)
        const half = String(Math.round(target * 2))
        const rPr = ensureFirstChild(r.xml, 'w:rPr')
        setAttr(ensureChild(rPr, 'w:sz', RPR_ORDER), 'w:val', half)
        setAttr(ensureChild(rPr, 'w:szCs', RPR_ORDER), 'w:val', half)
        runChanged.add(r.xml)
      }
    }

    // ---- Chữ: in đậm (theo cả đoạn) ----
    if (cat.bold !== null && isMostlyBold(p) !== cat.bold) {
      for (const r of textRuns(p)) {
        if (!r.xml) continue
        const rPr = ensureFirstChild(r.xml, 'w:rPr')
        if (cat.bold) {
          removeAttr(ensureChild(rPr, 'w:b', RPR_ORDER), 'w:val')
        } else {
          setAttr(ensureChild(rPr, 'w:b', RPR_ORDER), 'w:val', '0')
        }
        runChanged.add(r.xml)
      }
    }

    // ---- Đoạn: giãn dòng, cách đoạn ----
    const pPr = (): XNode => ensureFirstChild(node, 'w:pPr')
    const spacing = (): XNode => ensureChild(pPr(), 'w:spacing', PPR_ORDER)

    if (cat.lineSpacing) {
      const ls = lineSpacingOf(p)
      const want = cat.lineSpacing
      const tol = want.rule === 'multiple' ? TOL_MULTIPLE : TOL_PT
      if (ls.rule !== want.rule || !within(ls.value, want, tol)) {
        const value = ls.rule === want.rule ? clamp(ls.value, want) : want.min
        const s = spacing()
        if (want.rule === 'multiple') {
          setAttr(s, 'w:line', String(Math.round(value * 240)))
          setAttr(s, 'w:lineRule', 'auto')
        } else {
          setAttr(s, 'w:line', String(Math.round(value * TWIPS_PER_PT)))
          setAttr(s, 'w:lineRule', want.rule)
        }
        paraChanged = true
      }
    }
    if (cat.spaceBeforePt && !within(spaceBeforePtOf(p), cat.spaceBeforePt, TOL_PT)) {
      const s = spacing()
      setAttr(
        s,
        'w:before',
        String(Math.round(clamp(spaceBeforePtOf(p), cat.spaceBeforePt) * TWIPS_PER_PT))
      )
      removeAttr(s, 'w:beforeAutospacing')
      removeAttr(s, 'w:beforeLines')
      paraChanged = true
    }
    if (cat.spaceAfterPt && !within(spaceAfterPtOf(p), cat.spaceAfterPt, TOL_PT)) {
      const s = spacing()
      setAttr(
        s,
        'w:after',
        String(Math.round(clamp(spaceAfterPtOf(p), cat.spaceAfterPt) * TWIPS_PER_PT))
      )
      removeAttr(s, 'w:afterAutospacing')
      removeAttr(s, 'w:afterLines')
      paraChanged = true
    }

    // ---- Đoạn: căn lề, thụt dòng (thân bài chỉ xét đoạn dài, không phải danh sách) ----
    const layoutApplies =
      kind.type !== 'body' || (p.text.trim().length >= MIN_BODY_CHARS && !p.isList)
    if (cat.alignment && layoutApplies && alignmentOf(p) !== cat.alignment) {
      setAttr(ensureChild(pPr(), 'w:jc', PPR_ORDER), 'w:val', JC[cat.alignment])
      paraChanged = true
    }
    if (cat.firstLineIndentCm && layoutApplies && !p.isList) {
      const cm = indentCmOf(p)
      if (!within(cm, cat.firstLineIndentCm, TOL_CM)) {
        const target = clamp(cm, cat.firstLineIndentCm)
        const ind = ensureChild(pPr(), 'w:ind', PPR_ORDER)
        for (const a of ['w:firstLine', 'w:hanging', 'w:firstLineChars', 'w:hangingChars']) {
          removeAttr(ind, a)
        }
        if (target >= 0) setAttr(ind, 'w:firstLine', String(Math.round(target * TWIPS_PER_CM)))
        else setAttr(ind, 'w:hanging', String(Math.round(-target * TWIPS_PER_CM)))
        paraChanged = true
      }
    }
  }

  return [paraChanged || runChanged.size > 0, runChanged.size]
}

export async function fixDocx(
  data: Buffer,
  spec: TemplateSpec
): Promise<{ data: Buffer; summary: FixSummary }> {
  const { zip, documentTree, model } = await openDocx(data)
  const kinds = classifyAll(model.paragraphs)
  const summary: FixSummary = { paragraphsChanged: 0, runsChanged: 0, sectionsChanged: 0 }

  model.paragraphs.forEach((p, i) => {
    if (p.number === 0 || p.inToc) return
    const [changed, runs] = fixParagraph(p, kinds[i], spec)
    if (changed) summary.paragraphsChanged++
    summary.runsChanged += runs
  })

  if (spec.marginsCm) {
    const want = spec.marginsCm
    for (const s of model.sections) {
      if (!s.xml) continue
      let changed = false
      const pgMar = child(s.xml, 'w:pgMar') ?? ensureChild(s.xml, 'w:pgMar', SECT_ORDER)
      for (const side of ['top', 'bottom', 'left', 'right'] as const) {
        const current = Number(attr(pgMar, `w:${side}`) ?? NaN)
        if (
          Number.isFinite(current) &&
          Math.abs(Math.abs(current) / TWIPS_PER_CM - want[side]) <= TOL_CM
        ) {
          continue
        }
        setAttr(pgMar, `w:${side}`, String(Math.round(want[side] * TWIPS_PER_CM)))
        changed = true
      }
      if (changed) summary.sectionsChanged++
    }
  }

  zip.file('word/document.xml', buildXml(documentTree))
  const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  return { data: out, summary }
}

/** Dùng trong test: xóa phần tử (để kiểm tra chèn lại đúng thứ tự) */
export const __test = { removeChild }
