import { createHash, randomUUID } from 'crypto'
import { readFile, rm, stat, writeFile } from 'fs/promises'
import { basename, extname, join } from 'path'
import { and, desc, eq, isNull, type SQL } from 'drizzle-orm'
import type {
  DocumentDetail,
  DocumentKind,
  DocumentSummary,
  ImportResult
} from '@shared/ipc-contract'
import type { AppDatabase } from '../../db/client'
import { documents, documentText, projects } from '../../db/schema'
import { UserError } from '../../errors'
import type { ErrorLogger } from '../../ipc/handler'
import type { ActivityRepository } from '../activity/activity-repository'
import { extractText } from './extract'

export const MAX_FILE_BYTES = 50 * 1024 * 1024
/** Giới hạn số ký tự gửi sang giao diện để xem trước */
export const PREVIEW_CHARS = 200_000

const KIND_BY_EXT: Record<string, DocumentKind> = {
  '.docx': 'docx',
  '.pdf': 'pdf',
  '.txt': 'txt'
}

const NOT_FOUND = 'Không tìm thấy tài liệu. Có thể nó đã bị xóa.'

export interface DocumentServiceDeps {
  db: AppDatabase
  activity: ActivityRepository
  /** Thư mục chứa bản sao tài liệu (đã tồn tại) */
  storageDir: string
  logger: ErrorLogger
}

export interface DocumentService {
  importFiles(paths: string[], projectId: number | null): Promise<ImportResult>
  list(projectId?: number | null): DocumentSummary[]
  get(id: number): DocumentDetail
  remove(id: number): Promise<{ id: number }>
  setProject(id: number, projectId: number | null): DocumentSummary
  getSummary(id: number): DocumentSummary
  /** Đường dẫn bản sao làm việc (dùng cho kiểm tra định dạng, AI...) */
  getStoredPath(id: number): string
  /** Đường dẫn file gốc lúc nhập (chỉ để so sánh, KHÔNG được ghi vào) */
  getSourcePath(id: number): string
}

const summaryColumns = {
  id: documents.id,
  projectId: documents.projectId,
  name: documents.name,
  kind: documents.kind,
  sizeBytes: documents.sizeBytes,
  extractStatus: documents.extractStatus,
  extractMessage: documents.extractMessage,
  charCount: documents.charCount,
  pageCount: documents.pageCount,
  importedAt: documents.importedAt
}

function emptyMessage(kind: DocumentKind): string {
  return kind === 'pdf'
    ? 'PDF không có lớp chữ (có thể là ảnh scan). Chưa hỗ trợ đọc chữ từ ảnh.'
    : 'Tài liệu không có nội dung chữ.'
}

