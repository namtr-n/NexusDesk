import { describe, expect, it } from 'vitest'
import { DEFAULT_TEMPLATE_SPEC, EMPTY_CATEGORY, type TemplateSpec } from '@shared/format'
import { formToSpec, specToForm } from '../../src/renderer/src/lib/template-form'

describe('template-form', () => {
  it('chuyển qua lại không mất dữ liệu (mẫu mặc định)', () => {
    const form = specToForm('X', DEFAULT_TEMPLATE_SPEC)
    expect(form.categories[0].value).toMatchObject({
      font: 'Times New Roman',
      size: '13',
      line: '1,5',
      before: '0-12',
      align: 'justify',
      indent: '0,9-1,3'
    })
    expect(formToSpec(form)).toEqual({ spec: DEFAULT_TEMPLATE_SPEC })
  })

  it('giãn dòng chính xác / tối thiểu, thụt treo, tắt lề', () => {
    const spec: TemplateSpec = {
      ...DEFAULT_TEMPLATE_SPEC,
      body: {
        ...EMPTY_CATEGORY,
        lineSpacing: { rule: 'exact', min: 18, max: 18 },
        firstLineIndentCm: { min: -0.5, max: -0.5 }
      },
      caption: { ...EMPTY_CATEGORY, lineSpacing: { rule: 'atLeast', min: 12, max: 12 } },
      marginsCm: null
    }
    const form = specToForm('X', spec)
    expect(form.categories[0].value.line).toBe('18 pt')
    expect(form.categories[0].value.indent).toBe('-0,5')
    expect(form.categories.at(-1)!.value.line).toBe('≥12 pt')
    expect(form.checkMargins).toBe(false)
    expect(formToSpec(form)).toEqual({ spec })
  })

  it('báo lỗi dễ hiểu khi nhập sai', () => {
    const form = specToForm('X', DEFAULT_TEMPLATE_SPEC)
    form.categories[1].value.size = 'mười bốn'
    expect(formToSpec(form)).toEqual({
      error: 'Heading 1 – Cỡ chữ: "mười bốn" không hợp lệ (ví dụ: 13 hoặc 0-12)'
    })
    form.categories[1].value.size = '16-14'
    expect(formToSpec(form)).toMatchObject({ error: expect.stringContaining('nhỏ hơn') })
    form.categories[1].value.size = '14'
    form.margins.left = 'abc'
    expect(formToSpec(form)).toMatchObject({ error: expect.stringContaining('Lề trái') })
  })
})
