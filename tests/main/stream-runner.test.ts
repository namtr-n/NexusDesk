import { describe, expect, it } from 'vitest'
import type { AiClient, StreamChunk, StreamRequest } from '../../src/main/services/ai/gemini-client'
import {
  RunError,
  runWithFallback,
  type RunControl
} from '../../src/main/services/ai/stream-runner'

const apiError = (status: number): Error => Object.assign(new Error(`status ${status}`), { status })

/** Client giả: mỗi model có một kịch bản cho từng lượt gọi */
function scripted(plan: Record<string, ((req: StreamRequest) => AsyncIterable<StreamChunk>)[]>) {
  const calls: string[] = []
  const client: AiClient = {
    stream: (req) => {
      const list = plan[req.model] ?? []
      const fn = list[calls.filter((m) => m === req.model).length] ?? list.at(-1)!
      calls.push(req.model)
      return fn(req)
    },
    listModels: async () => []
  }
  return { client, calls }
}

const ok = (text: string) =>
  async function* () {
    yield { text, usage: { inputTokens: 5, outputTokens: 2 } }
  }
const fail = (status: number) =>
  async function* () {
    yield* []
    throw apiError(status)
  }

const base = (client: AiClient, models: string[], control: RunControl = {}) => ({
  client,
  models,
  system: 's',
  prompt: 'p',
  idleTimeoutMs: 1000,
  retryDelaysMs: [1, 1],
  control
})

describe('runWithFallback', () => {
  it('503 rồi thành công: thử lại cùng model', async () => {
    const { client, calls } = scripted({ a: [fail(503), fail(503), ok('xong')] })
    const r = await runWithFallback(base(client, ['a', 'b']))
    expect(r).toMatchObject({ model: 'a', content: 'xong' })
    expect(calls).toEqual(['a', 'a', 'a'])
  })

  it('503 mãi: hết lượt thử thì chuyển model dự phòng', async () => {
    const { client, calls } = scripted({ a: [fail(503)], b: [ok('từ b')] })
    const r = await runWithFallback(base(client, ['a', 'b']))
    expect(r.model).toBe('b')
    expect(calls).toEqual(['a', 'a', 'a', 'b'])
  })

  it('429 (hết quota model): chuyển model ngay, không thử lại cùng model', async () => {
    const { client, calls } = scripted({ a: [fail(429)], b: [ok('b')] })
    await runWithFallback(base(client, ['a', 'b']))
    expect(calls).toEqual(['a', 'b'])
  })

  it('400 / 403: dừng ngay, không thử model khác', async () => {
    const { client, calls } = scripted({ a: [fail(403)], b: [ok('b')] })
    await expect(runWithFallback(base(client, ['a', 'b']))).rejects.toMatchObject({ status: 403 })
    expect(calls).toEqual(['a'])
  })

  it('tất cả đều quá tải: báo lỗi cuối kèm danh sách model đã thử', async () => {
    const { client } = scripted({ a: [fail(503)], b: [fail(503)] })
    await expect(runWithFallback(base(client, ['a', 'b']))).rejects.toMatchObject({
      status: 503,
      triedModels: ['a', 'b']
    })
  })

  it('đã trả chữ rồi mới lỗi: không thử lại (tránh lặp nội dung)', async () => {
    const { client, calls } = scripted({
      a: [
        async function* () {
          yield { text: 'nửa chừng' }
          throw apiError(503)
        }
      ],
      b: [ok('b')]
    })
    const chunks: string[] = []
    await expect(
      runWithFallback({ ...base(client, ['a', 'b']), onChunk: (t) => chunks.push(t) })
    ).rejects.toMatchObject({ status: 503 })
    expect(calls).toEqual(['a'])
    expect(chunks).toEqual(['nửa chừng'])
  })

  it('chờ chữ đầu tiên quá lâu: chuyển ngay sang model dự phòng', async () => {
    const silent = (req: StreamRequest) =>
      (async function* () {
        await new Promise((r) => req.signal.addEventListener('abort', r))
        yield* []
      })()
    const { client, calls } = scripted({ a: [silent], b: [ok('từ b')] })
    const r = await runWithFallback({
      ...base(client, ['a', 'b']),
      idleTimeoutMs: 5000,
      firstChunkTimeoutMs: 20
    })
    expect(r).toMatchObject({ model: 'b', content: 'từ b' })
    expect(calls).toEqual(['a', 'b'])
  })

  it('hủy trong lúc chờ thử lại: dừng ngay', async () => {
    const control: RunControl = {}
    const { client, calls } = scripted({ a: [fail(503)] })
    const p = runWithFallback({ ...base(client, ['a', 'b'], control), retryDelaysMs: [5000] })
    await new Promise((r) => setTimeout(r, 20))
    control.reason = 'user'
    control.abort?.()
    await expect(p).rejects.toBeInstanceOf(RunError)
    await expect(p).rejects.toMatchObject({ kind: 'cancelled' })
    expect(calls).toEqual(['a'])
  })

  it('model không hỗ trợ mức suy nghĩ: gửi lại không kèm cấu hình đó', async () => {
    const seen: (StreamRequest['thinking'] | undefined)[] = []
    const client: AiClient = {
      stream: (req) => {
        seen.push(req.thinking)
        if (req.thinking) {
          return (async function* () {
            yield* []
            throw Object.assign(
              new Error('Thinking level MINIMAL is not supported for this model.'),
              { status: 400 }
            )
          })()
        }
        return ok('được')()
      },
      listModels: async () => []
    }
    const r = await runWithFallback({ ...base(client, ['a']), thinking: 'minimal' })
    expect(r.content).toBe('được')
    expect(seen).toEqual(['minimal', undefined])
  })

  it('truyền mức suy nghĩ xuống client', async () => {
    let seen: StreamRequest['thinking']
    const client: AiClient = {
      stream: (req) => {
        seen = req.thinking
        return ok('x')()
      },
      listModels: async () => []
    }
    await runWithFallback({ ...base(client, ['a']), thinking: 'low' })
    expect(seen).toBe('low')
  })
})
