import { describe, expect, it } from 'vitest'
import { checkFormat } from '../../src/main/services/format/check'
import { loadDocx } from '../../src/main/services/format/docx-model'
import { learnTemplate } from '../../src/main/services/format/learn'
import { buildDocx, LONG, p, SECT_OK } from './docx-builder'

const TNR14B = '<w:rFonts w:ascii="Times New Roman"/><w:sz w:val="28"/><w:b/>'

async function learn(body: string) {
  return learnTemplate(await loadDocx(await buildDocx(body)), 'mau.docx')
}

describe('learnTemplate', () => {
  it('học thông số thân bài, heading, chú thích, lề từ file mẫu', async () => {
    const { spec, learned } = await learn(
      p('CHƯƠNG 1', { style: 'Heading1', pPr: '<w:jc w:val="center"/>', rPr: TNR14B }) +
        p('1.1 Mở đầu', { style: 'Heading2', rPr: '<w:rFonts w:ascii="Times New Roman"/><w:b/>' }) +
        p(LONG, { style: 'BaoCao' }) +
        p(LONG + ' Đoạn hai.', { style: 'BaoCao' }) +
        p(LONG + ' Đoạn ba.', { style: 'BaoCao' }) +
        p('Hình 1.1. Sơ đồ', { style: 'Caption' }) +
        SECT_OK
    )

    expect(spec.body).toEqual({
      fontFamily: 'Times New Roman',
      fontSizePt: { min: 13, max: 13 },
      bold: null,
      lineSpacing: { rule: 'multiple', min: 1.5, max: 1.5 },
      spaceBeforePt: { min: 0, max: 0 },
      spaceAfterPt: { min: 6, max: 6 },
      alignment: 'justify',
      firstLineIndentCm: { min: 1, max: 1 }
    })
    expect(spec.headings[0]).toMatchObject({
      fontFamily: 'Times New Roman',
      fontSizePt: { min: 14, max: 14 },
      bold: true,
      alignment: 'center'
    })
    expect(spec.headings[1]).toMatchObject({ bold: true, fontSizePt: { min: 14, max: 14 } })
    expect(spec.headings[2].fontFamily).toBeNull()
    expect(spec.caption).toMatchObject({ alignment: 'center', fontSizePt: { min: 11, max: 11 } })
    expect(spec.marginsCm).toEqual({ top: 2, bottom: 2, left: 3, right: 2 })
    expect(learned).toEqual({
      sourceName: 'mau.docx',
      bodyParagraphs: 3,
      headingParagraphs: [1, 1, 0, 0],
      captionParagraphs: 1,
      warnings: []
    })
  })

  it('tài liệu làm đúng theo mẫu thì kiểm tra theo mẫu học được: 0 lỗi', async () => {
    const mau =
      p('CHƯƠNG 1', { style: 'Heading1', pPr: '<w:jc w:val="center"/>', rPr: TNR14B }) +
      p(LONG, { style: 'BaoCao' }) +
      p(LONG, { style: 'BaoCao' }) +
      p(LONG, { style: 'BaoCao' }) +
      SECT_OK
    const { spec } = await learn(mau)
    const bai =
      p('CHƯƠNG 2. KHÁC NỘI DUNG', {
        style: 'Heading1',
        pPr: '<w:jc w:val="center"/>',
        rPr: TNR14B
      }) +
      p(
        'Nội dung hoàn toàn khác nhưng cùng định dạng với mẫu, đủ dài để được kiểm tra căn lề và thụt dòng.',
        {
          style: 'BaoCao'
        }
      ) +
      SECT_OK
    const r = checkFormat(await loadDocx(await buildDocx(bai)), spec)
    expect(r.issues).toEqual([])
  })

  it('lấy giá trị phổ biến nhất (theo độ dài chữ) và cảnh báo khi không thống nhất', async () => {
    const { spec, learned } = await learn(
      p(LONG, { style: 'BaoCao' }) +
        p(LONG, { style: 'BaoCao', rPr: '<w:sz w:val="24"/>' }) +
        p(LONG + LONG, { style: 'BaoCao', rPr: '<w:sz w:val="28"/>' }) +
        SECT_OK
    )
    expect(spec.body.fontSizePt).toEqual({ min: 14, max: 14 })
    expect(learned.warnings.some((w) => w.includes('cỡ chữ'))).toBe(true)
  })

  it('mẫu không có heading / ít thân bài: cảnh báo, heading không kiểm tra', async () => {
    const { spec, learned } = await learn(p(LONG, { style: 'BaoCao' }) + SECT_OK)
    expect(spec.headings.every((h) => h.fontFamily === null)).toBe(true)
    expect(learned.warnings).toEqual([
      expect.stringContaining('chỉ có 1 đoạn thân bài'),
      expect.stringContaining('Không tìm thấy heading')
    ])
  })

  it('mẫu rỗng: không có thân bài, không có lề', async () => {
    const { spec, learned } = await learn(p(''))
    expect(spec.body.fontFamily).toBeNull()
    expect(spec.marginsCm).toBeNull()
    expect(learned.warnings[0]).toContain('Không tìm thấy đoạn thân bài')
  })
})
