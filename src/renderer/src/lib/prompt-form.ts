import { parseTagInput, type Prompt, type PromptFields } from '@shared/prompts'

/** Trạng thái form sửa prompt (dạng chuỗi để gắn thẳng vào ô nhập) */
export interface PromptForm {
  title: string
  content: string
  category: string
  /** Tag cách nhau bằng dấu phẩy */
  tagsText: string
  /** 'none' hoặc id dự án dạng chuỗi */
  project: string
}

export const EMPTY_PROMPT_FORM: PromptForm = {
  title: '',
  content: '',
  category: '',
  tagsText: '',
  project: 'none'
}

export function promptToForm(p: Prompt): PromptForm {
  return {
    title: p.title,
    content: p.content,
    category: p.category,
    tagsText: p.tags.join(', '),
    project: p.projectId === null ? 'none' : String(p.projectId)
  }
}

export function formToFields(f: PromptForm): PromptFields {
  return {
    title: f.title.trim(),
    content: f.content.trim(),
    category: f.category.trim(),
    tags: parseTagInput(f.tagsText),
    projectId: f.project === 'none' ? null : Number(f.project)
  }
}

/** Form có khác dữ liệu đã lưu không (so sánh sau khi chuẩn hóa, gõ thêm khoảng trắng không tính) */
export function isFormDirty(f: PromptForm, saved: PromptForm): boolean {
  return JSON.stringify(formToFields(f)) !== JSON.stringify(formToFields(saved))
}
