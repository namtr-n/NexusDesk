import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseHandle } from '../../src/main/db/client'
import { UserError } from '../../src/main/errors'
import { createActivityRepository } from '../../src/main/services/activity/activity-repository'
import { createProjectService } from '../../src/main/services/projects/project-service'
import {
  createPromptService,
  toFtsQuery,
  type PromptService
} from '../../src/main/services/prompts/prompt-service'
import { STARTER_PROMPTS } from '../../src/main/services/prompts/starter-prompts'
import { createSettingsStore } from '../../src/main/services/settings/settings-store'
import { promptCreateSchema, parseTagInput } from '../../src/shared/prompts'
import { createTestDatabase } from './test-db'

const fields = (over: Partial<Parameters<PromptService['create']>[0]> = {}) =>
  promptCreateSchema.parse({ title: 'Tóm tắt chương', content: 'Tóm tắt từng chương.', ...over })

describe('PromptService', () => {
  let database: DatabaseHandle
  let prompts: PromptService

  beforeEach(() => {
    database = createTestDatabase()
    prompts = createPromptService({
      db: database.db,
      settings: createSettingsStore(database.db),
      activity: createActivityRepository(database.db)
    })
  })

  afterEach(() => database.close())

  it('prompt mẫu chỉ thêm một lần; xóa hết cũng không tự thêm lại', () => {
    prompts.ensureStarter()
    prompts.ensureStarter()
    const list = prompts.list({ query: '' })
    expect(list).toHaveLength(STARTER_PROMPTS.length)
    for (const p of list) prompts.remove(p.id)
    prompts.ensureStarter()
    expect(prompts.list({ query: '' })).toHaveLength(0)
  })

  it('tạo, sửa: chỉ tạo phiên bản mới khi tiêu đề / nội dung đổi; khôi phục bản cũ', () => {
    const p = prompts.create(fields({ tags: [' #slide ', 'Slide', 'bảo vệ'] }))
    expect(p.tags).toEqual(['slide', 'bảo vệ'])
    expect(p.versionCount).toBe(1)

    prompts.update(p.id, { ...fields(), category: 'Viết báo cáo', tags: [] })
    expect(prompts.get(p.id).versionCount).toBe(1) // chỉ đổi danh mục

    const v2 = prompts.update(p.id, fields({ content: 'Nội dung mới' }))
    expect(v2.versionCount).toBe(2)
    const versions = prompts.versions(p.id)
    expect(versions.map((v) => v.content)).toEqual(['Nội dung mới', 'Tóm tắt từng chương.'])

    const restored = prompts.restore(p.id, versions[1].id)
    expect(restored.content).toBe('Tóm tắt từng chương.')
    expect(restored.versionCount).toBe(3)
    expect(() => prompts.restore(p.id, 99999)).toThrow(UserError)
  })

  it('tìm kiếm toàn văn: gõ không dấu, theo tiền tố, tiêu đề xếp trước nội dung', () => {
    const a = prompts.create(fields({ title: 'Kiểm tra chính tả', content: 'Liệt kê lỗi.' }))
    const b = prompts.create(
      fields({ title: 'Viết lại đoạn văn', content: 'Sửa lỗi chính tả và ngữ pháp.' })
    )
    prompts.create(fields({ title: 'Dàn ý slide', content: 'Soạn slide.', tags: ['thuyết trình'] }))

    expect(prompts.list({ query: 'chinh ta' }).map((p) => p.id)).toEqual([a.id, b.id])
    expect(prompts.list({ query: 'thuyet' }).map((p) => p.title)).toEqual(['Dàn ý slide'])
    expect(prompts.list({ query: 'không-có-gì' })).toEqual([])
    // Ký tự đặc biệt của FTS5 không làm lỗi truy vấn
    expect(() => prompts.list({ query: '"chính" OR (tả* NEAR' })).not.toThrow()
    // Sửa nội dung thì chỉ mục tìm kiếm cập nhật theo
    prompts.update(b.id, fields({ title: 'Viết lại đoạn văn', content: 'Diễn đạt gọn hơn.' }))
    expect(prompts.list({ query: 'chinh ta' }).map((p) => p.id)).toEqual([a.id])
  })

  it('lọc theo danh mục và dự án; danh mục kèm số lượng', () => {
    const project = createProjectService(database.db, createActivityRepository(database.db)).create(
      { name: 'Đồ án', description: '' }
    )
    prompts.create(fields({ category: 'Bảo vệ', projectId: project.id }))
    prompts.create(fields({ category: 'Bảo vệ' }))
    prompts.create(fields({ category: '' }))

    expect(prompts.categories()).toEqual([{ name: 'Bảo vệ', count: 2 }])
    expect(prompts.list({ query: '', category: 'Bảo vệ' })).toHaveLength(2)
    expect(prompts.list({ query: '', projectId: project.id })).toHaveLength(1)
    expect(prompts.list({ query: '', projectId: null })).toHaveLength(2)
    expect(() => prompts.create(fields({ projectId: 9999 }))).toThrow(UserError)
  })

  it('nhân bản, ghi nhận lượt dùng, xóa', () => {
    const p = prompts.create(fields({ tags: ['a'] }))
    const copy = prompts.duplicate(p.id)
    expect(copy).toMatchObject({ title: 'Tóm tắt chương (bản sao)', tags: ['a'], versionCount: 1 })
    prompts.markUsed(p.id)
    expect(prompts.get(p.id)).toMatchObject({ useCount: 1 })
    prompts.remove(p.id)
    expect(() => prompts.get(p.id)).toThrow(UserError)
    expect(prompts.list({ query: 'chuong' }).map((x) => x.id)).toEqual([copy.id])
  })

  it('kiểm tra dữ liệu nhập', () => {
    expect(() => promptCreateSchema.parse({ title: '  ', content: 'x' })).toThrow()
    expect(() => promptCreateSchema.parse({ title: 'x', content: '' })).toThrow()
    expect(() =>
      promptCreateSchema.parse({
        title: 'x',
        content: 'y',
        tags: Array.from({ length: 11 }, (_, i) => `t${i}`)
      })
    ).toThrow()
    expect(parseTagInput('slide, #bảo vệ;  slide ,')).toEqual(['slide', 'bảo vệ'])
    expect(toFtsQuery('  ')).toBeNull()
    expect(toFtsQuery('chính "tả"')).toBe('"chính"* "tả"*')
  })
})
