/** Kiểu dữ liệu và schema cho Thư viện prompt — dùng chung main và giao diện. */
import { z } from 'zod'

export const PROMPT_TITLE_MAX = 120
export const PROMPT_CONTENT_MAX = 20_000
export const PROMPT_CATEGORY_MAX = 40
export const PROMPT_TAG_MAX = 30
export const PROMPT_TAGS_MAX = 10

const id = z.number('Mã không hợp lệ').int('Mã không hợp lệ').positive('Mã không hợp lệ')

export const promptTitleSchema = z
  .string('Tiêu đề phải là chữ')
  .trim()
  .min(1, 'Tiêu đề không được để trống')
  .max(PROMPT_TITLE_MAX, `Tiêu đề tối đa ${PROMPT_TITLE_MAX} ký tự`)

export const promptContentSchema = z
  .string('Nội dung phải là chữ')
  .trim()
  .min(1, 'Nội dung prompt không được để trống')
  .max(PROMPT_CONTENT_MAX, `Nội dung tối đa ${PROMPT_CONTENT_MAX.toLocaleString('vi-VN')} ký tự`)

export const promptCategorySchema = z
  .string('Danh mục phải là chữ')
  .trim()
  .max(PROMPT_CATEGORY_MAX, `Danh mục tối đa ${PROMPT_CATEGORY_MAX} ký tự`)
  .default('')

/** Chuẩn hóa danh sách tag: bỏ khoảng trắng, dấu #, trùng lặp (không phân biệt hoa thường). */
export function normalizeTags(tags: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of tags) {
    const t = raw.trim().replace(/^#+/, '').replace(/\s+/g, ' ')
    const key = t.toLocaleLowerCase('vi')
    if (!t || seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}

/** Tách chuỗi "tag1, tag2" người dùng gõ thành mảng tag */
export function parseTagInput(text: string): string[] {
  return normalizeTags(text.split(/[,;\n]/))
}

export const promptTagsSchema = z
  .array(z.string().max(PROMPT_TAG_MAX, `Mỗi tag tối đa ${PROMPT_TAG_MAX} ký tự`))
  .transform(normalizeTags)
  .pipe(z.array(z.string()).max(PROMPT_TAGS_MAX, `Tối đa ${PROMPT_TAGS_MAX} tag`))
  .default([])

export const promptFieldsSchema = z.object({
  title: promptTitleSchema,
  content: promptContentSchema,
  category: promptCategorySchema,
  tags: promptTagsSchema,
  projectId: z.union([id, z.null()]).default(null)
})

export const promptCreateSchema = promptFieldsSchema
export const promptUpdateSchema = promptFieldsSchema.extend({ id })
export const promptIdSchema = z.object({ id })
export const promptListSchema = z
  .object({
    /** Từ khóa tìm kiếm (tiêu đề, nội dung, tag, danh mục; gõ không dấu vẫn tìm được) */
    query: z.string().max(200).default(''),
    category: z.string().max(PROMPT_CATEGORY_MAX).optional(),
    /** bỏ trống = tất cả; null = chưa gắn dự án; số = theo dự án */
    projectId: z.union([id, z.null()]).optional()
  })
  .default({ query: '' })
export const promptRestoreSchema = z.object({ id, versionId: id })

export type PromptCreateInput = z.input<typeof promptCreateSchema>
export type PromptUpdateInput = z.input<typeof promptUpdateSchema>
export type PromptIdInput = z.input<typeof promptIdSchema>
export type PromptListInput = z.input<typeof promptListSchema>
export type PromptRestoreInput = z.input<typeof promptRestoreSchema>
export type PromptFields = z.output<typeof promptFieldsSchema>

export interface PromptSummary {
  id: number
  title: string
  category: string
  tags: string[]
  projectId: number | null
  /** Vài dòng đầu của nội dung */
  preview: string
  useCount: number
  lastUsedAt: number | null
  updatedAt: number
}

export interface Prompt extends Omit<PromptSummary, 'preview'> {
  content: string
  createdAt: number
  versionCount: number
}

export interface PromptVersion {
  id: number
  promptId: number
  title: string
  content: string
  createdAt: number
}
