import { describe, expect, it } from 'vitest'
import { decodeText, extractText } from '../../src/main/services/documents/extract'
import { makeDocx, makePdf } from './fixtures'

const VI = 'Chương 1. Tổng quan đề tài – Nghiên cứu ứng dụng'

describe('decodeText (TXT)', () => {
  it('UTF-8 không BOM, có tiếng Việt', () => {
    expect(decodeText(Buffer.from(VI, 'utf8'))).toBe(VI)
  })

  it('UTF-8 có BOM: bỏ BOM', () => {
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(VI, 'utf8')])
    expect(decodeText(buf)).toBe(VI)
  })

  it('UTF-16 LE có BOM (Notepad cũ lưu "Unicode")', () => {
    const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(VI, 'utf16le')])
    expect(decodeText(buf)).toBe(VI)
  })

  it('không phải UTF-8: vẫn đọc được, không lỗi', () => {
    expect(decodeText(Buffer.from([0x63, 0x61, 0x66, 0xe9]))).toBe('café')
  })
})

describe('extractText', () => {
  it('TXT: chuẩn hóa xuống dòng và dòng trống thừa', async () => {
    const r = await extractText(Buffer.from('a  \r\nb\r\n\r\n\r\n\r\nc\n'), 'txt')
    expect(r).toEqual({ text: 'a\nb\n\nc', pageCount: null })
  })

  it('DOCX: lấy đủ các đoạn, giữ tiếng Việt', async () => {
    const buf = await makeDocx([VI, 'Đoạn thứ hai.'])
    const r = await extractText(buf, 'docx')
    expect(r.text).toContain(VI)
    expect(r.text).toContain('Đoạn thứ hai.')
  })

  it('DOCX hỏng: ném lỗi', async () => {
    await expect(extractText(Buffer.from('không phải docx'), 'docx')).rejects.toThrow()
  })

  it('PDF có chữ: lấy chữ và số trang', async () => {
    const r = await extractText(makePdf(['Hello PDF', 'Second line']), 'pdf')
    expect(r.pageCount).toBe(1)
    expect(r.text).toContain('Hello PDF')
    expect(r.text).toContain('Second line')
  })

  it('PDF không có chữ (giống ảnh scan): text rỗng', async () => {
    const r = await extractText(makePdf([]), 'pdf')
    expect(r).toEqual({ text: '', pageCount: 1 })
  })

  it('PDF hỏng: ném lỗi', async () => {
    await expect(extractText(Buffer.from('%PDF-1.4 rác'), 'pdf')).rejects.toThrow()
  })
})
