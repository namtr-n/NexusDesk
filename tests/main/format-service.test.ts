import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TEMPLATE_NAME, DEFAULT_TEMPLATE_SPEC, EMPTY_CATEGORY } from '@shared/format'
import type { DatabaseHandle } from '../../src/main/db/client'
import { UserError } from '../../src/main/errors'
import { createActivityRepository } from '../../src/main/services/activity/activity-repository'
import {
  createDocumentService,
  type DocumentService
} from '../../src/main/services/documents/document-service'
import { loadDocx } from '../../src/main/services/format/docx-model'
import {
  createFormatService,
  type FormatService
} from '../../src/main/services/format/format-service'
import {
  createTemplateService,
  type TemplateService
} from '../../src/main/services/format/template-service'
import { buildDocx, LONG, p, SECT_OK } from './docx-builder'
import { createTestDatabase } from './test-db'

describe('TemplateService + FormatService', () => {
  let database: DatabaseHandle
  let docs: DocumentService
  let templates: TemplateService
  let format: FormatService
  let root: string
  let userDir: string

  beforeEach(async () => {
    database = createTestDatabase()
    root = await mkdtemp(join(tmpdir(), 'nexus-format-'))
    userDir = join(root, 'user')
    await mkdir(userDir)
    await mkdir(join(root, 'storage'))
    const activity = createActivityRepository(database.db)
    const logger = { error: vi.fn() }
    docs = createDocumentService({
      db: database.db,
      activity,
      storageDir: join(root, 'storage'),
      logger
    })
    templates = createTemplateService(database.db)
    templates.ensureDefault()
    format = createFormatService({ db: database.db, documents: docs, templates, activity, logger })
  })

  afterEach(async () => {
    database.close()
    await rm(root, { recursive: true, force: true })
  })

  async function importDocx(name: string, body: string): Promise<number> {
    const path = join(userDir, name)
    await writeFile(path, await buildDocx(body))
    const r = await docs.importFiles([path], null)
    return r.imported[0].id
  }

  it('khởi động: tạo đúng 1 mẫu mặc định, gọi lại không tạo thêm', () => {
    templates.ensureDefault()
    const list = templates.list()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ name: DEFAULT_TEMPLATE_NAME, isDefault: true })
    expect(templates.getDefault().spec).toEqual(DEFAULT_TEMPLATE_SPEC)
  })

  it('tạo, sửa, đặt mặc định, xóa mẫu', () => {
    const t = templates.createFromPreset('Khách A')
    const spec = { ...DEFAULT_TEMPLATE_SPEC, body: { ...EMPTY_CATEGORY, fontFamily: 'Arial' } }
    expect(templates.update(t.id, 'Khách A (sửa)', spec)).toMatchObject({
      name: 'Khách A (sửa)',
      spec
    })

    templates.setDefault(t.id)
    expect(templates.getDefault().id).toBe(t.id)
    expect(templates.list().filter((x) => x.isDefault)).toHaveLength(1)

    templates.remove(t.id)
    expect(templates.getDefault().name).toBe(DEFAULT_TEMPLATE_NAME)
    expect(() => templates.remove(templates.getDefault().id)).toThrow(UserError)
  })

  it('học mẫu từ file DOCX, tên mặc định theo tên file', async () => {
    const data = await buildDocx(p(LONG, { style: 'BaoCao' }).repeat(3) + SECT_OK)
    const t = await templates.createFromDocx(data, 'Mau khach.docx')
    expect(t.name).toBe('Mẫu: Mau khach')
    expect(t.sourceName).toBe('Mau khach.docx')
    expect(t.learned?.bodyParagraphs).toBe(3)
    expect(t.spec.body.fontFamily).toBe('Times New Roman')
    await expect(templates.createFromDocx(Buffer.from('rác'), 'x.docx')).rejects.toThrow(UserError)
  })

  it('kiểm tra theo mẫu mặc định hoặc mẫu chọn; lưu tên mẫu vào kết quả', async () => {
    const id = await importDocx('a.docx', p(LONG) + SECT_OK)
    expect(format.getLatest(id)).toBeNull()

    const first = await format.check(id)
    expect(first.templateName).toBe(DEFAULT_TEMPLATE_NAME)
    expect(first.issues.length).toBeGreaterThan(0)

    // Học mẫu từ chính tài liệu này → kiểm tra theo mẫu đó: 0 lỗi
    const learned = await format.createTemplateFromDocument(id)
    const second = await format.check(id, learned.id)
    expect(second.issues).toEqual([])
    expect(second.templateName).toBe(learned.name)
    expect(format.getLatest(id)).toEqual(second)

    // Xóa mẫu: lịch sử kiểm tra vẫn còn (templateId về null)
    templates.remove(learned.id)
    expect(format.getLatest(id)).toMatchObject({ templateId: null, templateName: learned.name })
  })

  it('không phải DOCX: báo lỗi dễ hiểu', async () => {
    const path = join(userDir, 'x.txt')
    await writeFile(path, 'abc')
    const { imported } = await docs.importFiles([path], null)
    await expect(format.check(imported[0].id)).rejects.toThrow(UserError)
    await expect(format.createTemplateFromDocument(imported[0].id)).rejects.toThrow(UserError)
  })

  it('xuất báo cáo Markdown và DOCX có tên mẫu', async () => {
    const id = await importDocx('Bao cao.docx', p(LONG) + SECT_OK)
    await expect(format.exportReport(id, 'md', join(root, 'x.md'))).rejects.toThrow('Kiểm tra')
    await format.check(id)

    expect(format.suggestReportName(id, 'md')).toBe('Bao cao - bao cao dinh dang.md')

    const md = await readFile(await format.exportReport(id, 'md', join(root, 'r.md')), 'utf8')
    expect(md).toContain('# Báo cáo kiểm tra định dạng')
    expect(md).toContain(`**Mẫu định dạng:** ${DEFAULT_TEMPLATE_NAME}`)
    expect(md).toContain('| Font chữ | 1 |')
    expect(md).toContain('Đoạn 1 (Thân bài)')

    const docxPath = await format.exportReport(id, 'docx', join(root, 'r.docx'))
    const report = await loadDocx(await readFile(docxPath))
    const text = report.paragraphs.map((x) => x.text).join('\n')
    expect(text).toContain('BÁO CÁO KIỂM TRA ĐỊNH DẠNG')
    expect(text).toContain('Bao cao.docx')
    expect(text).toContain(DEFAULT_TEMPLATE_NAME)
  })

  it('không bao giờ ghi báo cáo đè lên file gốc hoặc bản sao', async () => {
    const id = await importDocx('goc.docx', p(LONG) + SECT_OK)
    await format.check(id)
    const original = await readFile(join(userDir, 'goc.docx'))

    await expect(format.exportReport(id, 'docx', join(userDir, 'goc.docx'))).rejects.toThrow(
      UserError
    )
    await expect(format.exportReport(id, 'docx', join(userDir, 'GOC.DOCX'))).rejects.toThrow(
      UserError
    )
    await expect(format.exportReport(id, 'docx', docs.getStoredPath(id))).rejects.toThrow(UserError)
    expect(await readFile(join(userDir, 'goc.docx'))).toEqual(original)
  })

  it('tự sửa: lưu file mới, thêm vào thư viện, file gốc giữ nguyên', async () => {
    const id = await importDocx('Bao cao.docx', p(LONG) + SECT_OK)
    const original = await readFile(join(userDir, 'Bao cao.docx'))
    expect(format.suggestFixedName(id)).toBe('Bao cao - da sua dinh dang.docx')

    const target = join(root, 'Bao cao - da sua dinh dang.docx')
    const r = await format.autoFix(id, null, target)
    expect(r).toMatchObject({ issuesAfter: 0, path: target, remainingRules: [] })
    expect(r.issuesBefore).toBeGreaterThan(0)
    expect(r.newDocumentId).not.toBeNull()
    expect(await readFile(join(userDir, 'Bao cao.docx'))).toEqual(original)

    // Bản đã sửa nằm trong thư viện, kiểm tra lại: 0 lỗi
    const recheck = await format.check(r.newDocumentId!)
    expect(recheck.issues).toEqual([])

    await expect(format.autoFix(id, null, join(userDir, 'Bao cao.docx'))).rejects.toThrow(UserError)
  })

  it('xóa tài liệu thì xóa luôn lịch sử kiểm tra', async () => {
    const id = await importDocx('a.docx', p(LONG) + SECT_OK)
    await format.check(id)
    await docs.remove(id)
    expect(format.getLatest(id)).toBeNull()
  })
})
