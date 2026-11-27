/**
 * "Hợp đồng" giữa giao diện (renderer) và main process:
 * - Schema zod: quy tắc dữ liệu hợp lệ. Main dùng để kiểm tra mọi dữ liệu nhận vào,
 *   giao diện dùng để báo lỗi sớm trên form.
 * - Kiểu dữ liệu trả về và interface NexusApi (window.nexus).
 */
import { z } from 'zod'
import type { FormatCheckResult, FormatRules } from './format'

/** Mọi lời gọi IPC đều trả về dạng này: thành công kèm data, hoặc thất bại kèm thông báo lỗi. */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

// ---------- Dự án ----------

const projectName = z
  .string('Tên dự án phải là chữ')
  .trim()
  .min(1, 'Tên dự án không được để trống')
  .max(100, 'Tên dự án tối đa 100 ký tự')

const projectDescription = z
  .string('Mô tả phải là chữ')
  .trim()
  .max(500, 'Mô tả tối đa 500 ký tự')
  .default('')

const entityId = z.number('Mã không hợp lệ').int('Mã không hợp lệ').positive('Mã không hợp lệ')

export const projectCreateSchema = z.object({
  name: projectName,
  description: projectDescription
})

export const projectUpdateSchema = z.object({
  id: entityId,
  name: projectName,
  description: projectDescription
})

export const projectRemoveSchema = z.object({ id: entityId })

export type ProjectCreateInput = z.input<typeof projectCreateSchema>
export type ProjectUpdateInput = z.input<typeof projectUpdateSchema>
export type ProjectRemoveInput = z.input<typeof projectRemoveSchema>

export interface Project {
  id: number
  name: string
  description: string
  /** Thời điểm tính bằng mili-giây (Date.now()) */
  createdAt: number
  updatedAt: number
}

// ---------- Nhật ký hoạt động ----------

export const activityListSchema = z
  .object({
    limit: z.number().int().min(1).max(100).default(20)
  })
  .default({ limit: 20 })

export type ActivityListInput = z.input<typeof activityListSchema>

export type ActivityType =
  | 'project.created'
  | 'project.updated'
  | 'project.deleted'
  | 'document.imported'
  | 'document.deleted'
  | 'format.checked'

export interface ActivityEntry {
  id: number
  type: string
  message: string
  projectId: number | null
  createdAt: number
}

// ---------- Tài liệu ----------

export type DocumentKind = 'docx' | 'pdf' | 'txt'
/** ok: đọc được chữ · empty: không có chữ (ví dụ PDF ảnh scan) */
export type ExtractStatus = 'ok' | 'empty'

const projectRef = z.union([entityId, z.null()])

export const documentImportSchema = z
  .object({ projectId: projectRef.default(null) })
  .default({ projectId: null })

/** projectId bỏ trống = tất cả; null = chưa gắn dự án; số = theo dự án */
export const documentListSchema = z.object({ projectId: projectRef.optional() }).default({})

export const documentIdSchema = z.object({ id: entityId })

export const documentSetProjectSchema = z.object({ id: entityId, projectId: projectRef })

export type DocumentImportInput = z.input<typeof documentImportSchema>
export type DocumentListInput = z.input<typeof documentListSchema>
export type DocumentIdInput = z.input<typeof documentIdSchema>
export type DocumentSetProjectInput = z.input<typeof documentSetProjectSchema>

export interface DocumentSummary {
  id: number
  projectId: number | null
  name: string
  kind: DocumentKind
  sizeBytes: number
  extractStatus: ExtractStatus
  extractMessage: string | null
  charCount: number
  pageCount: number | null
  importedAt: number
}

export interface DocumentDetail extends DocumentSummary {
  /** Nội dung chữ (có thể bị cắt bớt nếu quá dài) */
  text: string
  textTruncated: boolean
}

export interface ImportResult {
  /** Người dùng bấm Hủy ở hộp thoại chọn file */
  cancelled: boolean
  imported: DocumentSummary[]
  skipped: { name: string; reason: string }[]
}

// ---------- Kiểm tra định dạng ----------

export const formatExportSchema = z.object({
  documentId: entityId,
  format: z.enum(['docx', 'md'])
})
export type FormatExportInput = z.input<typeof formatExportSchema>

export interface ExportResult {
  cancelled: boolean
  path: string | null
}

// ---------- Thông tin app ----------

export interface AppInfo {
  version: string
  dataPath: string
  databasePath: string
  logPath: string
}

// ---------- API mà preload mở cho giao diện qua window.nexus ----------

export interface NexusApi {
  app: {
    getInfo(): Promise<Result<AppInfo>>
  }
  projects: {
    list(): Promise<Result<Project[]>>
    create(input: ProjectCreateInput): Promise<Result<Project>>
    update(input: ProjectUpdateInput): Promise<Result<Project>>
    remove(input: ProjectRemoveInput): Promise<Result<{ id: number }>>
  }
  activity: {
    listRecent(input?: ActivityListInput): Promise<Result<ActivityEntry[]>>
  }
  documents: {
    /** Mở hộp thoại chọn file (do main process hiện) rồi nhập các file đã chọn */
    pickAndImport(input?: DocumentImportInput): Promise<Result<ImportResult>>
    list(input?: DocumentListInput): Promise<Result<DocumentSummary[]>>
    get(input: DocumentIdInput): Promise<Result<DocumentDetail>>
    remove(input: DocumentIdInput): Promise<Result<{ id: number }>>
    setProject(input: DocumentSetProjectInput): Promise<Result<DocumentSummary>>
  }
  format: {
    getRules(): Promise<Result<FormatRules>>
    saveRules(input: FormatRules): Promise<Result<FormatRules>>
    resetRules(): Promise<Result<FormatRules>>
    check(input: DocumentIdInput): Promise<Result<FormatCheckResult>>
    getLatest(input: DocumentIdInput): Promise<Result<FormatCheckResult | null>>
    /** Mở hộp thoại "Lưu thành" (do main hiện) rồi ghi báo cáo */
    exportReport(input: FormatExportInput): Promise<Result<ExportResult>>
  }
}
