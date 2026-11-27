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

const MODEL_KEY = 'ai.model'
/** Hủy nếu Gemini im lặng quá lâu giữa hai đoạn chữ */
export const IDLE_TIMEOUT_MS = 90_000

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
}

/** Chọn model Flash ổn định mới nhất (gemini-X.Y-flash), tránh bản lite / preview / exp. */
export function pickDefaultModel(models: AiModelOption[]): string | null {
  const ids = models.map((m) => m.id)
  const stable = ids
    .map((id) => ({ id, m: /^gemini-(\d+(?:\.\d+)?)-flash$/.exec(id) }))
    .filter((x) => x.m)
    .sort((a, b) => Number(b.m![1]) - Number(a.m![1]))
  if (stable[0]) return stable[0].id
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
  const running = new Map<string, { controller: AbortController; reason?: 'user' | 'idle' }>()

  function status(): AiStatus {
    return {
      hasKey: keys.hasKey(),
      model: settings.get(MODEL_KEY) ?? null,
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

  /** Model đang chọn; nếu chưa chọn thì tự chọn bản Flash mới nhất và lưu lại. */
  async function resolveModel(c: AiClient): Promise<string> {
    const saved = settings.get(MODEL_KEY)
    if (saved) return saved
    const picked = pickDefaultModel(await listModels(c))
    if (!picked) throw new UserError('Tài khoản không có model Gemini nào dùng được.')
    settings.set(MODEL_KEY, picked)
    return picked
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
      const model = await resolveModel(c)
      const start = Date.now()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 30_000)
      try {
        let got = false
        for await (const chunk of c.stream({
          model,
          system: 'Trả lời đúng một từ.',
          prompt: 'Trả lời: OK',
          signal: controller.signal
        })) {
          if (chunk.text) got = true
        }
        if (!got) throw new Error('Gemini không trả về nội dung')
        return { model, latencyMs: Date.now() - start }
      } catch (err) {
        if (controller.signal.aborted) throw new UserError('Gemini không phản hồi sau 30 giây.')
        throw new UserError(describeAiError(err, model))
      } finally {
        clearTimeout(timer)
      }
    },

    async analyze(documentId, task, requestId, onChunk) {
      if (!AI_TASKS.includes(task)) throw new UserError('Tác vụ AI không hợp lệ.')
      if (running.has(requestId)) throw new UserError('Yêu cầu này đang chạy.')
      const doc = documents.getSummary(documentId)
      const { text } = documents.get(documentId) // bản xem trước tối đa 200.000 ký tự
      if (!text.trim()) throw new UserError('Tài liệu không có nội dung chữ để AI phân tích.')

      const c = client()
      const model = await resolveModel(c)
      const { system, prompt, truncated } = buildPrompt(task, doc.name, text)
      const entry: { controller: AbortController; reason?: 'user' | 'idle' } = {
        controller: new AbortController()
      }
      running.set(requestId, entry)

      const start = Date.now()
      let content = ''
      let usage = { inputTokens: 0, outputTokens: 0 }
      let timer: ReturnType<typeof setTimeout> | undefined
      const armIdle = (): void => {
        clearTimeout(timer)
        timer = setTimeout(() => {
          entry.reason = 'idle'
          entry.controller.abort()
        }, idleTimeout)
      }

      try {
        armIdle()
        for await (const chunk of c.stream({
          model,
          system,
          prompt,
          signal: entry.controller.signal
        })) {
          if (entry.controller.signal.aborted) break
          armIdle()
          if (chunk.blocked) {
            throw new UserError(
              `Gemini từ chối xử lý tài liệu này (lý do an toàn nội dung: ${chunk.blocked}).`
            )
          }
          if (chunk.usage) usage = chunk.usage
          if (chunk.text) {
            content += chunk.text
            onChunk(chunk.text)
          }
        }
        if (entry.controller.signal.aborted) throw new Error('aborted')
        if (!content.trim()) throw new UserError('Gemini không trả về nội dung. Hãy thử lại.')
      } catch (err) {
        const reason = entry.reason
        const cancelled = reason === 'user'
        const message = cancelled
          ? 'Đã hủy.'
          : reason === 'idle'
            ? `Gemini không phản hồi sau ${Math.round(idleTimeout / 1000)} giây nên đã dừng. Hãy thử lại.`
            : err instanceof UserError
              ? err.message
              : describeAiError(err, model)
        recordUsage({
          task,
          model,
          documentId,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          durationMs: Date.now() - start,
          status: cancelled ? 'cancelled' : 'error',
          error: message,
          createdAt: Date.now()
        })
        if (!cancelled && !(err instanceof UserError) && !reason) {
          logger.error(`[ai] ${task} thất bại`, err)
        }
        throw new UserError(message)
      } finally {
        clearTimeout(timer)
        running.delete(requestId)
      }

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

    cancel(requestId) {
      const entry = running.get(requestId)
      if (!entry) return false
      entry.reason = 'user'
      entry.controller.abort()
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
