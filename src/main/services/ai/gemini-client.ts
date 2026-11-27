/**
 * Lớp mỏng bọc thư viện @google/genai. AiService chỉ làm việc qua interface AiClient,
 * nên test có thể thay bằng client giả mà không gọi mạng.
 */
import { GoogleGenAI } from '@google/genai'

export interface StreamRequest {
  model: string
  system: string
  prompt: string
  signal: AbortSignal
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

export const createGeminiClient: AiClientFactory = (apiKey) => {
  const ai = new GoogleGenAI({ apiKey })
  return {
    async *stream({ model, system, prompt, signal }) {
      const response = await ai.models.generateContentStream({
        model,
        contents: prompt,
        config: { systemInstruction: system, temperature: 0.3, abortSignal: signal }
      })
      for await (const chunk of response) {
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
