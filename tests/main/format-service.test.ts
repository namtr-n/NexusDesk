import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_FORMAT_RULES } from '@shared/format'
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
import { createSettingsStore } from '../../src/main/services/settings/settings-store'
import { buildDocx, LONG, p, SECT_OK } from './docx-builder'
import { createTestDatabase } from './test-db'

describe('FormatService', () => {
  let database: DatabaseHandle
  let docs: DocumentService
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
    format = createFormatService({
      db: database.db,
      documents: docs,
      settings: createSettingsStore(database.db),
      activity,
      logger
    })
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

  it('quy tắc: mặc định → lưu → đọc lại → khôi phục mặc định', () => {
    expect(format.getRules()).toEqual(DEFAULT_FORMAT_RULES)
    const custom = { ...DEFAULT_FORMAT_RULES, fontFamily: 'Arial', bodyFontSizePt: 12 }
    format.saveRules(custom)
    expect(format.getRules()).toEqual(custom)
    expect(format.resetRules()).toEqual(DEFAULT_FORMAT_RULES)
    expect(format.getRules()).toEqual(DEFAULT_FORMAT_RULES)
  })

  it('kiểm tra theo quy tắc đang lưu, lưu kết quả, getLatest trả lần mới nhất', async () => {
    const id = await importDocx('a.docx', p(LONG) + SECT_OK)
    expect(format.getLatest(id)).toBeNull()

    const first = await format.check(id)
    expect(first.issues.length).toBeGreaterThan(0)

    format.saveRules({
      ...DEFAULT_FORMAT_RULES,
      fontFamily: 'Calibri',
      bodyFontSizePt: 11,
      lineSpacing: 1.08,
      justifyBody: false,
      firstLineIndentCm: null,
      spaceAfterPt: { min: 0, max: 12 }
    })
    const second = await format.check(id)
    expect(second.issues).toEqual([])
    expect(second.rules.fontFamily).toBe('Calibri')
    expect(format.getLatest(id)).toEqual(second)
  })

  it('không phải DOCX: báo lỗi dễ hiểu', async () => {
    const path = join(userDir, 'x.txt')
    await writeFile(path, 'abc')
    const { imported } = await docs.importFiles([path], null)
    await expect(format.check(imported[0].id)).rejects.toThrow(UserError)
  })

  it('xuất báo cáo Markdown và DOCX', async () => {
    const id = await importDocx('Bao cao.docx', p(LONG) + SECT_OK)
    await expect(format.exportReport(id, 'md', join(root, 'x.md'))).rejects.toThrow('Kiểm tra')
    await format.check(id)

    expect(format.suggestReportName(id, 'md')).toBe('Bao cao - bao cao dinh dang.md')

    const md = await readFile(await format.exportReport(id, 'md', join(root, 'r.md')), 'utf8')
    expect(md).toContain('# Báo cáo kiểm tra định dạng')
    expect(md).toContain('| Font chữ | 1 |')
    expect(md).toContain('Calibri')

    const docxPath = await format.exportReport(id, 'docx', join(root, 'r.docx'))
    const report = await loadDocx(await readFile(docxPath))
    const text = report.paragraphs.map((x) => x.text).join('\n')
    expect(text).toContain('BÁO CÁO KIỂM TRA ĐỊNH DẠNG')
    expect(text).toContain('Bao cao.docx')
    expect(text).toContain('Times New Roman')
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

  it('xóa tài liệu thì xóa luôn lịch sử kiểm tra', async () => {
    const id = await importDocx('a.docx', p(LONG) + SECT_OK)
    await format.check(id)
    await docs.remove(id)
    expect(format.getLatest(id)).toBeNull()
  })
})
