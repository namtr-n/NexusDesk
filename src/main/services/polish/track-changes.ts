/**
 * Ghi các sửa đổi nhỏ ("tìm → thay") vào một đoạn DOCX dưới dạng TRACK CHANGES của Word:
 *   chữ cũ  → <w:del><w:r><w:delText>…</w:delText></w:r></w:del>
 *   chữ mới → <w:ins><w:r><w:t>…</w:t></w:r></w:ins>
 * Người dùng mở file trong Word, xem từng chỗ và bấm Accept / Reject.
 * Định dạng (rPr) của chữ gốc được giữ cho chữ mới.
 */
import { kids, tagOf, textOf, type XNode } from '../format/xml'

export interface TextEdit {
  find: string
  replace: string
}

export interface RevisionContext {
  author: string
  /** ISO 8601 không có phần mili-giây, ví dụ 2026-11-27T20:50:00Z */
  date: string
  /** Cấp mã w:id duy nhất cho mỗi w:ins / w:del */
  nextId: () => number
}

/** Cụm chữ "đơn giản" sửa được: chỉ gồm rPr và w:t */
interface Segment {
  run: XNode
  parent: XNode[]
  text: string
  start: number
  /** Có tab / ngắt dòng / hình / trường... → không được sửa xuyên qua */
  locked: boolean
}

const RUN_CONTAINERS = new Set(['w:hyperlink', 'w:ins', 'w:smartTag', 'w:customXml'])

function runChildren(run: XNode): XNode[] {
  return kids(run)
}

function isSimpleRun(run: XNode): boolean {
  return runChildren(run).every((k) => {
    const t = tagOf(k)
    return t === 'w:rPr' || t === 'w:t'
  })
}

function runText(run: XNode): string {
  let s = ''
  for (const k of runChildren(run)) {
    const t = tagOf(k)
    if (t === 'w:t') s += kids(k).map(textOf).join('')
    else if (t === 'w:tab') s += '\t'
  }
  return s
}

function collectSegments(container: XNode, out: Segment[], offset: { v: number }): void {
  const list = kids(container)
  for (const k of list) {
    const tag = tagOf(k)
    if (tag === 'w:r') {
      const text = runText(k)
      out.push({ run: k, parent: list, text, start: offset.v, locked: !isSimpleRun(k) })
      offset.v += text.length
    } else if (tag && RUN_CONTAINERS.has(tag)) {
      collectSegments(k, out, offset)
    } else if (tag === 'w:sdt') {
      const content = kids(k).find((c) => tagOf(c) === 'w:sdtContent')
      // Nội dung trong content control: khóa, không sửa
      if (content) {
        const inner: Segment[] = []
        collectSegments(content, inner, offset)
        for (const s of inner) out.push({ ...s, locked: true })
      }
    }
  }
}

/** Văn bản của đoạn theo đúng cách tính vị trí dùng khi áp dụng sửa đổi */
export function paragraphText(paragraph: XNode): string {
  const segs: Segment[] = []
  collectSegments(paragraph, segs, { v: 0 })
  return segs.map((s) => s.text).join('')
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

function makeRun(rPr: XNode | undefined, text: string, deleted: boolean): XNode {
  const children: XNode[] = []
  if (rPr) children.push(clone(rPr))
  children.push({
    [deleted ? 'w:delText' : 'w:t']: [{ '#text': text }],
    ':@': { 'xml:space': 'preserve' }
  })
  return { 'w:r': children }
}

const rPrOf = (run: XNode): XNode | undefined => runChildren(run).find((k) => tagOf(k) === 'w:rPr')

function revision(tag: 'w:ins' | 'w:del', runs: XNode[], ctx: RevisionContext): XNode {
  return {
    [tag]: runs,
    ':@': { 'w:id': String(ctx.nextId()), 'w:author': ctx.author, 'w:date': ctx.date }
  }
}

export interface ApplyResult {
  applied: TextEdit[]
  skipped: { edit: TextEdit; reason: string }[]
}

/**
 * Áp dụng các sửa đổi vào đoạn (sửa trực tiếp cây XML).
 * Bỏ qua sửa đổi: không tìm thấy, tìm thấy nhiều chỗ, chồng lấn nhau, hoặc đi qua phần bị khóa.
 */
export function applyEdits(paragraph: XNode, edits: TextEdit[], ctx: RevisionContext): ApplyResult {
  const segs: Segment[] = []
  collectSegments(paragraph, segs, { v: 0 })
  const text = segs.map((s) => s.text).join('')
  const result: ApplyResult = { applied: [], skipped: [] }

  // Xác định vị trí từng sửa đổi
  const located: { edit: TextEdit; start: number; end: number }[] = []
  for (const edit of edits) {
    if (!edit.find || edit.find === edit.replace) {
      result.skipped.push({ edit, reason: 'Sửa đổi rỗng' })
      continue
    }
    const first = text.indexOf(edit.find)
    if (first < 0) {
      result.skipped.push({ edit, reason: 'Không tìm thấy trong đoạn' })
      continue
    }
    if (text.indexOf(edit.find, first + 1) >= 0) {
      result.skipped.push({ edit, reason: 'Xuất hiện nhiều lần, không rõ chỗ nào' })
      continue
    }
    located.push({ edit, start: first, end: first + edit.find.length })
  }

  // Bỏ các sửa đổi chồng lấn (giữ cái đứng trước)
  located.sort((a, b) => a.start - b.start)
  const accepted: typeof located = []
  for (const l of located) {
    const prev = accepted.at(-1)
    if (prev && l.start < prev.end) {
      result.skipped.push({ edit: l.edit, reason: 'Chồng lấn với sửa đổi khác' })
    } else accepted.push(l)
  }

  // Áp dụng từ cuối lên đầu để vị trí phía trước không bị lệch. Sau mỗi lần sửa, đọc lại
  // các cụm chữ (cụm vừa bị tách đã đổi node); phần phía trước giữ nguyên vị trí.
  for (const { edit, start, end } of accepted.reverse()) {
    const current: Segment[] = []
    collectSegments(paragraph, current, { v: 0 })
    const touched = current.filter((s) => s.start < end && s.start + s.text.length > start)
    if (touched.length === 0 || touched.some((s) => s.locked)) {
      result.skipped.push({ edit, reason: 'Nằm trong phần không sửa được (trường, hình, tab...)' })
      continue
    }

    let lastDel: { node: XNode; parent: XNode[] } | null = null
    for (const seg of touched) {
      const a = Math.max(0, start - seg.start)
      const b = Math.min(seg.text.length, end - seg.start)
      const rPr = rPrOf(seg.run)
      const before = seg.text.slice(0, a)
      const middle = seg.text.slice(a, b)
      const after = seg.text.slice(b)
      const del = revision('w:del', [makeRun(rPr, middle, true)], ctx)
      const replacement: XNode[] = []
      if (before) replacement.push(makeRun(rPr, before, false))
      replacement.push(del)
      if (after) replacement.push(makeRun(rPr, after, false))
      const idx = seg.parent.indexOf(seg.run)
      seg.parent.splice(idx, 1, ...replacement)
      lastDel = { node: del, parent: seg.parent }
    }
    if (edit.replace && lastDel) {
      const rPr = rPrOf(touched[0].run)
      const ins = revision('w:ins', [makeRun(rPr, edit.replace, false)], ctx)
      lastDel.parent.splice(lastDel.parent.indexOf(lastDel.node) + 1, 0, ins)
    }
    result.applied.push(edit)
  }
  result.applied.reverse()
  return result
}
