/**
 * Nghiệp vụ AI: quản lý key/model, phân tích tài liệu bằng Gemini (stream từng đoạn chữ),
 * hủy giữa chừng, đổi lỗi API thành thông báo tiếng Việt, ghi thống kê mỗi lượt gọi.
 * Gemini CHỈ được gọi từ main process.
 */
import { and, desc, eq } from 'drizzle-orm'
import {
  AI_TASK_INFO,
  AI_TASKS,
  type AiAnalysis,
  type AiModelOption,
  type AiStatus,
  type AiTask,
  type AiTestResult
} from '@shared/ai'
import type { AppDatabase } from '../../db/client'
import { aiAnalyses, aiUsage } from '../../db/schema'
import { UserError } from '../../errors'
import type { ErrorLogger } from '../../ipc/handler'
import type { ActivityRepository } from '../activity/activity-repository'
import type { DocumentService } from '../documents/document-service'
import type { SettingsStore } from '../settings/settings-store'
import type { AiClient, AiClientFactory } from './gemini-client'
import type { KeyStore } from './key-store'
import { buildPrompt } from './prompts'
import { RunError, runWithFallback, type RunControl } from './stream-runner'

const MODEL_KEY = 'ai.model'
/** Hủy nếu Gemini im lặng quá lâu giữa hai đoạn chữ */
export const IDLE_TIMEOUT_MS = 90_000
/** Chờ đoạn chữ đầu tiên tối đa bao lâu trước khi chuyển model dự phòng */
export const FIRST_CHUNK_TIMEOUT_MS = 40_000
/** Chờ trước lần thử lại cùng model khi Gemini quá tải (5xx): thử thêm 1 lần */
export const RETRY_DELAYS_MS = [3_000]
/** Nhớ model dự phòng vừa chạy tốt trong bao lâu (tránh thử lại model đang quá tải) */
const HEALTHY_MODEL_TTL_MS = 30 * 60_000

export interface AiService {
  getStatus(): AiStatus
  setKey(key: string): AiStatus
  removeKey(): AiStatus
  setModel(model: string | null): AiStatus
  listModels(): Promise<AiModelOption[]>
  test(): Promise<AiTestResult>
  analyze(
    documentId: number,
    task: AiTask,
    requestId: string,
    onChunk: (text: string) => void
  ): Promise<AiAnalysis>
  cancel(requestId: string): boolean
  getAnalyses(documentId: number): AiAnalysis[]
  /**
   * Gọi AI một lượt (không stream ra giao diện), dùng cho tác vụ nền như hiệu đính.
   * Có thử lại / model dự phòng như các tác vụ khác, ghi thống kê vào ai_usage.
   */
  complete(req: CompleteRequest): Promise<{ model: string; content: string }>
}

export interface CompleteRequest {
  /** Tên tác vụ ghi vào thống kê, ví dụ "polish" */
  task: string
  system: string
  prompt: string
  /** Yêu cầu Gemini trả về JSON */
  json?: boolean
  documentId?: number | null
  /** Dùng để hủy giữa chừng */
  control: RunControl
}

export interface AiServiceDeps {
  db: AppDatabase
  keys: KeyStore
  settings: SettingsStore
  documents: DocumentService
  activity: ActivityRepository
  logger: ErrorLogger
  clientFactory: AiClientFactory
  encryptionAvailable: () => boolean
  idleTimeoutMs?: number
  firstChunkTimeoutMs?: number
  retryDelaysMs?: number[]
}

/** Các model gemini-X.Y-flash ổn định, phiên bản mới nhất trước */
export function stableFlashModels(models: AiModelOption[]): string[] {
  return models
    .map((m) => ({ id: m.id, v: /^gemini-(\d+(?:\.\d+)?)-flash$/.exec(m.id) }))
    .filter((x) => x.v)
    .sort((a, b) => Number(b.v![1]) - Number(a.v![1]))
    .map((x) => x.id)
}