export function createDocumentService(deps: DocumentServiceDeps): DocumentService {
  const { db, activity, storageDir, logger } = deps

  function findSummary(id: number): DocumentSummary {
    const row = db.select(summaryColumns).from(documents).where(eq(documents.id, id)).get()
    if (!row) throw new UserError(NOT_FOUND)
    return row
  }

  function assertProjectExists(projectId: number | null): void {
    if (projectId === null) return
    const p = db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).get()
    if (!p) throw new UserError('Dự án đã chọn không còn tồn tại.')
  }

  async function importOne(
    path: string,
    projectId: number | null
  ): Promise<{ ok: DocumentSummary } | { skip: string }> {
    const name = basename(path)
    const ext = extname(name).toLowerCase()
    const kind = KIND_BY_EXT[ext]
    if (!kind) {
      return {
        skip:
          ext === '.doc'
            ? 'File .doc (Word cũ) chưa hỗ trợ, hãy lưu lại thành .docx'
            : 'Chỉ hỗ trợ DOCX, PDF, TXT'
      }
    }

    const info = await stat(path)
    if (!info.isFile()) return { skip: 'Không phải file' }
    if (info.size === 0) return { skip: 'File rỗng' }
    if (info.size > MAX_FILE_BYTES) return { skip: 'File lớn hơn 50 MB' }

    // Đọc file gốc MỘT lần vào bộ nhớ; mọi việc sau đó làm trên bản trong bộ nhớ.
    const data = await readFile(path)
    const sha256 = createHash('sha256').update(data).digest('hex')

    const existing = db
      .select({ name: documents.name })
      .from(documents)
      .where(eq(documents.sha256, sha256))
      .get()
    if (existing) return { skip: `Đã có trong thư viện (tên "${existing.name}")` }

    let extracted
    try {
      extracted = await extractText(data, kind)
    } catch (err) {
      logger.error(`[documents] không đọc được ${name}`, err)
      return { skip: 'Không đọc được nội dung: file có thể bị hỏng hoặc có mật khẩu' }
    }

    const storedFile = `${randomUUID()}.${kind}`
    const storedPath = join(storageDir, storedFile)
    await writeFile(storedPath, data, { flag: 'wx' })

    try {
      const hasText = extracted.text.length > 0
      const summary = db.transaction(() => {
        const row = db
          .insert(documents)
          .values({
            projectId,
            name,
            kind,
            sizeBytes: data.length,
            sha256,
            sourcePath: path,
            storedFile,
            extractStatus: hasText ? 'ok' : 'empty',
            extractMessage: hasText ? null : emptyMessage(kind),
            charCount: extracted.text.length,
            pageCount: extracted.pageCount,
            importedAt: Date.now()
          })
          .returning(summaryColumns)
          .get()
        db.insert(documentText).values({ documentId: row.id, content: extracted.text }).run()
        activity.log({
          type: 'document.imported',
          message: `Nhập tài liệu "${name}"`,
          projectId
        })
        return row
      })
      return { ok: summary }
    } catch (err) {
      await rm(storedPath, { force: true })
      throw err
    }
  }

  return {
    async importFiles(paths, projectId) {
      assertProjectExists(projectId)
      const result: ImportResult = { cancelled: false, imported: [], skipped: [] }
      for (const path of paths) {
        const outcome = await importOne(path, projectId)
        if ('ok' in outcome) result.imported.push(outcome.ok)
        else result.skipped.push({ name: basename(path), reason: outcome.skip })
      }
      return result
    },

    list(projectId) {
      let where: SQL | undefined
      if (projectId === null) where = isNull(documents.projectId)
      else if (projectId !== undefined) where = eq(documents.projectId, projectId)
      return db
        .select(summaryColumns)
        .from(documents)
        .where(and(where))
        .orderBy(desc(documents.importedAt), desc(documents.id))
        .all()
    },

    get(id) {
      const summary = findSummary(id)
      const row = db
        .select({ content: documentText.content })
        .from(documentText)
        .where(eq(documentText.documentId, id))
        .get()
      const full = row?.content ?? ''
      return {
        ...summary,
        text: full.slice(0, PREVIEW_CHARS),
        textTruncated: full.length > PREVIEW_CHARS
      }
    },

    async remove(id) {
      const row = db
        .select({ name: documents.name, storedFile: documents.storedFile })
        .from(documents)
        .where(eq(documents.id, id))
        .get()
      if (!row) throw new UserError(NOT_FOUND)
      db.transaction(() => {
        db.delete(documents).where(eq(documents.id, id)).run()
        activity.log({
          type: 'document.deleted',
          message: `Xóa tài liệu "${row.name}" khỏi thư viện`
        })
      })
      // Chỉ xóa BẢN SAO trong thư mục của app. File gốc của người dùng không bị đụng tới.
      await rm(join(storageDir, row.storedFile), { force: true })
      return { id }
    },

    setProject(id, projectId) {
      assertProjectExists(projectId)
      const row = db
        .update(documents)
        .set({ projectId })
        .where(eq(documents.id, id))
        .returning(summaryColumns)
        .get()
      if (!row) throw new UserError(NOT_FOUND)
      return row
    },

    getStoredPath(id) {
      const row = db
        .select({ storedFile: documents.storedFile })
        .from(documents)
        .where(eq(documents.id, id))
        .get()
      if (!row) throw new UserError(NOT_FOUND)
      return join(storageDir, row.storedFile)
    },

    getSummary: findSummary,

    getSourcePath(id) {
      const row = db
        .select({ sourcePath: documents.sourcePath })
        .from(documents)
        .where(eq(documents.id, id))
        .get()
      if (!row) throw new UserError(NOT_FOUND)
      return row.sourcePath
    }
  }
}
