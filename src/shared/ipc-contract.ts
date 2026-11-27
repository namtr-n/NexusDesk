/**
 * "Hợp đồng" giữa giao diện (renderer) và main process:
 * - Schema zod: quy tắc dữ liệu hợp lệ. Main dùng để kiểm tra mọi dữ liệu nhận vào,
 *   giao diện dùng để báo lỗi sớm trên form.
 * - Kiểu dữ liệu trả về và interface NexusApi (window.nexus).
 */
import { z } from 'zod'
import {
  AI_TASKS,
  apiKeySchema,
  modelIdSchema,
  type AiAnalysis,
  type AiChunkEvent,
  type AiModelOption,
  type AiStatus,
  type AiTestResult
} from './ai'
import type { PolishOutcome, PolishProgressEvent, PolishRunInput } from './polish'
import type {
  Prompt,
  PromptCreateInput,
  PromptIdInput,
  PromptListInput,
  PromptRestoreInput,
  PromptSummary,
  PromptUpdateInput,
  PromptVersion
} from './prompts'
import {
  templateNameSchema,
  templateSpecSchema,
  type AutoFixResult,
  type FormatCheckResult,
  type FormatTemplate,
  type FormatTemplateSummary
} from './format'

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
  | 'format.fixed'
  | 'ai.analyzed'
  | 'ai.polished'
  | 'prompt.created'
  | 'prompt.deleted'

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

export const formatCheckSchema = z.object({
  id: entityId,
  templateId: z.union([entityId, z.null()]).optional()
})
export type FormatCheckInput = z.input<typeof formatCheckSchema>

export const formatAutoFixSchema = z.object({
  documentId: entityId,
  templateId: z.union([entityId, z.null()]).optional()
})
export type FormatAutoFixInput = z.input<typeof formatAutoFixSchema>

export interface AutoFixOutcome {
  /** Người dùng bấm Hủy ở hộp thoại "Lưu thành" */
  cancelled: boolean
  result: AutoFixResult | null
}

// ---------- AI ----------

const requestIdSchema = z.string().regex(/^[A-Za-z0-9-]{8,64}$/, 'Mã yêu cầu không hợp lệ')

export const aiSetKeySchema = z.object({ apiKey: apiKeySchema })
export const aiSetModelSchema = z.object({ model: modelIdSchema.nullable() })
export const aiAnalyzeSchema = z.object({
  documentId: entityId,
  task: z.enum(AI_TASKS),
  requestId: requestIdSchema
})
export const aiCancelSchema = z.object({ requestId: requestIdSchema })
export const aiAnalyzeWithPromptSchema = z.object({
  documentId: entityId,
  promptId: entityId,
  requestId: requestIdSchema
})
export type AiAnalyzeWithPromptInput = z.input<typeof aiAnalyzeWithPromptSchema>

export type AiSetKeyInput = z.input<typeof aiSetKeySchema>
export type AiSetModelInput = z.input<typeof aiSetModelSchema>
export type AiAnalyzeInput = z.input<typeof aiAnalyzeSchema>
export type AiCancelInput = z.input<typeof aiCancelSchema>

// ---------- Mẫu định dạng ----------

export const templateIdSchema = z.object({ id: entityId })
export const templatePresetSchema = z.object({ name: templateNameSchema })
export const templateUpdateSchema = z.object({
  id: entityId,
  name: templateNameSchema,
  spec: templateSpecSchema
})

export type TemplateIdInput = z.input<typeof templateIdSchema>
export type TemplatePresetInput = z.input<typeof templatePresetSchema>
export type TemplateUpdateInput = z.input<typeof templateUpdateSchema>

export interface TemplateFromFileResult {
  cancelled: boolean
  template: FormatTemplate | null
}

// ---------- Thư mục kết quả ----------

export interface OutputDirInfo {
  path: string
  /** Đang dùng thư mục mặc định (Tài liệu\file báo cáo lưu trữ) */
  isDefault: boolean
}

