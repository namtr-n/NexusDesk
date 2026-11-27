import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import JSZip from 'jszip'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseHandle } from '../../src/main/db/client'
import { UserError } from '../../src/main/errors'
import { createActivityRepository } from '../../src/main/services/activity/activity-repository'
import type { AiService } from '../../src/main/services/ai/ai-service'
import { createDocumentService } from '../../src/main/services/documents/document-service'
import { loadDocx } from '../../src/main/services/format/docx-model'
import { createTemplateService } from '../../src/main/services/format/template-service'
import {
  makeBatches,
  parsePolishResponse,
  unsafeReason
} from '../../src/main/services/polish/polish-prompt'
import {
  createPolishService,
  type PolishService
} from '../../src/main/services/polish/polish-service'
import { buildDocx, LONG, p, SECT_OK } from './docx-builder'
import { createTestDatabase } from './test-db'

describe('polish-prompt', () => {
  it('đọc JSON của AI, kể cả khi bọc trong ```json', () => {
    expect(
      parsePolishResponse('```json\n{"edits":[{"id":"3","find":"a","replace":"b"}]}\n```')
    ).toEqual([{ id: 3, find: 'a', replace: 'b', reason: '' }])
    expect(() => parsePolishResponse('không có json')).toThrow()
  })

  it('chặn sửa đổi không an toàn', () => {
    const e = (find: string, replace: string) => ({ id: 1, find, replace, reason: '' })
    expect(unsafeReason(e('sử lý', 'xử lý'), 'spelling')).toBeNull()
    expect(unsafeReason(e('năm 2023', 'năm 2024'), 'spelling')).toBe('Làm thay đổi số liệu')
    expect(
      unsafeReason(e('tốt', 'tốt hơn rất nhiều so với các phương pháp truyền thống'), 'spelling')
    ).toBe('Thêm quá nhiều chữ (giống viết lại)')
    expect(unsafeReason(e('một câu khá dài cần rút gọn lại', 'câu'), 'spelling')).toBe(
      'Xóa quá nhiều chữ'
    )
    expect(unsafeReason(e('một câu khá dài cần rút gọn lại', 'câu ngắn gọn'), 'style')).toBeNull()
  })

  it('chia lượt theo số ký tự và số đoạn', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, text: 'x'.repeat(500) }))
    const batches = makeBatches(items)
    expect(batches.every((b) => b.reduce((s, x) => s + x.text.length, 0) <= 6000)).toBe(true)
    expect(batches.flat()).toHaveLength(50)
  })
})

describe('PolishService', () => {
  let database: DatabaseHandle
  let root: string
  let polish: PolishService
  let docs: ReturnType<typeof createDocumentService>
  let prompts: string[]

  /** AI giả: sửa "sử lý" → "xử lý", và đề xuất 1 sửa đổi đổi số liệu (phải bị chặn) */
  const fakeAi = {
    complete: vi.fn(async ({ prompt }: { prompt: string }) => {
      prompts.push(prompt)
      const json = prompt.slice(prompt.indexOf('<doan_van>') + 10, prompt.indexOf('</doan_van>'))
      const items = JSON.parse(json) as { id: number; text: string }[]
      const edits = items.flatMap((it) => [
        ...(it.text.includes('sử lý')
          ? [{ id: it.id, find: 'sử lý', replace: 'xử lý', reason: 'chính tả' }]
          : []),
        ...(it.text.includes('năm 2023')
          ? [{ id: it.id, find: 'năm 2023', replace: 'năm 2024' }]
          : [])
      ])
      return { model: 'gemini-fake', content: JSON.stringify({ edits }) }
    })
  } as unknown as AiService

  beforeEach(async () => {
    database = createTestDatabase()
    root = await mkdtemp(join(tmpdir(), 'nexus-polish-'))
    await mkdir(join(root, 'storage'))
    prompts = []
    const activity = createActivityRepository(database.db)
    const logger = { error: vi.fn() }
    docs = createDocumentService({
      db: database.db,
      activity,
      storageDir: join(root, 'storage'),
      logger
    })
    const templates = createTemplateService(database.db)
    templates.ensureDefault()
    polish = createPolishService({ documents: docs, templates, ai: fakeAi, activity, logger })
  })

  afterEach(async () => {
    database.close()
    await rm(root, { recursive: true, force: true })
  })

  async function importDocx(body: string): Promise<{ id: number; path: string }> {
    const path = join(root, 'bao cao.docx')
    await writeFile(path, await buildDocx(body))
    return { id: (await docs.importFiles([path], null)).imported[0].id, path }
  }

  it('sửa định dạng + ghi sửa đổi câu chữ bằng Track Changes, file gốc giữ nguyên', async () => {
    const body =
      p('CHƯƠNG 1. TỔNG QUAN', { style: 'Heading1' }) +
      p(`Nhóm cần sử lý dữ liệu khảo sát năm 2023. ${LONG}`) +
      p('TÀI LIỆU THAM KHẢO', { style: 'Heading1' }) +
      p('Nguyễn Văn A, sử lý ảnh số, NXB X.') +
      SECT_OK
    const { id, path } = await importDocx(body)
    const original = await readFile(path)
    const progress = vi.fn()

    const target = join(root, 'bao cao - hoan thien.docx')
    const r = await polish.run(
      { documentId: id, mode: 'spelling', fixFormat: true, requestId: 'req-polish-1' },
      target,
      progress
    )

    expect(r.editsApplied).toBe(1)
    expect(r.editsSkipped).toBe(1) // sửa đổi đổi số liệu bị chặn
    expect(r.changes).toEqual([
      { paragraph: 2, find: 'sử lý', replace: 'xử lý', reason: 'chính tả' }
    ])
    expect(r.format?.issuesAfter).toBe(0)
    expect(r.newDocumentId).not.toBeNull()
    expect(await readFile(path)).toEqual(original)

    // Phần tài liệu tham khảo không gửi cho AI
    expect(prompts.join()).not.toContain('Nguyễn Văn A')

    // Trong file mới: có w:del / w:ins; văn bản "đã chấp nhận" là bản đã sửa
    const xml = await (
      await JSZip.loadAsync(await readFile(target))
    )
      .file('word/document.xml')!
      .async('string')
    expect(xml).toContain('w:author="Nexus Desk AI"')
    expect(xml).toContain('<w:delText xml:space="preserve">sử lý</w:delText>')
    const model = await loadDocx(await readFile(target))
    expect(model.paragraphs[1].text.startsWith('Nhóm cần xử lý dữ liệu khảo sát năm 2023.')).toBe(
      true
    )
    expect(model.paragraphs[3].text).toBe('Nguyễn Văn A, sử lý ảnh số, NXB X.')

    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ stage: 'ai' }))
    expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ stage: 'save', done: 1 }))
  })

  it('không cho ghi đè file gốc; chỉ nhận DOCX', async () => {
    const { id, path } = await importDocx(p(LONG) + SECT_OK)
    await expect(
      polish.run(
        { documentId: id, mode: 'spelling', fixFormat: false, requestId: 'req-polish-2' },
        path,
        vi.fn()
      )
    ).rejects.toThrow(UserError)
  })
})
