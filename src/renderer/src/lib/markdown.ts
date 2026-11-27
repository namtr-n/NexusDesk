/**
 * Bộ đọc Markdown tối giản cho câu trả lời của AI: tiêu đề, gạch đầu dòng, danh sách số,
 * bảng, đoạn văn; trong dòng: **đậm**, *nghiêng*, `code`. Không bao giờ chèn HTML thô.
 */
export type Inline = { type: 'text' | 'bold' | 'italic' | 'code'; text: string }

export type Block =
  | { type: 'heading'; level: number; inline: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'table'; header: Inline[][]; rows: Inline[][][] }
  | { type: 'paragraph'; inline: Inline[] }

export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  const re = /\*\*(.+?)\*\*|`([^`]+)`|\*([^*\s][^*]*?)\*/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) })
    if (m[1] !== undefined) out.push({ type: 'bold', text: m[1] })
    else if (m[2] !== undefined) out.push({ type: 'code', text: m[2] })
    else out.push({ type: 'italic', text: m[3] })
    last = re.lastIndex
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) })
  return out
}

const splitRow = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'))

const isSeparator = (line: string): boolean =>
  /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line)

export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let para: string[] = []

  const flushPara = (): void => {
    if (para.length) blocks.push({ type: 'paragraph', inline: parseInline(para.join(' ')) })
    para = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed) {
      flushPara()
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed)
    if (heading) {
      flushPara()
      blocks.push({ type: 'heading', level: heading[1].length, inline: parseInline(heading[2]) })
      continue
    }

    // Bảng: dòng tiêu đề "| a | b |" + dòng phân cách "|---|---|"
    if (trimmed.startsWith('|') && i + 1 < lines.length && isSeparator(lines[i + 1])) {
      flushPara()
      const header = splitRow(trimmed).map(parseInline)
      const rows: Inline[][][] = []
      i += 2
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitRow(lines[i]).map(parseInline))
        i++
      }
      i--
      blocks.push({ type: 'table', header, rows })
      continue
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(trimmed)
    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed)
    if (bullet || numbered) {
      flushPara()
      const ordered = !bullet
      const items: Inline[][] = []
      while (i < lines.length) {
        const t = lines[i].trim()
        const m = ordered ? /^\d+[.)]\s+(.*)$/.exec(t) : /^[-*+]\s+(.*)$/.exec(t)
        if (!m) break
        items.push(parseInline(m[1]))
        i++
      }
      i--
      blocks.push({ type: 'list', ordered, items })
      continue
    }

    para.push(trimmed)
  }
  flushPara()
  return blocks
}
