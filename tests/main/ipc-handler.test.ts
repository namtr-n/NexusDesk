import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { activityListSchema, projectCreateSchema } from '@shared/ipc-contract'
import { createHandler, GENERIC_ERROR } from '../../src/main/ipc/handler'
import { UserError } from '../../src/main/errors'

const silentLogger = () => ({ error: vi.fn() })

describe('createHandler', () => {
  it('dữ liệu hợp lệ: chạy hàm và trả ok', async () => {
    const handler = createHandler(
      't',
      projectCreateSchema,
      (i) => i.name.toUpperCase(),
      silentLogger()
    )
    expect(await handler({ name: ' abc ' })).toEqual({ ok: true, data: 'ABC' })
  })

  it('dữ liệu sai: không chạy hàm, trả thông báo tiếng Việt', async () => {
    const fn = vi.fn()
    const handler = createHandler('t', projectCreateSchema, fn, silentLogger())
    expect(await handler({ name: '   ' })).toEqual({
      ok: false,
      error: 'Tên dự án không được để trống'
    })
    expect(await handler({ name: 'x'.repeat(101) })).toMatchObject({ ok: false })
    expect(await handler('không phải object')).toMatchObject({ ok: false })
    expect(fn).not.toHaveBeenCalled()
  })

  it('UserError: trả nguyên thông báo cho người dùng', async () => {
    const handler = createHandler(
      't',
      z.undefined(),
      () => {
        throw new UserError('Không tìm thấy dự án')
      },
      silentLogger()
    )
    expect(await handler(undefined)).toEqual({ ok: false, error: 'Không tìm thấy dự án' })
  })

  it('lỗi bất ngờ: ẩn chi tiết, ghi log', async () => {
    const logger = silentLogger()
    const handler = createHandler(
      'projects:list',
      z.undefined(),
      () => {
        throw new Error('SQLITE_CORRUPT: chi tiết nội bộ')
      },
      logger
    )
    const result = await handler(undefined)
    expect(result).toEqual({ ok: false, error: GENERIC_ERROR })
    expect(logger.error).toHaveBeenCalledOnce()
  })

  it('activityListSchema: không truyền gì thì mặc định 20', () => {
    expect(activityListSchema.parse(undefined)).toEqual({ limit: 20 })
    expect(activityListSchema.safeParse({ limit: 1000 }).success).toBe(false)
  })
})
