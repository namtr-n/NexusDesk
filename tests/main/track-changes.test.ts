import { describe, expect, it } from 'vitest'
import {
  applyEdits,
  paragraphText,
  type RevisionContext
} from '../../src/main/services/polish/track-changes'
import { buildXml, parseXml, path, type XNode } from '../../src/main/services/format/xml'

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

function para(inner: string): { root: XNode[]; p: XNode } {
  const root = parseXml(`<w:document ${W}><w:body><w:p>${inner}</w:p></w:body></w:document>`)
  return { root, p: path(root, 'w:document', 'w:body', 'w:p')! }
}

function ctx(): RevisionContext {
  let id = 100
  return { author: 'Nexus Desk AI', date: '2026-11-27T20:00:00Z', nextId: () => id++ }
}

/** Văn bản sau khi "Accept All" (bỏ w:del, giữ w:ins) */
function accepted(p: XNode): string {
  return paragraphText(p)
}

/** Văn bản sau khi "Reject All" (bỏ w:ins, giữ chữ trong w:del) */
function rejected(xml: string): string {
  return xml
    .replace(/<w:ins\b[^>]*>.*?<\/w:ins>/g, '')
    .replace(/<w:delText[^>]*>(.*?)<\/w:delText>/g, '<w:t>$1</w:t>')
    .replace(/<[^>]+>/g, '')
}

describe('applyEdits (Track Changes)', () => {
  it('sửa một từ trong một cụm chữ, giữ định dạng', () => {
    const { root, p } = para(
      '<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Sinh viên cần sử lý dữ liệu.</w:t></w:r>'
    )
    const r = applyEdits(p, [{ find: 'sử lý', replace: 'xử lý' }], ctx())
    expect(r.applied).toHaveLength(1)
    expect(accepted(p)).toBe('Sinh viên cần xử lý dữ liệu.')
    const xml = buildXml(root)
    expect(rejected(xml)).toBe('Sinh viên cần sử lý dữ liệu.')
    expect(xml).toContain(
      '<w:del w:id="100" w:author="Nexus Desk AI" w:date="2026-11-27T20:00:00Z">'
    )
    expect(xml).toContain('<w:delText xml:space="preserve">sử lý</w:delText>')
    expect(xml).toMatch(
      /<w:ins w:id="101"[^>]*><w:r><w:rPr><w:b\/><\/w:rPr><w:t xml:space="preserve">xử lý<\/w:t>/
    )
  })

  it('sửa xuyên qua nhiều cụm chữ; nhiều sửa đổi trong cùng một cụm', () => {
    const { root, p } = para(
      '<w:r><w:t xml:space="preserve">Ứng dung này </w:t></w:r>' +
        '<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">giúp cho sinh viên kiễm tra bài.</w:t></w:r>'
    )
    const r = applyEdits(
      p,
      [
        { find: 'dung này giúp cho', replace: 'dụng này giúp' },
        { find: 'kiễm', replace: 'kiểm' }
      ],
      ctx()
    )
    expect(r.applied).toHaveLength(2)
    expect(accepted(p)).toBe('Ứng dụng này giúp sinh viên kiểm tra bài.')
    expect(rejected(buildXml(root))).toBe('Ứng dung này giúp cho sinh viên kiễm tra bài.')
  })

  it('xóa hẳn (replace rỗng) và mã w:id không trùng', () => {
    const { root, p } = para('<w:r><w:t xml:space="preserve">Rất rất quan trọng.</w:t></w:r>')
    applyEdits(p, [{ find: 'Rất rất', replace: 'Rất' }], ctx())
    const xml = buildXml(root)
    expect(accepted(p)).toBe('Rất quan trọng.')
    const ids = [...xml.matchAll(/w:id="(\d+)"/g)].map((m) => m[1])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('bỏ qua: không tìm thấy, xuất hiện nhiều lần, chồng lấn, đi qua tab', () => {
    const { p } = para(
      '<w:r><w:t xml:space="preserve">a b a c</w:t></w:r><w:r><w:tab/><w:t>d</w:t></w:r>'
    )
    const r = applyEdits(
      p,
      [
        { find: 'zzz', replace: 'y' },
        { find: 'a', replace: 'A' },
        { find: 'b a', replace: 'B A' },
        { find: 'a c', replace: 'A C' },
        { find: 'c\td', replace: 'cd' }
      ],
      ctx()
    )
    expect(r.applied).toEqual([{ find: 'b a', replace: 'B A' }])
    expect(r.skipped.map((s) => s.reason)).toEqual([
      'Không tìm thấy trong đoạn',
      'Xuất hiện nhiều lần, không rõ chỗ nào',
      'Chồng lấn với sửa đổi khác',
      'Nằm trong phần không sửa được (trường, hình, tab...)'
    ])
  })

  it('sửa được chữ nằm trong hyperlink', () => {
    const { p } = para('<w:hyperlink><w:r><w:t>Xem tai lieu</w:t></w:r></w:hyperlink>')
    applyEdits(p, [{ find: 'tai lieu', replace: 'tài liệu' }], ctx())
    expect(accepted(p)).toBe('Xem tài liệu')
  })
})
