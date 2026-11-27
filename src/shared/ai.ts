/** Kiểu dữ liệu và schema cho phần AI (Gemini) — dùng chung main và giao diện. */
import { z } from 'zod'

export const AI_TASKS = ['overview', 'spelling', 'style'] as const
export type AiTask = (typeof AI_TASKS)[number]

export const AI_TASK_INFO: Record<AiTask, { label: string; description: string }> = {
  overview: {
    label: 'Nhận xét tổng quan',
    description: 'Tóm tắt, đánh giá cấu trúc, điểm mạnh và điểm cần cải thiện.'
  },
  spelling: {
    label: 'Chính tả & ngữ pháp',
    description: 'Liệt kê lỗi chính tả, ngữ pháp, dấu câu kèm cách sửa.'
  },
  style: {
    label: 'Văn phong & mạch lạc',
    description: 'Câu quá dài, lặp từ, văn nói, chuyển ý chưa mạch lạc; gợi ý viết lại.'
  }
}

export const apiKeySchema = z
  .string('API key phải là chữ')
  .trim()
  .min(20, 'API key quá ngắn — hãy dán đầy đủ key')
  .max(200, 'API key quá dài')
  .regex(/^[A-Za-z0-9_-]+$/, 'API key chỉ gồm chữ, số, dấu - và _ (không có khoảng trắng)')

export const modelIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._-]+$/, 'Tên model không hợp lệ')

export interface AiStatus {
  hasKey: boolean
  /** Model đang dùng; null = chưa chọn (sẽ tự chọn bản Flash mới nhất) */
  model: string | null
  encryptionAvailable: boolean
}

export interface AiModelOption {
  id: string
  displayName: string
  inputTokenLimit: number | null
}

export interface AiTestResult {
  model: string
  latencyMs: number
}

export interface AiAnalysis {
  id: number
  documentId: number
  task: AiTask
  model: string
  content: string
  /** Tài liệu dài hơn giới hạn nên chỉ gửi phần đầu */
  truncated: boolean
  createdAt: number
}

/** Sự kiện stream gửi từ main sang giao diện trong lúc AI đang trả lời */
export interface AiChunkEvent {
  requestId: string
  text: string
}