export const revealFileSchema = z.object({ path: z.string().min(1).max(1000) })
export type RevealFileInput = z.input<typeof revealFileSchema>

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
    /** Thư mục lưu file kết quả (bản đã sửa, bản hoàn thiện, báo cáo lỗi) */
    getOutputDir(): Promise<Result<OutputDirInfo>>
    /** Hộp thoại chọn thư mục (do main hiện) */
    chooseOutputDir(): Promise<Result<OutputDirInfo>>
    resetOutputDir(): Promise<Result<OutputDirInfo>>
    openOutputDir(): Promise<Result<void>>
    /** Mở File Explorer chọn sẵn file kết quả app vừa lưu */
    revealFile(input: RevealFileInput): Promise<Result<void>>
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
    /** Kiểm tra theo mẫu; bỏ trống templateId = mẫu mặc định */
    check(input: FormatCheckInput): Promise<Result<FormatCheckResult>>
    getLatest(input: DocumentIdInput): Promise<Result<FormatCheckResult | null>>
    /** Mở hộp thoại "Lưu thành" (do main hiện) rồi ghi báo cáo */
    exportReport(input: FormatExportInput): Promise<Result<ExportResult>>
    /** Học mẫu định dạng từ một tài liệu DOCX trong thư viện */
    createTemplateFromDocument(input: DocumentIdInput): Promise<Result<FormatTemplate>>
    /** Tự sửa định dạng theo mẫu → hộp thoại "Lưu thành" → file mới (thêm vào thư viện) */
    autoFix(input: FormatAutoFixInput): Promise<Result<AutoFixOutcome>>
  }
  ai: {
    getStatus(): Promise<Result<AiStatus>>
    /** Lưu key (đã mã hóa). Key không bao giờ được trả ngược lại giao diện. */
    setKey(input: AiSetKeyInput): Promise<Result<AiStatus>>
    removeKey(): Promise<Result<AiStatus>>
    /** null = tự chọn bản Flash mới nhất */
    setModel(input: AiSetModelInput): Promise<Result<AiStatus>>
    listModels(): Promise<Result<AiModelOption[]>>
    test(): Promise<Result<AiTestResult>>
    /** Chạy phân tích; trong lúc chạy, từng đoạn chữ được gửi qua onChunk */
    analyze(input: AiAnalyzeInput): Promise<Result<AiAnalysis>>
    /** Chạy một prompt trong thư viện trên tài liệu (stream qua onChunk như analyze) */
    analyzeWithPrompt(input: AiAnalyzeWithPromptInput): Promise<Result<AiAnalysis>>
    cancel(input: AiCancelInput): Promise<Result<boolean>>
    getAnalyses(input: DocumentIdInput): Promise<Result<AiAnalysis[]>>
    /** Đăng ký nhận đoạn chữ đang stream; trả về hàm hủy đăng ký */
    onChunk(listener: (event: AiChunkEvent) => void): () => void
  }
  polish: {
    /** Hộp thoại "Lưu thành" → sửa định dạng + AI hiệu đính (Track Changes) → file mới */
    run(input: PolishRunInput): Promise<Result<PolishOutcome>>
    cancel(input: AiCancelInput): Promise<Result<boolean>>
    onProgress(listener: (event: PolishProgressEvent) => void): () => void
  }
  prompts: {
    /** Tìm kiếm / lọc; không có từ khóa thì sắp theo lần sửa gần nhất */
    list(input?: PromptListInput): Promise<Result<PromptSummary[]>>
    categories(): Promise<Result<{ name: string; count: number }[]>>
    get(input: PromptIdInput): Promise<Result<Prompt>>
    create(input: PromptCreateInput): Promise<Result<Prompt>>
    update(input: PromptUpdateInput): Promise<Result<Prompt>>
    duplicate(input: PromptIdInput): Promise<Result<Prompt>>
    remove(input: PromptIdInput): Promise<Result<{ id: number }>>
    versions(input: PromptIdInput): Promise<Result<PromptVersion[]>>
    restore(input: PromptRestoreInput): Promise<Result<Prompt>>
  }
  templates: {
    list(): Promise<Result<FormatTemplateSummary[]>>
    get(input: TemplateIdInput): Promise<Result<FormatTemplate>>
    createFromPreset(input: TemplatePresetInput): Promise<Result<FormatTemplate>>
    /** Mở hộp thoại chọn file DOCX mẫu (do main hiện) rồi học mẫu */
    createFromFile(): Promise<Result<TemplateFromFileResult>>
    update(input: TemplateUpdateInput): Promise<Result<FormatTemplate>>
    setDefault(input: TemplateIdInput): Promise<Result<FormatTemplate>>
    remove(input: TemplateIdInput): Promise<Result<{ id: number }>>
  }
}
