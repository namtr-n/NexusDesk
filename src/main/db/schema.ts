/**
 * Cấu trúc database (các bảng). Sửa file này xong chạy `npm run db:generate`
 * để Drizzle tạo file migration SQL trong thư mục drizzle/.
 * Thiết kế đầy đủ cho các giai đoạn sau: docs/ARCHITECTURE.md.
 */
import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core'
import type { DocumentKind, ExtractStatus } from '@shared/ipc-contract'
import type { AiTask } from '@shared/ai'

export const projects = sqliteTable('projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
})

export const activityLog = sqliteTable(
  'activity_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    type: text('type').notNull(),
    message: text('message').notNull(),
    projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
    createdAt: integer('created_at').notNull()
  },
  (t) => [index('activity_log_created_at_idx').on(t.createdAt)]
)

/** Tài liệu đã nhập. File được SAO CHÉP vào thư mục documents/ của app, file gốc không bị đụng tới. */
export const documents = sqliteTable(
  'documents',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    kind: text('kind').$type<DocumentKind>().notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256').notNull(),
    /** Đường dẫn file gốc lúc nhập (chỉ để tham khảo, không bao giờ ghi vào) */
    sourcePath: text('source_path').notNull(),
    /** Tên file bản sao trong thư mục documents/ của app */
    storedFile: text('stored_file').notNull(),
    extractStatus: text('extract_status').$type<ExtractStatus>().notNull(),
    extractMessage: text('extract_message'),
    charCount: integer('char_count').notNull().default(0),
    pageCount: integer('page_count'),
    importedAt: integer('imported_at').notNull()
  },
  (t) => [
    index('documents_project_idx').on(t.projectId),
    index('documents_sha256_idx').on(t.sha256),
    index('documents_imported_at_idx').on(t.importedAt)
  ]
)

/** Cài đặt dạng key → giá trị JSON (quy tắc định dạng, sau này: API key đã mã hóa...). */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull()
})

/** Mẫu định dạng: thông số mong muốn cho từng loại đoạn (spec_json = TemplateSpec). */
export const formatTemplates = sqliteTable('format_templates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  /** Tên file mẫu đã dùng để học (null nếu tạo tay / mẫu có sẵn) */
  sourceName: text('source_name'),
  specJson: text('spec_json').notNull(),
  /** TemplateLearnInfo: số đoạn đã học, cảnh báo */
  learnedJson: text('learned_json'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
})

/** Mỗi lần kiểm tra định dạng một tài liệu (lưu cả mẫu lúc kiểm tra để xuất báo cáo đúng). */
export const formatChecks = sqliteTable(
  'format_checks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    documentId: integer('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    checkedAt: integer('checked_at').notNull(),
    issueCount: integer('issue_count').notNull(),
    templateId: integer('template_id').references(() => formatTemplates.id, {
      onDelete: 'set null'
    }),
    templateName: text('template_name'),
    /** TemplateSpec dùng lúc kiểm tra (tên cột cũ giữ nguyên) */
    specJson: text('rules_json').notNull(),
    statsJson: text('stats_json').notNull(),
    issuesJson: text('issues_json').notNull()
  },
  (t) => [index('format_checks_document_idx').on(t.documentId, t.checkedAt)]
)

/** Mỗi lượt gọi AI (để thống kê mức sử dụng, chi phí, lỗi). */
export const aiUsage = sqliteTable(
  'ai_usage',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    task: text('task').notNull(),
    model: text('model').notNull(),
    documentId: integer('document_id').references(() => documents.id, { onDelete: 'set null' }),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    durationMs: integer('duration_ms').notNull(),
    /** ok | error | cancelled */
    status: text('status').notNull(),
    error: text('error'),
    createdAt: integer('created_at').notNull()
  },
  (t) => [index('ai_usage_created_at_idx').on(t.createdAt)]
)

/** Kết quả AI phân tích tài liệu (giữ lịch sử, giao diện hiện bản mới nhất mỗi tác vụ). */
export const aiAnalyses = sqliteTable(
  'ai_analyses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    documentId: integer('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    task: text('task').$type<AiTask>().notNull(),
    model: text('model').notNull(),
    content: text('content').notNull(),
    truncated: integer('truncated', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull()
  },
  (t) => [index('ai_analyses_document_idx').on(t.documentId, t.task, t.createdAt)]
)

/** Nội dung chữ trích từ tài liệu (tách bảng riêng vì có thể rất lớn). */
export const documentText = sqliteTable('document_text', {
  documentId: integer('document_id')
    .primaryKey()
    .references(() => documents.id, { onDelete: 'cascade' }),
  content: text('content').notNull()
})