/** Chọn model Flash ổn định mới nhất (gemini-X.Y-flash), tránh bản lite / preview / exp. */
export function pickDefaultModel(models: AiModelOption[]): string | null {
  const ids = models.map((m) => m.id)
  const stable = stableFlashModels(models)
  if (stable[0]) return stable[0]
  if (ids.includes('gemini-flash-latest')) return 'gemini-flash-latest'
  const anyFlash = ids.find(
    (id) => /flash/.test(id) && !/lite|preview|exp|image|tts|audio/.test(id)
  )
  return anyFlash ?? ids.find((id) => id.startsWith('gemini')) ?? null
}

/** Đổi lỗi từ Gemini / mạng thành thông báo dễ hiểu. Không bao giờ đưa key vào thông báo. */
export function describeAiError(err: unknown, model: string): string {
  const e = err as { status?: unknown; message?: unknown; name?: unknown; cause?: unknown }
  const message = typeof e?.message === 'string' ? e.message : String(err)
  const status = typeof e?.status === 'number' ? e.status : undefined

  if (status === 400 && /api key|API_KEY_INVALID/i.test(message)) {
    return 'API key không hợp lệ. Hãy kiểm tra lại key trong Cài đặt.'
  }
  if (status === 401 || status === 403) {
    return `API key không có quyền dùng Gemini API (lỗi ${status}). Kiểm tra key hoặc dự án Google AI Studio.`
  }
  if (status === 404) {
    return `Không tìm thấy model "${model}". Hãy chọn model khác trong Cài đặt.`
  }
  if (status === 429) {
    return 'Đã vượt giới hạn số lần gọi hoặc hết quota miễn phí của Gemini. Đợi một lúc rồi thử lại.'
  }
  if (status !== undefined && status >= 500) {
    return `Máy chủ Gemini đang bận hoặc gặp lỗi (lỗi ${status}). Thử lại sau ít phút.`
  }
  if (status === 400) return `Gemini từ chối yêu cầu (lỗi 400): ${message.slice(0, 200)}`
  if (/fetch failed|ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|network/i.test(message)) {
    return 'Không kết nối được tới Gemini. Kiểm tra kết nối Internet.'
  }
  return `Gọi Gemini thất bại: ${message.slice(0, 200)}`
}

type Row = typeof aiAnalyses.$inferSelect
const toAnalysis = (r: Row): AiAnalysis => ({
  id: r.id,
  documentId: r.documentId,
  task: r.task,
  model: r.model,
  content: r.content,
  truncated: r.truncated,
  createdAt: r.createdAt
})

