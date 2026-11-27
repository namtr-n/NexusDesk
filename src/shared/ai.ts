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

/**
 * Làm sạch key người dùng dán vào: bỏ khoảng trắng / xuống dòng, dấu ngoặc bao quanh,
 * tiền tố kiểu `GEMINI_API_KEY=` hay `Bearer `. Không ép định dạng cụ thể vì Google có thể
 * đổi định dạng key — đúng/sai do chính Gemini kiểm tra (nút "Kiểm tra kết nối").
 */
export function cleanApiKey(raw: string): string {
  let k = raw.replace(/\s+/g, '')
  k = k.replace(/^(export)?[A-Z_]*API_?KEY[=:]/i, '')
  k = k.replace(/^Bearer/i, '')
  k = k.replace(/^["'`]+|["'`,;]+$/g, '')
  return k
}

export const apiKeySchema = z
  .string('API key phải là chữ')
  .transform(cleanApiKey)
  .pipe(
    z
      .string()
      .min(20, 'API key quá ngắn — hãy dán đầy đủ key')
      .max(300, 'API key quá dài — có thể đã dán nhầm cả đoạn văn bản')
      .regex(
        /^[\x21-\x7E]+$/,
        'API key có ký tự lạ (chữ có dấu hoặc ký tự đặc biệt). Hãy copy lại key.'
      )
  )

export const modelIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._-]+$/, 'Tên model không hợp lệ')

export interface AiStatus {
  hasKey: boolean
  /** Model cố định đã chọn; null = tự động (thử Flash mới nhất, quá tải thì hạ dần) */
  model: string | null
  /** Chế độ tự động: model vừa chạy tốt gần đây (null nếu chưa gọi lần nào) */
  activeModel: string | null
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

/** Tác vụ của một kết quả phân tích: 3 tác vụ có sẵn hoặc 'custom' = prompt trong thư viện */
export type AiAnalysisTask = AiTask | 'custom'

export interface AiAnalysis {
  id: number
  documentId: number
  task: AiAnalysisTask
  /** task = 'custom': prompt đã dùng (null nếu đã bị xóa khỏi thư viện) */
  promptId: number | null
  promptTitle: string | null
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
