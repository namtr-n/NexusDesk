import { describe, expect, it } from 'vitest'
import {
  EMPTY_PROMPT_FORM,
  formToFields,
  isFormDirty,
  promptToForm
} from '../../src/renderer/src/lib/prompt-form'
import type { Prompt } from '../../src/shared/prompts'

const prompt: Prompt = {
  id: 1,
  title: 'Dàn ý slide',
  content: 'Soạn slide',
  category: 'Bảo vệ',
  tags: ['slide', 'thuyết trình'],
  projectId: 3,
  useCount: 0,
  lastUsedAt: null,
  createdAt: 1,
  updatedAt: 1,
  versionCount: 1
}

describe('prompt-form', () => {
  it('đổi qua lại giữa prompt và form', () => {
    const f = promptToForm(prompt)
    expect(f).toMatchObject({ tagsText: 'slide, thuyết trình', project: '3' })
    expect(formToFields(f)).toEqual({
      title: 'Dàn ý slide',
      content: 'Soạn slide',
      category: 'Bảo vệ',
      tags: ['slide', 'thuyết trình'],
      projectId: 3
    })
    expect(formToFields({ ...EMPTY_PROMPT_FORM, title: ' a ' }).projectId).toBeNull()
  })

  it('chỉ coi là "đã sửa" khi nội dung thật sự khác', () => {
    const f = promptToForm(prompt)
    expect(isFormDirty({ ...f, title: 'Dàn ý slide  ', tagsText: 'slide,thuyết trình,' }, f)).toBe(
      false
    )
    expect(isFormDirty({ ...f, content: 'Khác' }, f)).toBe(true)
  })
})