export function createAiService(deps: AiServiceDeps): AiService {
  const { db, keys, settings, documents, activity, logger, clientFactory } = deps
  const idleTimeout = deps.idleTimeoutMs ?? IDLE_TIMEOUT_MS
  const retryDelaysMs = deps.retryDelaysMs ?? RETRY_DELAYS_MS
  const firstChunkTimeout = Math.min(
    deps.firstChunkTimeoutMs ?? FIRST_CHUNK_TIMEOUT_MS,
    idleTimeout
  )
  const running = new Map<string, RunControl>()
  let modelCache: AiModelOption[] | null = null
  /** Chế độ tự động: model vừa chạy tốt gần đây (để lần sau đi thẳng vào, khỏi dò lại) */
  let healthy: { model: string; at: number } | null = null

  /**
   * Danh sách model sẽ thử theo thứ tự.
   * - Cố định (đã chọn model trong Cài đặt): chỉ đúng model đó, không tự đổi.
   * - Tự động: mọi bản gemini-X.Y-flash ổn định, mới nhất trước; quá tải / lỗi thì hạ dần
   *   xuống bản thấp hơn cho tới khi dùng được. Model vừa chạy tốt (trong 30 phút) được thử trước.
   */
  async function modelPlan(c: AiClient): Promise<{ models: string[]; auto: boolean }> {
    const fixed = settings.get(MODEL_KEY)
    if (fixed) return { models: [fixed], auto: false }
    modelCache ??= await listModels(c)
    let list = stableFlashModels(modelCache)
    if (list.length === 0) {
      const any = pickDefaultModel(modelCache)
      list = any ? [any] : []
    }
    if (list.length === 0) throw new UserError('Tài khoản không có model Gemini nào dùng được.')
    if (healthy && Date.now() - healthy.at < HEALTHY_MODEL_TTL_MS && list.includes(healthy.model)) {
      const first = healthy.model
      list = [first, ...list.filter((m) => m !== first)]
    }
    return { models: list, auto: true }
  }

  function rememberHealthy(auto: boolean, used: string): void {
    if (auto) healthy = { model: used, at: Date.now() }
  }

  function logAttempt(model: string, attempt: number, error: unknown): void {
    const e = error as { status?: unknown; kind?: unknown; message?: unknown }
    logger.warn?.(
      `[ai] ${model} lượt ${attempt + 1} thất bại: ${String(e?.status ?? e?.kind ?? '')} ${String(e?.message ?? '').slice(0, 120)}`
    )
  }

  function runErrorMessage(err: unknown, primary: string): string {
    const tried =
      err instanceof RunError
        ? err.triedModels
        : ((err as { triedModels?: string[] })?.triedModels ?? [])
    const suffix = tried.length > 1 ? ` (Đã thử: ${tried.join(', ')}.)` : ''
    if (err instanceof RunError) {
      switch (err.kind) {
        case 'cancelled':
          return 'Đã hủy.'
        case 'idle':
          return `Gemini không phản hồi sau ${Math.round(idleTimeout / 1000)} giây nên đã dừng. Hãy thử lại sau.${suffix}`
        case 'blocked':
          return `Gemini từ chối xử lý tài liệu này (lý do an toàn nội dung: ${String(err.original)}).`
        case 'empty':
          return 'Gemini không trả về nội dung. Hãy thử lại.'
        default:
          return describeAiError(err.original, err.model) + suffix
      }
    }
    if (!(err as { status?: unknown })?.status) logger.error('[ai] lỗi không xác định', err)
    return describeAiError(err, tried.at(-1) ?? primary) + suffix
  }

  function status(): AiStatus {
    const model = settings.get(MODEL_KEY) ?? null
    return {
      hasKey: keys.hasKey(),
      model,
      activeModel:
        !model && healthy && Date.now() - healthy.at < HEALTHY_MODEL_TTL_MS ? healthy.model : null,
      encryptionAvailable: deps.encryptionAvailable()
    }
  }

  function client(): AiClient {
    const key = keys.getKey()
    if (!key) throw new UserError('Chưa có Gemini API key. Hãy nhập key trong trang Cài đặt.')
    return clientFactory(key)
  }

  async function listModels(c: AiClient = client()): Promise<AiModelOption[]> {
    try {
      const models = await c.listModels()
      return models
        .filter((m) => m.id.startsWith('gemini'))
        .sort((a, b) => a.id.localeCompare(b.id))
    } catch (err) {
      throw new UserError(describeAiError(err, '(danh sách model)'))
    }
  }

  function recordUsage(values: typeof aiUsage.$inferInsert): void {
    try {
      db.insert(aiUsage).values(values).run()
    } catch (err) {
      logger.error('[ai] không ghi được thống kê', err)
    }
  }

  return {
    getStatus: status,

    setKey(key) {
      keys.setKey(key)
      return status()
    },

    removeKey() {
      keys.removeKey()
      return status()
    },

    setModel(model) {
      if (model) settings.set(MODEL_KEY, model)
      else settings.remove(MODEL_KEY)
      return status()
    },

    listModels: () => listModels(),

    async test() {
      const c = client()
      const { models, auto } = await modelPlan(c)
      const primary = models[0]
      const start = Date.now()
      try {
        const r = await runWithFallback({
          client: c,
          models,
          system: 'Trả lời đúng một từ.',
          prompt: 'Trả lời: OK',
          thinking: 'low',
          idleTimeoutMs: idleTimeout,
          firstChunkTimeoutMs: firstChunkTimeout,
          retryDelaysMs,
          control: {},
          onAttemptFailed: logAttempt
        })
        rememberHealthy(auto, r.model)
        return { model: r.model, latencyMs: Date.now() - start }
      } catch (err) {
        throw new UserError(runErrorMessage(err, primary))
      }
    },

    async analyze(documentId, task, requestId, onChunk) {
      if (!AI_TASKS.includes(task)) throw new UserError('Tác vụ AI không hợp lệ.')
      if (running.has(requestId)) throw new UserError('Yêu cầu này đang chạy.')
      const doc = documents.getSummary(documentId)
      const { text } = documents.get(documentId) // bản xem trước tối đa 200.000 ký tự
      if (!text.trim()) throw new UserError('Tài liệu không có nội dung chữ để AI phân tích.')

      const c = client()
      const { models, auto } = await modelPlan(c)
      const primary = models[0]
      const { system, prompt, truncated } = buildPrompt(task, doc.name, text)
      const control: RunControl = {}
      running.set(requestId, control)

      const start = Date.now()
      let result
      try {
        result = await runWithFallback({
          client: c,
          models,
          system,
          prompt,
          thinking: 'low',
          idleTimeoutMs: idleTimeout,
          firstChunkTimeoutMs: firstChunkTimeout,
          retryDelaysMs,
          control,
          onChunk,
          onAttemptFailed: logAttempt
        })
      } catch (err) {
        const cancelled = err instanceof RunError && err.kind === 'cancelled'
        const message = runErrorMessage(err, primary)
        const usage = err instanceof RunError ? err.usage : { inputTokens: 0, outputTokens: 0 }
        recordUsage({
          task,
          model: err instanceof RunError ? err.model : primary,
          documentId,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          durationMs: Date.now() - start,
          status: cancelled ? 'cancelled' : 'error',
          error: message,
          createdAt: Date.now()
        })
        throw new UserError(message)
      } finally {
        running.delete(requestId)
      }

      const { model, content, usage } = result
      rememberHealthy(auto, model)
      const createdAt = Date.now()
      return db.transaction(() => {
        const row = db
          .insert(aiAnalyses)
          .values({ documentId, task, model, content, truncated, createdAt })
          .returning()
          .get()
        recordUsage({
          task,
          model,
          documentId,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          durationMs: createdAt - start,
          status: 'ok',
          error: null,
          createdAt
        })
        activity.log({
          type: 'ai.analyzed',
          message: `AI ${AI_TASK_INFO[task].label.toLowerCase()} "${doc.name}"`,
          projectId: doc.projectId
        })
        return toAnalysis(row)
      })
    },

    async complete({ task, system, prompt, json, documentId, control }) {
      const c = client()
      const { models, auto } = await modelPlan(c)
      const start = Date.now()
      try {
        const r = await runWithFallback({
          client: c,
          models,
          system,
          prompt,
          json,
          thinking: 'low',
          idleTimeoutMs: idleTimeout,
          firstChunkTimeoutMs: firstChunkTimeout,
          retryDelaysMs,
          control,
          onAttemptFailed: logAttempt
        })
        rememberHealthy(auto, r.model)
        recordUsage({
          task,
          model: r.model,
          documentId: documentId ?? null,
          inputTokens: r.usage.inputTokens,
          outputTokens: r.usage.outputTokens,
          durationMs: Date.now() - start,
          status: 'ok',
          error: null,
          createdAt: Date.now()
        })
        return { model: r.model, content: r.content }
      } catch (err) {
        const cancelled = err instanceof RunError && err.kind === 'cancelled'
        const message = runErrorMessage(err, models[0])
        const usage = err instanceof RunError ? err.usage : { inputTokens: 0, outputTokens: 0 }
        recordUsage({
          task,
          model: err instanceof RunError ? err.model : models[0],
          documentId: documentId ?? null,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          durationMs: Date.now() - start,
          status: cancelled ? 'cancelled' : 'error',
          error: message,
          createdAt: Date.now()
        })
        throw new UserError(message)
      }
    },

    cancel(requestId) {
      const control = running.get(requestId)
      if (!control) return false
      control.reason = 'user'
      control.abort?.()
      return true
    },

    getAnalyses(documentId) {
      const out: AiAnalysis[] = []
      for (const task of AI_TASKS) {
        const row = db
          .select()
          .from(aiAnalyses)
          .where(and(eq(aiAnalyses.documentId, documentId), eq(aiAnalyses.task, task)))
          .orderBy(desc(aiAnalyses.createdAt), desc(aiAnalyses.id))
          .limit(1)
          .get()
        if (row) out.push(toAnalysis(row))
      }
      return out
    }
  }
}
