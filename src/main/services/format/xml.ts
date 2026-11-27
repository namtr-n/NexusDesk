/**
 * Tiện ích đọc XML giữ nguyên thứ tự phần tử (fast-xml-parser, preserveOrder).
 * Mỗi node có dạng { "w:p": [con...], ":@": { "w:val": "..." } } hoặc { "#text": "..." }.
 */
import { XMLBuilder, XMLParser } from 'fast-xml-parser'

export type XNode = Record<string, unknown>

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  processEntities: true
})

export function parseXml(xml: string): XNode[] {
  return parser.parse(xml) as XNode[]
}

const builder = new XMLBuilder({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  suppressEmptyNode: true,
  processEntities: true,
  format: false
})

/** Ghi cây XML (dạng preserveOrder) trở lại thành chuỗi */
export function buildXml(nodes: XNode[]): string {
  return builder.build(nodes) as string
}

// ---------- Sửa cây XML ----------

export function setAttr(node: XNode, name: string, value: string): void {
  const attrs = (node[':@'] as Record<string, string> | undefined) ?? {}
  attrs[name] = value
  node[':@'] = attrs
}

export function removeAttr(node: XNode, name: string): void {
  const attrs = node[':@'] as Record<string, string> | undefined
  if (attrs) delete attrs[name]
}

export function newNode(tag: string, attrs?: Record<string, string>): XNode {
  const n: XNode = { [tag]: [] }
  if (attrs) n[':@'] = { ...attrs }
  return n
}

function childList(parent: XNode): XNode[] {
  const tag = tagOf(parent)!
  if (!Array.isArray(parent[tag])) parent[tag] = []
  return parent[tag] as XNode[]
}

/**
 * Lấy (hoặc tạo) phần tử con, chèn ĐÚNG THỨ TỰ mà chuẩn OOXML yêu cầu
 * (Word coi file là hỏng nếu thứ tự phần tử sai).
 */
export function ensureChild(parent: XNode, tag: string, order: readonly string[]): XNode {
  const list = childList(parent)
  const found = list.find((k) => tagOf(k) === tag)
  if (found) return found
  const rank = order.indexOf(tag)
  let at = list.length
  for (let i = 0; i < list.length; i++) {
    const r = order.indexOf(tagOf(list[i]) ?? '')
    if (r > rank) {
      at = i
      break
    }
  }
  const created = newNode(tag)
  list.splice(at, 0, created)
  return created
}

/** Lấy (hoặc tạo ở vị trí đầu tiên) phần tử con, ví dụ w:pPr trong w:p, w:rPr trong w:r */
export function ensureFirstChild(parent: XNode, tag: string): XNode {
  const list = childList(parent)
  const found = list.find((k) => tagOf(k) === tag)
  if (found) return found
  const created = newNode(tag)
  list.unshift(created)
  return created
}

export function removeChild(parent: XNode, tag: string): void {
  const list = childList(parent)
  const i = list.findIndex((k) => tagOf(k) === tag)
  if (i >= 0) list.splice(i, 1)
}

export function tagOf(node: XNode): string | undefined {
  for (const key of Object.keys(node)) if (key !== ':@') return key
  return undefined
}

export function kids(node: XNode): XNode[] {
  const tag = tagOf(node)
  if (!tag || tag === '#text') return []
  const value = node[tag]
  return Array.isArray(value) ? (value as XNode[]) : []
}

export function textOf(node: XNode): string {
  const value = node['#text']
  return typeof value === 'string' ? value : ''
}

export function attr(node: XNode | undefined, name: string): string | undefined {
  const attrs = node?.[':@'] as Record<string, string> | undefined
  return attrs?.[name]
}

export function child(node: XNode | undefined, tag: string): XNode | undefined {
  return node ? kids(node).find((k) => tagOf(k) === tag) : undefined
}

export function children(node: XNode | undefined, tag: string): XNode[] {
  return node ? kids(node).filter((k) => tagOf(k) === tag) : []
}

/** Tìm node đầu tiên theo đường dẫn tag, ví dụ path(root, 'w:document', 'w:body') */
export function path(nodes: XNode[] | XNode | undefined, ...tags: string[]): XNode | undefined {
  let current: XNode | undefined = Array.isArray(nodes)
    ? nodes.find((n) => tagOf(n) === tags[0])
    : child(nodes, tags[0])
  for (const tag of tags.slice(1)) current = child(current, tag)
  return current
}

/** Thuộc tính bật/tắt kiểu Word: <w:b/> = bật, <w:b w:val="0|false|off"/> = tắt */
export function onOff(node: XNode | undefined): boolean | undefined {
  if (!node) return undefined
  const v = attr(node, 'w:val')
  return !(v === '0' || v === 'false' || v === 'off')
}

export function num(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}
