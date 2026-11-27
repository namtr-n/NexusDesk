import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { DEFAULT_TEMPLATE_SPEC, EMPTY_CATEGORY, type TemplateSpec } from '@shared/format'
import { checkFormat } from '../../src/main/services/format/check'
import { loadDocx } from '../../src/main/services/format/docx-model'
import { fixDocx } from '../../src/main/services/format/fix'
import { kids, parseXml, path, tagOf, type XNode } from '../../src/main/services/format/xml'
import { buildDocx, LONG, p, SECT_OK } from './docx-builder'

async function fixAndCheck(body: string, spec: TemplateSpec = DEFAULT_TEMPLATE_SPEC) {
  const before = await buildDocx(body)
  const { data, summary } = await fixDocx(before, spec)
  const model = await loadDocx(data)
  return {
    data,
    summary,
    model,
    after: checkFormat(model, spec),
    before: checkFormat(await loadDocx(before), spec)
  }
}

async function documentXml(data: Buffer): Promise<XNode[]> {
  const zip = await JSZip.loadAsync(data)
  return parseXml(await zip.file('word/document.xml')!.async('string'))
}

const tags = (n: XNode | undefined): string[] => (n ? kids(n).map((k) => tagOf(k)!) : [])

describe('fixDocx', () => {
  it('tài liệu để mặc định Word: sửa xong kiểm tra lại không còn lỗi, chữ giữ nguyên', async () => {
    const r = await fixAndCheck(
      p('CHƯƠNG 1. TỔNG QUAN', { style: 'Heading1' }) +
        p(LONG) +
        p('Hình 1.1. Sơ đồ', { style: 'Caption' }) +
        '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:bottom="1440" w:left="1440" w:right="1440" w:header="708"/></w:sectPr>'
    )
    expect(r.before.issues.length).toBeGreaterThan(5)
    expect(r.after.issues).toEqual([])
    expect(r.model.paragraphs.map((x) => x.text)).toEqual([
      'CHƯƠNG 1. TỔNG QUAN',
      LONG,
      'Hình 1.1. Sơ đồ'
    ])
    // Style Caption trong file thử vốn đã đúng (Times New Roman) nên chỉ 2 đoạn phải sửa
    expect(r.summary).toMatchObject({ paragraphsChanged: 2, sectionsChanged: 1 })
  })

  it('chèn phần tử đúng thứ tự chuẩn OOXML', async () => {
    const { data } = await fixAndCheck(
      '<w:p><w:pPr><w:keepNext/><w:jc w:val="left"/></w:pPr><w:r><w:rPr><w:i/><w:color w:val="FF0000"/></w:rPr>' +
        `<w:t>${LONG}</w:t></w:r></w:p>` +
        SECT_OK
    )
    const para = path(await documentXml(data), 'w:document', 'w:body', 'w:p')
    expect(tags(path(para, 'w:pPr'))).toEqual(['w:keepNext', 'w:spacing', 'w:ind', 'w:jc'])
    expect(tags(path(para, 'w:r', 'w:rPr'))).toEqual([
      'w:rFonts',
      'w:i',
      'w:color',
      'w:sz',
      'w:szCs'
    ])
    expect(tags(path(para, 'w:r'))[0]).toBe('w:rPr')
  })

  it('giữ nguyên ký tự đặc biệt, khoảng trắng, đoạn có hình (không chữ)', async () => {
    const special = 'R&D <test> "trích dẫn" &amp; nữa'
    const escaped = special.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const { model } = await fixAndCheck(
      `<w:p><w:r><w:t xml:space="preserve">  ${escaped}  </w:t></w:r></w:p>` +
        '<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"/></w:drawing></w:r></w:p>' +
        SECT_OK
    )
    expect(model.paragraphs[0].text).toBe(`  ${special}  `)
    expect(model.paragraphs).toHaveLength(2)
  })

  it('bảng và trang bìa: chỉ sửa font, không đổi cỡ chữ', async () => {
    const r = await fixAndCheck(
      p('TRƯỜNG ĐẠI HỌC', { rPr: '<w:sz w:val="32"/>' }) +
        p('CHƯƠNG 1', { style: 'Heading1', rPr: '<w:rFonts w:ascii="Times New Roman"/>' }) +
        '<w:tbl><w:tr><w:tc>' +
        p('Ô bảng', { rPr: '<w:sz w:val="20"/>' }) +
        '</w:tc></w:tr></w:tbl>' +
        SECT_OK
    )
    expect(r.after.issues).toEqual([])
    const [cover, , cell] = r.model.paragraphs
    expect(cover.runs[0]).toMatchObject({ font: 'Times New Roman', sizePt: 16 })
    expect(cell.runs[0]).toMatchObject({ font: 'Times New Roman', sizePt: 10 })
  })

  it('danh sách có thụt treo: không đổi thụt dòng', async () => {
    const r = await fixAndCheck(
      p(LONG, {
        style: 'BaoCao',
        pPr: '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:ind w:left="720" w:hanging="360"/>'
      }) + SECT_OK
    )
    expect(r.model.paragraphs[0].props).toMatchObject({ hanging: 360 })
    expect(r.summary.paragraphsChanged).toBe(0)
  })

  it('mẫu riêng: heading căn giữa, in đậm, đúng cỡ; khoảng giá trị thì đưa về điểm gần nhất', async () => {
    const spec: TemplateSpec = {
      ...DEFAULT_TEMPLATE_SPEC,
      headings: [
        {
          ...EMPTY_CATEGORY,
          fontFamily: 'Arial',
          fontSizePt: { min: 14, max: 16 },
          bold: true,
          alignment: 'center'
        },
        ...DEFAULT_TEMPLATE_SPEC.headings.slice(1)
      ]
    }
    const r = await fixAndCheck(
      p('CHƯƠNG 1', {
        style: 'Heading1',
        pPr: '<w:jc w:val="left"/>',
        rPr: '<w:b w:val="0"/><w:sz w:val="24"/>'
      }) +
        p(LONG, { style: 'BaoCao' }) +
        SECT_OK,
      spec
    )
    expect(r.after.issues).toEqual([])
    expect(r.model.paragraphs[0].runs[0]).toMatchObject({ font: 'Arial', sizePt: 14, bold: true })
    expect(r.model.paragraphs[0].props.jc).toBe('center')
  })

  it('tài liệu đã đúng chuẩn: không đổi gì', async () => {
    const r = await fixAndCheck(
      p('CHƯƠNG 1', { style: 'Heading1', rPr: '<w:rFonts w:ascii="Times New Roman"/>' }) +
        p(LONG, { style: 'BaoCao' }) +
        SECT_OK
    )
    expect(r.summary).toEqual({ paragraphsChanged: 0, runsChanged: 0, sectionsChanged: 0 })
  })

  it('lỗi không tự sửa được (thứ tự heading) vẫn còn sau khi sửa', async () => {
    const tnr = '<w:rFonts w:ascii="Times New Roman"/>'
    const r = await fixAndCheck(
      p('Chương 1', { style: 'Heading1', rPr: tnr }) +
        p('1.1.1', { style: 'Heading3', rPr: tnr }) +
        SECT_OK
    )
    expect(r.after.issues.map((i) => i.rule)).toEqual(['heading-order'])
  })
})
