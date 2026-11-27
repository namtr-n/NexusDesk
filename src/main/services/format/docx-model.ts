/**
 * Đọc file DOCX và tính ĐỊNH DẠNG THẬT (effective) của từng đoạn và từng cụm chữ.
 *
 * Word cho phép định dạng kế thừa theo tầng. Thứ tự áp dụng (tầng sau đè tầng trước):
 *   Đoạn:  docDefaults/pPr → style đoạn (theo chuỗi basedOn) → pPr đặt trực tiếp trên đoạn
 *   Chữ:   docDefaults/rPr → rPr của style đoạn → style ký tự (rStyle) → rPr đặt trực tiếp
 * Font dạng "theme" (minorHAnsi...) được tra trong word/theme/theme1.xml.
 */
import JSZip from 'jszip'
import {
  attr,
  child,
  children,
  kids,
  num,
  onOff,
  parseXml,
  path,
  tagOf,
  textOf,
  type XNode
} from './xml'

export interface RunProps {
  font?: string
  /** Tên font theme, ví dụ 'minorHAnsi' — được ưu tiên hơn font nếu có */
  fontTheme?: string
  /** Cỡ chữ theo nửa point (w:sz) */
  sizeHalfPt?: number
  bold?: boolean
  vertAlign?: string
}

export interface ParaProps {
  jc?: string
  line?: number
  lineRule?: string
  /** Twips (1/20 point) */
  before?: number
  after?: number
  firstLine?: number
  hanging?: number
  outlineLvl?: number
  numbered?: boolean
}

export interface DocxRun {
  text: string
  font: string | undefined
  sizePt: number | undefined
  vertAlign: string | undefined
}

export interface DocxParagraph {
  /** Thứ tự trong số các đoạn có chữ (bắt đầu từ 1); 0 nếu đoạn rỗng */
  number: number
  text: string
  styleId: string | undefined
  styleName: string | undefined
  /** 1–9 nếu là heading */
  headingLevel: number | null
  inTable: boolean
  inToc: boolean
  isList: boolean
  props: ParaProps
  runs: DocxRun[]
}

export interface DocxSection {
  /** Lề trang theo twips */
  margins: { top?: number; bottom?: number; left?: number; right?: number }
}

export interface DocxModel {
  paragraphs: DocxParagraph[]
  sections: DocxSection[]
}

interface StyleDef {
  type: string
  name?: string
  basedOn?: string
  pPr: ParaProps
  rPr: RunProps
}

// ---------- Đọc thuộc tính ----------

function definedOnly<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>
}

export function readRunProps(rPr: XNode | undefined): RunProps {
  if (!rPr) return {}
  const fonts = child(rPr, 'w:rFonts')
  const theme = attr(fonts, 'w:asciiTheme') ?? attr(fonts, 'w:hAnsiTheme')
  const font = attr(fonts, 'w:ascii') ?? attr(fonts, 'w:hAnsi')
  const props: RunProps = {
    sizeHalfPt: num(attr(child(rPr, 'w:sz'), 'w:val')),
    bold: onOff(child(rPr, 'w:b')),
    vertAlign: attr(child(rPr, 'w:vertAlign'), 'w:val')
  }
  // Theme font được Word ưu tiên hơn font thường trong cùng một rFonts
  if (theme) props.fontTheme = theme
  else if (font) {
    props.font = font
    props.fontTheme = '' // xóa theme được kế thừa từ tầng trên
  }
  return definedOnly(props)
}

export function readParaProps(pPr: XNode | undefined): ParaProps {
  if (!pPr) return {}
  const spacing = child(pPr, 'w:spacing')
  const ind = child(pPr, 'w:ind')
  return definedOnly({
    jc: attr(child(pPr, 'w:jc'), 'w:val'),
    line: num(attr(spacing, 'w:line')),
    lineRule: attr(spacing, 'w:lineRule'),
    before: num(attr(spacing, 'w:before')),
    after: num(attr(spacing, 'w:after')),
    firstLine: num(attr(ind, 'w:firstLine')),
    hanging: num(attr(ind, 'w:hanging')),
    outlineLvl: num(attr(child(pPr, 'w:outlineLvl'), 'w:val')),
    numbered: child(pPr, 'w:numPr') ? true : undefined
  })
}

/** Gộp các tầng: tầng sau đè các thuộc tính mà nó có. */
function merge<T extends object>(...layers: T[]): T {
  return Object.assign({}, ...layers)
}

