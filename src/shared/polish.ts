/** "Hoàn thiện báo cáo": sửa định dạng theo mẫu + AI trau chuốt câu chữ (Track Changes). */
import { z } from 'zod'

export const POLISH_MODES = ['spelling', 'style'] as const
export type PolishMode = (typeof POLISH_MODES)[number]

export const POLISH_MODE_INFO: Record<PolishMode, { label: string; description: string }> = {
  spelling: {
    label: 'Chính tả & ngữ pháp',
    description: 'Chỉ sửa lỗi chính tả, dấu thanh, lỗi gõ, ngữ pháp, dấu câu. Giữ nguyên văn phong.'
  },
  style: {
    label: 'Chính tả + văn phong',
    description:
      'Sửa lỗi như trên, và chỉnh câu chữ cho trang trọng, học thuật hơn: bỏ từ thừa, lặp từ, văn nói.'
  }
}

const id = z.number().int().positive()

export const polishRunSchema = z.object({
  documentId: id,
  mode: z.enum(POLISH_MODES),
  /** Có sửa định dạng theo mẫu trước không */
  fixFormat: z.boolean(),
  templateId: z.union([id, z.null()]).optional(),
  requestId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/)
})
export type PolishRunInput = z.input<typeof polishRunSchema>

export interface PolishChange {
  /** Số thứ tự đoạn (như trong kết quả kiểm tra định dạng) */
  paragraph: number
  find: string
  replace: string
  reason: string
}

export interface PolishResult {
  path: string
  newDocumentId: number | null
  model: string
  /** null nếu không sửa định dạng */
  format: { issuesBefore: number; issuesAfter: number; paragraphsChanged: number } | null
  paragraphsReviewed: number
  editsApplied: number
  editsSkipped: number
  /** Danh sách sửa đổi đã ghi bằng Track Changes (tối đa 300 dòng đầu) */
  changes: PolishChange[]
}

export interface PolishOutcome {
  cancelled: boolean
  result: PolishResult | null
}

/** Sự kiện tiến độ main → giao diện */
export interface PolishProgressEvent {
  requestId: string
  stage: 'format' | 'ai' | 'save'
  done: number
  total: number
}
