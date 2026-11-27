import { describe, expect, it } from 'vitest'
import { DEFAULT_TEMPLATE_SPEC, EMPTY_CATEGORY, type TemplateSpec } from '@shared/format'
import { checkFormat } from '../../src/main/services/format/check'
import { loadDocx } from '../../src/main/services/format/docx-model'
import { buildDocx, LONG, p, SECT_OK } from './docx-builder'

async function check(body: string, spec: TemplateSpec = DEFAULT_TEMPLATE_SPEC) {
  return checkFormat(await loadDocx(await buildDocx(body)), spec)
}
const rulesOf = (r: Awaited<ReturnType<typeof check>>) => r.issues.map((i) => i.rule)
const TNR = '<w:rFonts w:ascii="Times New Roman"/>'

describe('checkFormat với mẫu mặc định', () => {
  it('tài liệu đúng chuẩn: không có lỗi', async () => {
    const r = await check(
      p('CHƯƠNG 1. TỔNG QUAN', { style: 'Heading1', rPr: TNR }) +
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
      paragraph: 1,
      context: 'Thân bài'
    })
    expect(byRule['font-size']).toMatchObject({ actual: '11 pt', expected: '13 pt' })
    expect(byRule['line-spacing'].actual).toBe('1,08 dòng')
    expect(byRule['alignment'].actual).toBe('Căn trái')
    expect(byRule['first-line-indent'].actual).toBe('Không thụt')
  })

  it('một cụm chữ sai font trong đoạn đúng: chỉ báo font, liệt kê font sai', async () => {
    const body =
      '<w:p><w:pPr><w:pStyle w:val="BaoCao"/></w:pPr>' +
      `<w:r><w:t>${LONG}</w:t></w:r>` +
      '<w:r><w:rPr><w:rFonts w:ascii="Arial"/></w:rPr><w:t>chữ Arial</w:t></w:r></w:p>' +
      SECT_OK
    expect((await check(body)).issues).toEqual([
      expect.objectContaining({ rule: 'font-family', actual: 'Arial', paragraph: 1 })
    ])
  })

  it('chỉ số trên (superscript) không bị bắt lỗi cỡ chữ', async () => {
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

  it('khoảng cách trước đoạn ngoài khoảng cho phép', async () => {
    const r = await check(
      p(LONG, { style: 'BaoCao', pPr: '<w:spacing w:before="480" w:after="0"/>' }) + SECT_OK
    )
    expect(r.issues).toEqual([
      expect.objectContaining({ rule: 'spacing-before', actual: '24 pt', expected: '0–12 pt' })
    ])
  })

  it('bảng: chỉ kiểm tra font', async () => {
    const r = await check(
      '<w:tbl><w:tr><w:tc>' + p('Ô bảng cỡ 11 giãn đơn') + '</w:tc></w:tr></w:tbl>' + SECT_OK
    )
    expect(r.issues).toEqual([expect.objectContaining({ rule: 'font-family', context: 'Bảng' })])
  })

  it('mục lục bị bỏ qua hoàn toàn', async () => {
    const r = await check(p('Chương 1 ........ 5', { style: 'TOC1' }) + SECT_OK)
    expect(r.issues).toEqual([])
    expect(r.stats.paragraphs).toBe(0)
  })

  it('heading nhảy cấp và heading nhỏ hơn khoảng cho phép', async () => {
    const r = await check(
      p('Chương 1', { style: 'Heading1', rPr: TNR }) +
        p('1.1.1 Nhảy cấp', { style: 'Heading3', rPr: TNR }) +
        p('1.2 Nhỏ', { style: 'Heading2', rPr: TNR + '<w:sz w:val="24"/>' }) +
        SECT_OK
    )
    expect(r.issues).toEqual([
      expect.objectContaining({
        rule: 'heading-order',
        paragraph: 2,
        actual: 'Heading 3 ngay sau Heading 1'
      }),
      expect.objectContaining({
        rule: 'font-size',
        paragraph: 3,
        context: 'Heading 2',
        actual: '12 pt',
        expected: '13–16 pt'
      })
    ])
  })

  it('lề trang sai: liệt kê từng cạnh', async () => {
    const r = await check(
      p(LONG, { style: 'BaoCao' }) +
        '<w:sectPr><w:pgMar w:top="1440" w:bottom="1134" w:left="1440" w:right="1134"/></w:sectPr>'
    )
    expect(r.issues).toEqual([
      {
        rule: 'margin',
        paragraph: null,
        context: 'Trang',
        excerpt: 'Toàn bộ tài liệu',
        actual: 'trên 2,54 cm, trái 2,54 cm',
        expected: 'trên 2 cm, trái 3 cm'
      }
    ])
  })
})

describe('checkFormat: trang bìa, dòng căn giữa, nhiều section', () => {
  it('dòng ngắn trước heading đầu tiên = trang bìa: chỉ kiểm tra font', async () => {
    const r = await check(
      p('TRƯỜNG ĐẠI HỌC ABC', { pPr: '<w:jc w:val="center"/>', rPr: TNR + '<w:sz w:val="28"/>' }) +
        p('BÁO CÁO THỰC TẬP', { rPr: TNR + '<w:sz w:val="40"/>' }) +
        p('Sinh viên: Nguyễn Văn A', { rPr: '<w:rFonts w:ascii="Arial"/>' }) +
        p('CHƯƠNG 1', { style: 'Heading1', rPr: TNR }) +
        p(LONG, { style: 'BaoCao' }) +
        SECT_OK
    )
    expect(r.issues.map((i) => [i.rule, i.context, i.paragraph])).toEqual([
      ['font-family', 'Trang bìa', 3]
    ])
  })

  it('tài liệu không có heading/mục lục: không coi gì là trang bìa', async () => {
    const r = await check(p('Dòng ngắn', { rPr: TNR + '<w:sz w:val="40"/>' }) + SECT_OK)
    expect(r.issues.map((i) => [i.rule, i.context])).toEqual([
      ['font-size', 'Thân bài'],
      ['line-spacing', 'Thân bài']
    ])
  })

  it('dòng ngắn căn giữa ở thân bài được xếp vào chú thích', async () => {
    const r = await check(
      p('CHƯƠNG 1', { style: 'Heading1', rPr: TNR }) +
        p('Nguồn: Tổng cục Thống kê', {
          pPr: '<w:jc w:val="center"/>',
          rPr: TNR + '<w:sz w:val="22"/>'
        }) +
        SECT_OK
    )
    expect(r.issues).toEqual([])
  })

  it('nhiều section cùng lỗi lề: gộp thành một dòng', async () => {
    const bad = '<w:pgMar w:top="1418" w:bottom="1418" w:left="1814" w:right="1134"/>'
    const r = await check(
      `<w:p><w:pPr><w:sectPr>${bad}</w:sectPr></w:pPr></w:p>` +
        `<w:p><w:pPr><w:sectPr>${bad}</w:sectPr></w:pPr></w:p>` +
        p(LONG, { style: 'BaoCao' }) +
        SECT_OK
    )
    expect(r.issues).toEqual([
      expect.objectContaining({
        rule: 'margin',
        excerpt: 'Phần (section) 1, 2 / 3',
        actual: 'trên 2,5 cm, dưới 2,5 cm, trái 3,2 cm'
      })
    ])
  })
})

describe('checkFormat với mẫu riêng từng loại đoạn', () => {
  const custom: TemplateSpec = {
    body: {
      ...EMPTY_CATEGORY,
      fontFamily: 'Arial',
      fontSizePt: { min: 12, max: 12 },
      lineSpacing: { rule: 'multiple', min: 1, max: 1 }
    },
    headings: [
      {
        ...EMPTY_CATEGORY,
        fontFamily: 'Arial',
        fontSizePt: { min: 16, max: 16 },
        bold: true,
        alignment: 'center'
      },
      { ...EMPTY_CATEGORY },
      { ...EMPTY_CATEGORY },
      { ...EMPTY_CATEGORY }
    ],
    caption: { ...EMPTY_CATEGORY, alignment: 'center' },
    marginsCm: null,
    checkHeadingOrder: false
  }
  const ARIAL = '<w:rFonts w:ascii="Arial"/>'

  it('heading được so với thông số heading riêng (căn giữa, đậm, 16 pt)', async () => {
    const r = await check(
      p('CHƯƠNG 1', {
        style: 'Heading1',
        pPr: '<w:jc w:val="left"/>',
        rPr: ARIAL + '<w:b w:val="0"/><w:sz w:val="28"/>'
      }) +
        p('1.1 Không kiểm tra', { style: 'Heading2' }) +
        p(LONG, { pPr: '<w:spacing w:line="240"/>', rPr: ARIAL + '<w:sz w:val="24"/>' }),
      custom
    )
    expect(r.issues.map((i) => [i.rule, i.context, i.actual, i.expected])).toEqual([
      ['font-size', 'Heading 1', '14 pt', '16 pt'],
      ['bold', 'Heading 1', 'Không đậm', 'In đậm'],
      ['alignment', 'Heading 1', 'Căn trái', 'Căn giữa']
    ])
  })

  it('giá trị null = không kiểm tra; marginsCm null = bỏ qua lề', async () => {
    const r = await check(
      p(LONG, { pPr: '<w:spacing w:line="240"/>', rPr: ARIAL + '<w:sz w:val="24"/>' }) +
        '<w:sectPr><w:pgMar w:top="100" w:bottom="100" w:left="100" w:right="100"/></w:sectPr>',
      custom
    )
    expect(r.issues).toEqual([])
  })

  it('chú thích được so với thông số chú thích', async () => {
    const r = await check(
      p('Hình 2.1. Kiến trúc', { pPr: '<w:jc w:val="left"/>', rPr: ARIAL }),
      custom
    )
    expect(r.issues).toEqual([
      expect.objectContaining({ rule: 'alignment', context: 'Chú thích', expected: 'Căn giữa' })
    ])
  })
})