/** Thụt đầu dòng: firstLine và hanging loại trừ nhau, tầng sau có cái nào thì dùng cái đó. */
function mergePara(...layers: ParaProps[]): ParaProps {
  let result: ParaProps = {}
  for (const l of layers) {
    const next = merge(result, l)
    if (l.firstLine !== undefined && l.hanging === undefined) delete next.hanging
    if (l.hanging !== undefined && l.firstLine === undefined) delete next.firstLine
    result = next
  }
  return result
}

// ---------- Styles & theme ----------

interface StyleSheet {
  defaults: { rPr: RunProps; pPr: ParaProps }
  styles: Map<string, StyleDef>
  defaultParagraphStyle: string | undefined
}

function readStyles(stylesXml: XNode[] | undefined): StyleSheet {
  const root = path(stylesXml, 'w:styles')
  const docDefaults = child(root, 'w:docDefaults')
  const defaults = {
    rPr: readRunProps(path(docDefaults, 'w:rPrDefault', 'w:rPr')),
    pPr: readParaProps(path(docDefaults, 'w:pPrDefault', 'w:pPr'))
  }
  const styles = new Map<string, StyleDef>()
  let defaultParagraphStyle: string | undefined
  for (const s of children(root, 'w:style')) {
    const id = attr(s, 'w:styleId')
    const type = attr(s, 'w:type')
    if (!id || !type) continue
    styles.set(id, {
      type,
      name: attr(child(s, 'w:name'), 'w:val'),
      basedOn: attr(child(s, 'w:basedOn'), 'w:val'),
      pPr: readParaProps(child(s, 'w:pPr')),
      rPr: readRunProps(child(s, 'w:rPr'))
    })
    if (type === 'paragraph' && (attr(s, 'w:default') === '1' || attr(s, 'w:default') === 'true')) {
      defaultParagraphStyle = id
    }
  }
  return { defaults, styles, defaultParagraphStyle }
}

/** Chuỗi style từ gốc đến lá (theo basedOn), có chống vòng lặp. */
function styleChain(styles: Map<string, StyleDef>, id: string | undefined): StyleDef[] {
  const chain: StyleDef[] = []
  const seen = new Set<string>()
  let current = id
  while (current && !seen.has(current)) {
    seen.add(current)
    const s = styles.get(current)
    if (!s) break
    chain.unshift(s)
    current = s.basedOn
  }
  return chain
}

function readThemeFonts(themeXml: XNode[] | undefined): { major?: string; minor?: string } {
  const scheme = path(themeXml, 'a:theme', 'a:themeElements', 'a:fontScheme')
  return {
    major: attr(path(scheme, 'a:majorFont', 'a:latin'), 'typeface'),
    minor: attr(path(scheme, 'a:minorFont', 'a:latin'), 'typeface')
  }
}

// ---------- Duyệt nội dung ----------

const RUN_CONTAINERS = new Set([
  'w:hyperlink',
  'w:ins',
  'w:smartTag',
  'w:fldSimple',
  'w:customXml',
  'w:moveTo'
])

interface RawRun {
  text: string
  rPr: XNode | undefined
}

function runText(run: XNode): string {
  let s = ''
  for (const k of kids(run)) {
    const tag = tagOf(k)
    if (tag === 'w:t') s += kids(k).map(textOf).join('')
    else if (tag === 'w:tab') s += '\t'
  }
  return s
}

function collectRuns(container: XNode, out: RawRun[]): void {
  for (const k of kids(container)) {
    const tag = tagOf(k)
    if (tag === 'w:r') out.push({ text: runText(k), rPr: child(k, 'w:rPr') })
    else if (tag && RUN_CONTAINERS.has(tag)) collectRuns(k, out)
    else if (tag === 'w:sdt') {
      const content = child(k, 'w:sdtContent')
      if (content) collectRuns(content, out)
    }
    // w:del, w:moveFrom (nội dung đã xóa khi bật Track Changes) bị bỏ qua
  }
}

interface RawParagraph {
  node: XNode
  inTable: boolean
  inToc: boolean
}

function isTocSdt(sdt: XNode): boolean {
  const gallery = path(sdt, 'w:sdtPr', 'w:docPartObj', 'w:docPartGallery')
  return /table of contents/i.test(attr(gallery, 'w:val') ?? '')
}

