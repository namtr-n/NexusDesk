import { describe, expect, it } from 'vitest'
import { loadDocx } from '../../src/main/services/format/docx-model'
import { buildDocx, LONG, p, SECT_OK } from './docx-builder'
import { makeDocx } from './fixtures'

describe('loadDocx: tính định dạng kế thừa', () => {
  it('không style: lấy từ docDefaults + font theme (Calibri 11, giãn 1,08)', async () => {
    const m = await loadDocx(await buildDocx(p('Xin chào')))
    const para = m.paragraphs[0]
    expect(para.runs[0]).toMatchObject({ font: 'Calibri', sizePt: 11 })
    expect(para.props).toMatchObject({ line: 259, after: 160 })
    expect(para.styleId).toBe('Normal')
  })

  it('style tự tạo kế thừa Normal: Times New Roman 13, 1,5 dòng, căn đều, thụt 1 cm', async () => {
    const m = await loadDocx(await buildDocx(p(LONG, { style: 'BaoCao' })))
    const para = m.paragraphs[0]
    expect(para.runs[0]).toMatchObject({ font: 'Times New Roman', sizePt: 13 })
    expect(para.props).toMatchObject({
      line: 360,
      jc: 'both',
      firstLine: 567,
      before: 0,
      after: 120
    })
  })

  it('định dạng trực tiếp trên đoạn đè style', async () => {
    const m = await loadDocx(
      await buildDocx(
        p(LONG, { style: 'BaoCao', pPr: '<w:spacing w:line="240"/><w:jc w:val="left"/>' })
      )
    )
    expect(m.paragraphs[0].props).toMatchObject({ line: 240, jc: 'left', after: 120 })
  })

  it('thụt treo (hanging) đè thụt dòng đầu của style', async () => {
    const m = await loadDocx(
      await buildDocx(p(LONG, { style: 'BaoCao', pPr: '<w:ind w:hanging="360"/>' }))
    )
    expect(m.paragraphs[0].props.firstLine).toBeUndefined()
    expect(m.paragraphs[0].props.hanging).toBe(360)
  })

  it('định dạng trực tiếp trên chữ và style ký tự đè style đoạn', async () => {
    const body =
      '<w:p><w:pPr><w:pStyle w:val="BaoCao"/></w:pPr>' +
      '<w:r><w:t>A</w:t></w:r>' +
      '<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="24"/></w:rPr><w:t>B</w:t></w:r>' +
      '<w:r><w:rPr><w:rStyle w:val="NhanManh"/></w:rPr><w:t>C</w:t></w:r>' +
      '<w:r><w:rPr><w:rFonts w:asciiTheme="minorHAnsi"/></w:rPr><w:t>D</w:t></w:r>' +
      '</w:p>'
    const runs = (await loadDocx(await buildDocx(body))).paragraphs[0].runs
    expect(runs.map((r) => [r.text, r.font, r.sizePt])).toEqual([
      ['A', 'Times New Roman', 13],
      ['B', 'Arial', 12],
      ['C', 'Arial', 13],
      ['D', 'Calibri', 13]
    ])
  })

  it('heading: nhận cấp từ outlineLvl theo chuỗi basedOn, font theme major', async () => {
    const m = await loadDocx(
      await buildDocx(p('Chương 1', { style: 'Heading1' }) + p('1.1', { style: 'Heading2' }))
    )
    expect(m.paragraphs.map((x) => x.headingLevel)).toEqual([1, 2])
    expect(m.paragraphs[0].runs[0]).toMatchObject({ font: 'Calibri Light', sizePt: 16 })
  })

  it('đánh số đoạn chỉ tính đoạn có chữ; nhận biết bảng, mục lục; bỏ chữ đã xóa', async () => {
    const body =
      p('Một') +
      p('') +
      '<w:tbl><w:tr><w:tc>' +
      p('Ô bảng') +
      '</w:tc></w:tr></w:tbl>' +
      '<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Table of Contents"/></w:docPartObj></w:sdtPr>' +
      '<w:sdtContent>' +
      p('Mục lục dòng 1') +
      '</w:sdtContent></w:sdt>' +
      '<w:p><w:r><w:t>Giữ</w:t></w:r><w:del><w:r><w:delText>Xóa</w:delText></w:r></w:del>' +
      '<w:hyperlink><w:r><w:t> link</w:t></w:r></w:hyperlink></w:p>'
    const ps = (await loadDocx(await buildDocx(body))).paragraphs
    expect(ps.map((x) => [x.number, x.text, x.inTable, x.inToc])).toEqual([
      [1, 'Một', false, false],
      [0, '', false, false],
      [2, 'Ô bảng', true, false],
      [3, 'Mục lục dòng 1', false, true],
      [4, 'Giữ link', false, false]
    ])
  })

  it('đọc lề trang của từng section', async () => {
    const body =
      `<w:p><w:pPr><w:sectPr><w:pgMar w:top="1440" w:bottom="1440" w:left="1440" w:right="1440"/></w:sectPr></w:pPr></w:p>` +
      p('x') +
      SECT_OK
    const m = await loadDocx(await buildDocx(body))
    expect(m.sections.map((s) => s.margins)).toEqual([
      { top: 1440, bottom: 1440, left: 1440, right: 1440 },
      { top: 1134, bottom: 1134, left: 1701, right: 1134 }
    ])
  })

  it('thiếu styles.xml và theme vẫn đọc được', async () => {
    const m = await loadDocx(await buildDocx(p('x'), { styles: null, theme: null }))
    expect(m.paragraphs[0].runs[0]).toMatchObject({ font: undefined, sizePt: undefined })
  })

  it('file không phải DOCX: báo lỗi', async () => {
    await expect(loadDocx(Buffer.from('rác'))).rejects.toThrow()
  })

  it('đọc được DOCX do thư viện docx sinh ra (cấu trúc thật)', async () => {
    const m = await loadDocx(await makeDocx(['Đoạn một', 'Đoạn hai']))
    expect(m.paragraphs.filter((x) => x.number > 0).map((x) => x.text)).toEqual([
      'Đoạn một',
      'Đoạn hai'
    ])
  })
})
