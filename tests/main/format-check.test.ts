import { describe, expect, it } from 'vitest'
import { DEFAULT_FORMAT_RULES, type FormatRules } from '@shared/format'
import { checkFormat, describeLineSpacing } from '../../src/main/services/format/check'
import { loadDocx } from '../../src/main/services/format/docx-model'
import { buildDocx, LONG, p, SECT_OK } from './docx-builder'

async function check(body: string, rules: FormatRules = DEFAULT_FORMAT_RULES) {
  return checkFormat(await loadDocx(await buildDocx(body)), rules)
}
const rulesOf = (r: Awaited<ReturnType<typeof check>>) => r.issues.map((i) => i.rule)

describe('checkFormat', () => {
  it('tài liệu đúng chuẩn: không có lỗi', async () => {
    const r = await check(
      p('CHƯƠNG 1. TỔNG QUAN', {
        style: 'Heading1',
        rPr: '<w:rFonts w:ascii="Times New Roman"/>'
      }) +
        p(LONG, { style: 'BaoCao' }) +
        p('Hình 1.1. Sơ đồ hệ thống', { style: 'Caption' }) +
        SECT_OK
    )
    expect(r.issues).toEqual([])
    expect(r.stats).toEqual({ paragraphs: 3, bodyParagraphs: 1, headings: 1, sections: 1 })
  })

  it('để mặc định của Word (Calibri 11, 1,08 dòng, căn trái): báo đủ các lỗi', async () => {
    const r = await check(p(LONG) + SECT_OK)
    expect(rulesOf(r)).toEqual([
      'font-family',
      'font-size',
      'line-spacing',
      'alignment',
      'first-line-indent'
    ])
    const byRule = Object.fromEntries(r.issues.map((i) => [i.rule, i]))
    expect(byRule['font-family']).toMatchObject({
      actual: 'Calibri',
      expected: 'Times New Roman',
      paragraph: 1
    })
    expect(byRule['font-size']).toMatchObject({ actual: '11 pt', expected: '13 pt' })
    expect(byRule['line-spacing'].actual).toBe('1,08 dòng')
    expect(byRule['alignment'].actual).toBe('Căn trái')
    expect(byRule['first-line-indent'].actual).toBe('Không thụt')
    expect(byRule['font-family'].excerpt.startsWith('Sinh viên thường')).toBe(true)
  })

  it('một cụm chữ sai font trong đoạn đúng: chỉ báo font, liệt kê font sai', async () => {
    const body =
      '<w:p><w:pPr><w:pStyle w:val="BaoCao"/></w:pPr>' +
      `<w:r><w:t>${LONG}</w:t></w:r>` +
      '<w:r><w:rPr><w:rFonts w:ascii="Arial"/></w:rPr><w:t>chữ Arial</w:t></w:r></w:p>' +
      SECT_OK
    const r = await check(body)
    expect(r.issues).toEqual([
      expect.objectContaining({ rule: 'font-family', actual: 'Arial', paragraph: 1 })
    ])
  })

  it('chỉ số trên/dưới (superscript) không bị bắt lỗi cỡ chữ', async () => {
    const body =
      '<w:p><w:pPr><w:pStyle w:val="BaoCao"/></w:pPr>' +
      `<w:r><w:t>${LONG}</w:t></w:r>` +
      '<w:r><w:rPr><w:vertAlign w:val="superscript"/><w:sz w:val="16"/></w:rPr><w:t>[1]</w:t></w:r></w:p>' +
      SECT_OK
    expect((await check(body)).issues).toEqual([])
  })

  it('đoạn ngắn và đoạn danh sách: không bắt căn đều / thụt dòng', async () => {
    const r = await check(
      p('Đoạn ngắn căn trái', {
        style: 'BaoCao',
        pPr: '<w:jc w:val="left"/><w:ind w:firstLine="0"/>'
      }) +
        p(LONG, {
          style: 'BaoCao',
          pPr: '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:ind w:hanging="360"/>'
        }) +
        SECT_OK
    )
    expect(r.issues).toEqual([])
  })

  it('giãn dòng kiểu "Chính xác" bị báo kể cả khi gần đúng', async () => {
    const r = await check(
      p(LONG, { style: 'BaoCao', pPr: '<w:spacing w:line="390" w:lineRule="exact"/>' }) + SECT_OK
    )
    expect(r.issues).toEqual([
      expect.objectContaining({
        rule: 'line-spacing',
        actual: 'Chính xác 19,5 pt',
        expected: '1,5 dòng'
      })
    ])
  })

  it('khoảng cách trước/sau đoạn ngoài khoảng cho phép', async () => {
    const r = await check(
      p(LONG, { style: 'BaoCao', pPr: '<w:spacing w:before="480" w:after="0"/>' }) + SECT_OK
    )
    expect(r.issues).toEqual([
      expect.objectContaining({ rule: 'spacing-before', actual: '24 pt', expected: '0–12 pt' })
    ])
  })

  it('bảng: chỉ kiểm tra font, không kiểm tra cỡ chữ / giãn dòng', async () => {
    const r = await check(
      '<w:tbl><w:tr><w:tc>' + p('Ô bảng cỡ 11 giãn đơn') + '</w:tc></w:tr></w:tbl>' + SECT_OK
    )
    expect(rulesOf(r)).toEqual(['font-family'])
  })

  it('mục lục bị bỏ qua hoàn toàn', async () => {
    const r = await check(p('Chương 1 ........ 5', { style: 'TOC1' }) + SECT_OK)
    expect(r.issues).toEqual([])
    expect(r.stats.paragraphs).toBe(0)
  })

  it('heading nhảy cấp và heading nhỏ hơn cỡ chữ thân bài', async () => {
    const tnr = '<w:rFonts w:ascii="Times New Roman"/>'
    const r = await check(
      p('Chương 1', { style: 'Heading1', rPr: tnr }) +
        p('1.1.1 Nhảy cấp', { style: 'Heading3', rPr: tnr }) +
        p('1.2 Nhỏ', { style: 'Heading2', rPr: tnr + '<w:sz w:val="24"/>' }) +
        SECT_OK
    )
    expect(r.issues).toEqual([
      expect.objectContaining({
        rule: 'heading-order',
        paragraph: 2,
        actual: 'Heading 3 ngay sau Heading 1'
      }),
      expect.objectContaining({ rule: 'font-size', paragraph: 3, actual: '12 pt' })
    ])
  })

  it('lề trang sai: liệt kê từng cạnh, theo từng section', async () => {
    const r = await check(
      p(LONG, { style: 'BaoCao' }) +
        '<w:sectPr><w:pgMar w:top="1440" w:bottom="1134" w:left="1440" w:right="1134"/></w:sectPr>'
    )
    expect(r.issues).toEqual([
      {
        rule: 'margin',
        paragraph: null,
        excerpt: 'Toàn bộ tài liệu',
        actual: 'trên 2,54 cm, trái 2,54 cm',
        expected: 'trên 2 cm, trái 3 cm'
      }
    ])
  })

  it('tôn trọng quy tắc tùy chỉnh: Arial 12, giãn 1 dòng, tắt thụt dòng và căn đều', async () => {
    const rules: FormatRules = {
      ...DEFAULT_FORMAT_RULES,
      fontFamily: 'Arial',
      bodyFontSizePt: 12,
      lineSpacing: 1,
      justifyBody: false,
      firstLineIndentCm: null,
      spaceAfterPt: { min: 0, max: 20 }
    }
    const r = await check(
      p(LONG, {
        pPr: '<w:spacing w:line="240"/>',
        rPr: '<w:rFonts w:ascii="Arial"/><w:sz w:val="24"/>'
      }) + SECT_OK,
      rules
    )
    expect(r.issues).toEqual([])
  })

  it('describeLineSpacing', () => {
    expect(describeLineSpacing(undefined, undefined)).toBe('1 dòng (mặc định)')
    expect(describeLineSpacing(360, 'auto')).toBe('1,5 dòng')
    expect(describeLineSpacing(240, 'atLeast')).toBe('Tối thiểu 12 pt')
  })
})
