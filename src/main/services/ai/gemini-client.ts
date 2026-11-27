/**
 * Lớp mỏng bọc thư viện @google/genai. AiService chỉ làm việc qua interface AiClient,
 * nên test có thể thay bằng client giả mà không gọi mạng.
 */
import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import { logger } from '../../logger'

export interface StreamRequest {
  model: string
  system: string
  prompt: string
  signal: AbortSignal
  /** Mức "suy nghĩ" cho model Gemini 3+: minimal (nhanh nhất) hoặc low */
  thinking?: 'minimal' | 'low'
  /** Yêu cầu trả về JSON (responseMimeType application/json) */
  json?: boolean
}

export interface StreamChunk {
  text?: string
  usage?: { inputTokens: number; outputTokens: number }
  /** Lý do bị chặn (an toàn nội dung...) nếu có */
  blocked?: string
}

export interface AiModelInfo {
  /** Ví dụ "gemini-3.8-flash" (đã bỏ tiền tố "models/") */
  id: string
  displayName: string
  inputTokenLimit: number | null
}

export interface AiClient {
  stream(req: StreamRequest): AsyncIterable<StreamChunk>
  listModels(): Promise<AiModelInfo[]>
}

export type AiClientFactory = (apiKey: string) => AiClient

/** Gemini 3 trở lên dùng thinkingLevel; bản 2.x không hỗ trợ tham số này. */
export function supportsThinkingLevel(model: string): boolean {
  const m = /^gemini-(\d+)/.exec(model)
  return !!m && Number(m[1]) >= 3
}

export const createGeminiClient: AiClientFactory = (apiKey) => {
  const ai = new GoogleGenAI({ apiKey })
  return {
    async *stream({ model, system, prompt, signal, thinking, json }) {
      const t0 = Date.now()
      let chunks = 0
      logger.info(`[gemini] bắt đầu ${model}, prompt ${prompt.length} ký tự`)
      const thinkingConfig =
        thinking && supportsThinkingLevel(model)
          ? {
              thinkingLevel: thinking === 'minimal' ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW
            }
          : undefined
      const response = await ai.models.generateContentStream({
        model,
        contents: prompt,
        config: {
          systemInstruction: system,
          temperature: 0.3,
          abortSignal: signal,
          ...(json ? { responseMimeType: 'application/json' } : {}),
          ...(thinkingConfig ? { thinkingConfig } : {})
        }
      })
      for await (const chunk of response) {
        chunks++
        if (chunks === 1) logger.info(`[gemini] ${model}: đoạn đầu tiên sau ${Date.now() - t0} ms`)
        const blocked = chunk.promptFeedback?.blockReason
        if (blocked) yield { blocked: String(blocked) }
        const text = chunk.text
        const usage = chunk.usageMetadata
        yield {
          text: text || undefined,
          usage: usage
            ? {
                inputTokens: usage.promptTokenCount ?? 0,
                outputTokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0)
              }
            : undefined
        }
      }
      logger.info(`[gemini] ${model}: xong sau ${Date.now() - t0} ms, ${chunks} đoạn`)
    },

    async listModels() {
      const out: AiModelInfo[] = []
      const pager = await ai.models.list({ config: { pageSize: 100 } })
      for await (const m of pager) {
        if (!m.name || !(m.supportedActions ?? []).includes('generateContent')) continue
        out.push({
          id: m.name.replace(/^models\//, ''),
          displayName: m.displayName ?? m.name,
          inputTokenLimit: m.inputTokenLimit ?? null
        })
      }
      return out
    }
  }
}
