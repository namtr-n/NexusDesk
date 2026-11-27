import { createHash } from 'crypto'
import { existsSync } from 'fs'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseHandle } from '../../src/main/db/client'
import { UserError } from '../../src/main/errors'
import { createActivityRepository } from '../../src/main/services/activity/activity-repository'
import {
  createDocumentService,
  type DocumentService
} from '../../src/main/services/documents/document-service'
import { createProjectService } from '../../src/main/services/projects/project-service'
import { makeDocx, makePdf } from './fixtures'
import { createTestDatabase } from './test-db'

describe('DocumentService', () => {
  let database: DatabaseHandle
  let docs: DocumentService
  let root: string
  let userDir: string
  let storageDir: string
  let createProject: (name: string) => number

  const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')

  async function userFile(name: string, data: Buffer | string): Promise<string> {
    const path = join(userDir, name)
    await writeFile(path, data)
    return path
  }

  beforeEach(async () => {
    database = createTestDatabase()
    root = await mkdtemp(join(tmpdir(), 'nexus-docs-'))
    userDir = join(root, 'user')
    storageDir = join(root, 'storage')
    await mkdir(userDir)
    await mkdir(storageDir)
    const activity = createActivityRepository(database.db)
    const projects = createProjectService(database.db, activity)
    createProject = (name) => projects.create({ name, description: '' }).id
    docs = createDocumentService({
      db: database.db,
      activity,
      storageDir,
      logger: { error: vi.fn() }
    })
  })

  afterEach(async () => {
    database.close()
    await rm(root, { recursive: true, force: true })
  })

  it('nhập DOCX, PDF, TXT: đọc được chữ, sao chép vào thư mục app', async () => {
    const paths = [
      await userFile('bao-cao.docx', await makeDocx(['Chương 1. Mở đầu'])),
      await userFile('slide.pdf', makePdf(['Lecture 1'])),
      await userFile('ghi-chu.txt', 'Ghi chú môn học')
    ]
    const r = await docs.importFiles(paths, null)

    expect(r.skipped).toEqual([])
    expect(r.imported.map((d) => [d.name, d.kind, d.extractStatus])).toEqual([
      ['bao-cao.docx', 'docx', 'ok'],
      ['slide.pdf', 'pdf', 'ok'],
      ['ghi-chu.txt', 'txt', 'ok']
    ])
    expect(r.imported[1].pageCount).toBe(1)
    expect(await readdir(storageDir)).toHaveLength(3)
    expect(docs.get(r.imported[0].id).text).toContain('Chương 1. Mở đầu')
  })

  it('file gốc không bị thay đổi, bản sao giống hệt file gốc', async () => {
    const original = await makeDocx(['Nội dung gốc'])
    const path = await userFile('goc.docx', original)
    const { imported } = await docs.importFiles([path], null)

    expect(sha(await readFile(path))).toBe(sha(original))
    expect(sha(await readFile(docs.getStoredPath(imported[0].id)))).toBe(sha(original))
  })

  it('bỏ qua: định dạng lạ, .doc cũ, file rỗng, file trùng, file hỏng', async () => {
    const txt = await userFile('a.txt', 'trùng nội dung')
    await docs.importFiles([txt], null)

    const r = await docs.importFiles(
      [
        await userFile('anh.png', 'png'),
        await userFile('cu.doc', 'doc'),
        await userFile('rong.txt', ''),
        await userFile('b.txt', 'trùng nội dung'),
        await userFile('hong.docx', 'không phải docx')
      ],
      null
    )
    expect(r.imported).toEqual([])
    expect(r.skipped.map((s) => s.name)).toEqual([
      'anh.png',
      'cu.doc',
      'rong.txt',
      'b.txt',
      'hong.docx'
    ])
    expect(r.skipped[1].reason).toContain('.docx')
    expect(r.skipped[3].reason).toContain('a.txt')
    // File hỏng không để lại bản sao rác
    expect(await readdir(storageDir)).toHaveLength(1)
  })

  it('PDF không có chữ: vẫn nhập nhưng đánh dấu empty kèm lời giải thích', async () => {
    const { imported } = await docs.importFiles([await userFile('scan.pdf', makePdf([]))], null)
    expect(imported[0].extractStatus).toBe('empty')
    expect(imported[0].extractMessage).toContain('ảnh scan')
  })

  it('lọc theo dự án và đổi dự án', async () => {
    const p1 = createProject('Đồ án')
    const { imported } = await docs.importFiles([await userFile('x.txt', 'x')], p1)
    await docs.importFiles([await userFile('y.txt', 'y')], null)

    expect(docs.list().map((d) => d.name)).toEqual(['y.txt', 'x.txt'])
    expect(docs.list(p1).map((d) => d.name)).toEqual(['x.txt'])
    expect(docs.list(null).map((d) => d.name)).toEqual(['y.txt'])

    docs.setProject(imported[0].id, null)
    expect(docs.list(null)).toHaveLength(2)
  })

  it('dự án không tồn tại: báo lỗi dễ hiểu', async () => {
    const path = await userFile('x.txt', 'x')
    await expect(docs.importFiles([path], 999)).rejects.toThrow(UserError)
  })

  it('xóa: xóa bản sao và dữ liệu, giữ nguyên file gốc', async () => {
    const path = await userFile('x.txt', 'nội dung')
    const { imported } = await docs.importFiles([path], null)
    const stored = docs.getStoredPath(imported[0].id)

    await docs.remove(imported[0].id)
    expect(existsSync(stored)).toBe(false)
    expect(existsSync(path)).toBe(true)
    expect(docs.list()).toEqual([])
    expect(() => docs.get(imported[0].id)).toThrow(UserError)
  })

  it('xem trước: cắt bớt văn bản quá dài', async () => {
    const big = 'a'.repeat(250_000)
    const { imported } = await docs.importFiles([await userFile('big.txt', big)], null)
    const detail = docs.get(imported[0].id)
    expect(detail.charCount).toBe(250_000)
    expect(detail.text).toHaveLength(200_000)
    expect(detail.textTruncated).toBe(true)
  })
})
