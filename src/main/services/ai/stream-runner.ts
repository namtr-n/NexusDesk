/**
 * Chạy một yêu cầu stream tới Gemini cho chắc ăn:
 * - Thử lại cùng model khi lỗi tạm thời (quá tải 5xx, mạng, im lặng quá lâu), chờ tăng dần.
 * - Hết lượt thử (hoặc 429 / 404) thì chuyển sang model dự phòng.
 * - Chỉ thử lại khi CHƯA trả chữ nào (tránh lặp nội dung trên giao diện).
 * - Người dùng hủy thì dừng ngay, kể cả đang chờ để thử lại.
 */
import type { AiClient, StreamRequest } from './gemini-client'

export interface RunControl {
  /** Đặt 'user' khi người dùng bấm Hủy */
  reason?: 'user'
  /** Hủy lượt đang chạy (runner tự gán cho từng lượt) */
  abort?: () => void
}

export interface Usage {
  inputTokens: number
  outputTokens: number
}

export interface RunOptions {
  client: AiClient
  /** Model chính đứng đầu, sau đó là các model dự phòng */
  models: string[]
  system: string
  prompt: string
  thinking?: StreamRequest['thinking']
  idleTimeoutMs: number
  /** Thời gian chờ tối đa cho đoạn chữ ĐẦU TIÊN (mặc định = idleTimeoutMs) */
  firstChunkTimeoutMs?: number
  /** Thời gian chờ trước mỗi lần thử lại cùng model, ví dụ [2000, 4000] = thử thêm 2 lần */
  retryDelaysMs: number[]
  control: RunControl
  onChunk?: (text: string) => void
  /** Ghi log mỗi lượt thất bại */
  onAttemptFailed?: (model: string, attempt: number, error: unknown) => void
}

export interface RunResult {
  model: string
  content: string
  usage: Usage
}

export type RunErrorKind = 'cancelled' | 'idle' | 'blocked' | 'empty' | 'api'

export class RunError extends Error {
  constructor(
    readonly kind: RunErrorKind,
    readonly model: string,
    readonly usage: Usage,
    readonly original?: unknown,
    readonly triedModels: string[] = []
  ) {
    super(kind)
    this.name = 'RunError'
  }
}

/** Lỗi nào nên thử lại cùng model / chuyển model khác */
export function classify(err: unknown): { retrySame: boolean; tryOther: boolean } {
  if (err instanceof RunError) {
    // Model im lặng (thường do quá tải): chuyển model khác ngay thay vì chờ tiếp
    if (err.kind === 'idle') return { retrySame: false, tryOther: true }
    return { retrySame: false, tryOther: false }
  }
  const e = err as { status?: unknown; message?: unknown }
  const status = typeof e?.status === 'number' ? e.status : undefined
  const message = typeof e?.message === 'string' ? e.message : String(err)
  if (status === 429) return { retrySame: false, tryOther: true }
  if (status === 404) return { retrySame: false, tryOther: true }
  if (status !== undefined && status >= 500) return { retrySame: true, tryOther: true }
  if (
    status === undefined &&
    /fetch failed|ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|network|socket/i.test(message)
  ) {
    return { retrySame: true, tryOther: false }
  }
  return { retrySame: false, tryOther: false }
}

/** Lỗi 400 do model không hỗ trợ cấu hình "suy nghĩ" (thinking level) */
export function isThinkingUnsupported(err: unknown): boolean {
  const e = err as { status?: unknown; message?: unknown }
  return e?.status === 400 && typeof e.message === 'string' && /thinking/i.test(e.message)
}

function sleep(ms: number, control: RunControl): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    control.abort = () => {
      clearTimeout(timer)
      resolve()
    }
  })
}

export async function runWithFallback(o: RunOptions): Promise<RunResult> {
  const tried: string[] = []
  let lastError: unknown = undefined
  let usage: Usage = { inputTokens: 0, outputTokens: 0 }

  models: for (const model of o.models) {
    tried.push(model)
    // Model không hỗ trợ mức suy nghĩ đã chọn → gửi lại không kèm cấu hình này
    let thinking = o.thinking
    for (let attempt = 0; ; attempt++) {
      if (o.control.reason === 'user')
        throw new RunError('cancelled', model, usage, undefined, tried)

      const controller = new AbortController()
      let idle = false
      let timer: ReturnType<typeof setTimeout> | undefined
      let gotChunk = false
      const armIdle = (): void => {
        clearTimeout(timer)
        const ms = gotChunk ? o.idleTimeoutMs : (o.firstChunkTimeoutMs ?? o.idleTimeoutMs)
        timer = setTimeout(() => {
          idle = true
          controller.abort()
        }, ms)
      }
      o.control.abort = () => controller.abort()

      let content = ''
      try {
        armIdle()
        for await (const chunk of o.client.stream({
          model,
          system: o.system,
          prompt: o.prompt,
          signal: controller.signal,
          thinking
        })) {
          if (controller.signal.aborted) break
          gotChunk = true
          armIdle()
          if (chunk.blocked) throw new RunError('blocked', model, usage, chunk.blocked, tried)
          if (chunk.usage) usage = chunk.usage
          if (chunk.text) {
            content += chunk.text
            o.onChunk?.(chunk.text)
          }
        }
        if (o.control.reason === 'user')
          throw new RunError('cancelled', model, usage, undefined, tried)
        if (idle) throw new RunError('idle', model, usage, undefined, tried)
        if (!content.trim()) throw new RunError('empty', model, usage, undefined, tried)
        return { model, content, usage }
      } catch (err) {
        if (o.control.reason === 'user') throw new RunError('cancelled', model, usage, err, tried)
        const error =
          idle && !(err instanceof RunError) ? new RunError('idle', model, usage, err, tried) : err
        o.onAttemptFailed?.(model, attempt, error)
        // Đã hiện chữ lên giao diện thì không thử lại (tránh lặp nội dung)
        if (content) throw error
        if (thinking && isThinkingUnsupported(error)) {
          thinking = undefined
          attempt-- // không tính là một lượt thử
          continue
        }
        lastError = error
        const { retrySame, tryOther } = classify(error)
        if (retrySame && attempt < o.retryDelaysMs.length) {
          await sleep(o.retryDelaysMs[attempt], o.control)
          continue
        }
        if (!tryOther) throw error
        continue models // chuyển sang model dự phòng tiếp theo
      } finally {
        clearTimeout(timer)
      }
    }
  }
  if (lastError instanceof RunError) {
    throw new RunError(lastError.kind, lastError.model, usage, lastError.original, tried)
  }
  throw Object.assign(lastError instanceof Error ? lastError : new Error(String(lastError)), {
    triedModels: tried
  })
}