function collectParagraphs(
  container: XNode,
  ctx: { inTable: boolean; inToc: boolean },
  out: RawParagraph[],
  sections: XNode[]
): void {
  for (const k of kids(container)) {
    const tag = tagOf(k)
    if (tag === 'w:p') {
      out.push({ node: k, ...ctx })
      const sect = path(k, 'w:pPr', 'w:sectPr')
      if (sect) sections.push(sect)
    } else if (tag === 'w:tbl') {
      for (const tr of children(k, 'w:tr'))
        for (const tc of children(tr, 'w:tc'))
          collectParagraphs(tc, { ...ctx, inTable: true }, out, sections)
    } else if (tag === 'w:sdt') {
      const content = child(k, 'w:sdtContent')
      if (content) {
        collectParagraphs(content, { ...ctx, inToc: ctx.inToc || isTocSdt(k) }, out, sections)
      }
    } else if (tag === 'w:customXml') {
      collectParagraphs(k, ctx, out, sections)
    } else if (tag === 'w:sectPr') {
      sections.push(k)
    }
  }
}

function headingLevelOf(pPr: ParaProps, styleName: string | undefined): number | null {
  if (pPr.outlineLvl !== undefined && pPr.outlineLvl >= 0 && pPr.outlineLvl <= 8) {
    return pPr.outlineLvl + 1
  }
  const m = /^heading\s*(\d)$/i.exec(styleName ?? '')
  return m ? Number(m[1]) : null
}

// ---------- Hàm chính ----------

export async function loadDocx(data: Buffer): Promise<DocxModel> {
  const zip = await JSZip.loadAsync(data)
  const read = async (name: string): Promise<XNode[] | undefined> => {
    const file = zip.file(name)
    return file ? parseXml(await file.async('string')) : undefined
  }

  const documentXml = await read('word/document.xml')
  if (!documentXml) throw new Error('Không tìm thấy word/document.xml: không phải file DOCX hợp lệ')
  const { defaults, styles, defaultParagraphStyle } = readStyles(await read('word/styles.xml'))
  const theme = readThemeFonts(await read('word/theme/theme1.xml'))

  const resolveFont = (r: RunProps): string | undefined => {
    if (r.fontTheme) return r.fontTheme.startsWith('major') ? theme.major : theme.minor
    return r.font
  }

  const body = path(documentXml, 'w:document', 'w:body')
  const raw: RawParagraph[] = []
  const sectNodes: XNode[] = []
  if (body) collectParagraphs(body, { inTable: false, inToc: false }, raw, sectNodes)

  let counter = 0
  const paragraphs: DocxParagraph[] = raw.map(({ node, inTable, inToc }) => {
    const pPrNode = child(node, 'w:pPr')
    const styleId = attr(child(pPrNode, 'w:pStyle'), 'w:val') ?? defaultParagraphStyle
    const chain = styleChain(styles, styleId)
    const leaf = styles.get(styleId ?? '')
    const props = mergePara(defaults.pPr, ...chain.map((s) => s.pPr), readParaProps(pPrNode))
    const paraRun = merge(defaults.rPr, ...chain.map((s) => s.rPr))

    const rawRuns: RawRun[] = []
    collectRuns(node, rawRuns)
    const runs = rawRuns.map(({ text, rPr }) => {
      const rStyle = attr(child(rPr, 'w:rStyle'), 'w:val')
      const charChain = styleChain(styles, rStyle)
      const eff = merge(paraRun, ...charChain.map((s) => s.rPr), readRunProps(rPr))
      return {
        text,
        font: resolveFont(eff),
        sizePt: eff.sizeHalfPt !== undefined ? eff.sizeHalfPt / 2 : undefined,
        vertAlign: eff.vertAlign
      }
    })

    const text = runs.map((r) => r.text).join('')
    const hasText = text.trim().length > 0
    return {
      number: hasText ? ++counter : 0,
      text,
      styleId,
      styleName: leaf?.name,
      headingLevel: headingLevelOf(props, leaf?.name),
      inTable,
      inToc: inToc || /^toc\s*\d/i.test(leaf?.name ?? ''),
      isList: props.numbered === true,
      props,
      runs
    }
  })

  const sections = sectNodes.map((s) => {
    const m = child(s, 'w:pgMar')
    return {
      margins: {
        top: num(attr(m, 'w:top')),
        bottom: num(attr(m, 'w:bottom')),
        left: num(attr(m, 'w:left')),
        right: num(attr(m, 'w:right'))
      }
    }
  })

  return { paragraphs, sections }
}
