import type { z } from 'zod'
import type { Result } from '@shared/ipc-contract'
import { UserError } from '../errors'

export const GENERIC_ERROR =
  'Đã xảy ra lỗi không mong muốn. Chi tiết đã được ghi vào nhật ký (log).'

export interface ErrorLogger {
  error(...args: unknown[]): void
  warn?(...args: unknown[]): void
}

/**
 * Bọc một hàm nghiệp vụ thành IPC handler an toàn:
 * 1. Kiểm tra dữ liệu đầu vào bằng schema zod. Sai thì trả lỗi, không chạy tiếp.
 * 2. Chạy hàm nghiệp vụ.
 * 3. Bắt mọi lỗi: lỗi dành cho người dùng thì trả nguyên thông báo,
 *    lỗi khác thì ghi log và trả thông báo chung (không lộ chi tiết bên trong).
 */
/** Thông tin về nơi gọi: dùng để gửi sự kiện (ví dụ stream AI) ngược lại đúng cửa sổ. */
export interface HandlerContext {
  send(channel: string, payload: unknown): void
}

const NO_CONTEXT: HandlerContext = { send: () => undefined }

export function createHandler<S extends z.ZodType, R>(
  channel: string,
  schema: S,
  fn: (input: z.output<S>, ctx: HandlerContext) => R | Promise<R>,
  logger: ErrorLogger
): (raw: unknown, ctx?: HandlerContext) => Promise<Result<Awaited<R>>> {
  return async (raw, ctx = NO_CONTEXT) => {
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' }
    }
    try {
      return { ok: true, data: await fn(parsed.data, ctx) }
    } catch (err) {
      if (err instanceof UserError) return { ok: false, error: err.message }
      logger.error(`[ipc] ${channel} thất bại`, err)
      return { ok: false, error: GENERIC_ERROR }
    }
  }
}
