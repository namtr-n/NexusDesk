import { describe, expect, it } from 'vitest'
import { parseInline, parseMarkdown } from '../../src/renderer/src/lib/markdown'

describe('parseMarkdown', () => {
  it('tiêu đề, danh sách, đoạn văn', () => {
    expect(parseMarkdown('## Tóm tắt\nCâu một\ncâu hai.\n\n- a\n- **b**\n1. x\n2. y')).toEqual([
      { type: 'heading', level: 2, inline: [{ type: 'text', text: 'Tóm tắt' }] },
      { type: 'paragraph', inline: [{ type: 'text', text: 'Câu một câu hai.' }] },
      {
        type: 'list',
        ordered: false,
        items: [[{ type: 'text', text: 'a' }], [{ type: 'bold', text: 'b' }]]
      },
      {
        type: 'list',
        ordered: true,
        items: [[{ type: 'text', text: 'x' }], [{ type: 'text', text: 'y' }]]
      }
    ])
  })

  it('bảng lỗi chính tả', () => {
    const md =
      '| # | Trích đoạn | Sửa thành |\n|---|---|---|\n| 1 | sử lý | xử lý |\n| 2 | a \\| b | c |'
    const [table] = parseMarkdown(md)
    expect(table).toMatchObject({ type: 'table' })
    if (table.type !== 'table') throw new Error()
    expect(table.header.map((h) => h[0].text)).toEqual(['#', 'Trích đoạn', 'Sửa thành'])
    expect(table.rows.map((r) => r.map((c) => c[0]?.text))).toEqual([
      ['1', 'sử lý', 'xử lý'],
      ['2', 'a | b', 'c']
    ])
  })

  it('chữ trong dòng: đậm, nghiêng, code; HTML giữ nguyên dạng chữ', () => {
    expect(parseInline('**Câu gốc:** dùng `npm` và *nghiêng* <b>x</b>')).toEqual([
      { type: 'bold', text: 'Câu gốc:' },
      { type: 'text', text: ' dùng ' },
      { type: 'code', text: 'npm' },
      { type: 'text', text: ' và ' },
      { type: 'italic', text: 'nghiêng' },
      { type: 'text', text: ' <b>x</b>' }
    ])
  })
})
