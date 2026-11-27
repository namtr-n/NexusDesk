/**
 * Tiện ích đọc XML giữ nguyên thứ tự phần tử (fast-xml-parser, preserveOrder).
 * Mỗi node có dạng { "w:p": [con...], ":@": { "w:val": "..." } } hoặc { "#text": "..." }.
 */
import { XMLParser } from 'fast-xml-parser'

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
