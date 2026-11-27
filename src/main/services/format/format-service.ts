import { readFile, writeFile } from 'fs/promises'
import { resolve } from 'path'
import { desc, eq } from 'drizzle-orm'
import { templateSpecSchema, type FormatCheckResult, type ReportFormat } from '@shared/format'
import type { AppDatabase } from '../../db/client'
import { formatChecks } from '../../db/schema'
import { UserError } from '../../errors'
import type { ErrorLogger } from '../../ipc/handler'
import type { ActivityRepository } from '../activity/activity-repository'
import type { DocumentService } from '../documents/document-service'
import { checkFormat } from './check'
import { loadDocx } from './docx-model'
import { buildMarkdown, buildReportDocx } from './report'
import type { TemplateService } from './template-service'

export interface FormatService {
  /** Kiểm tra theo mẫu đã chọn; không truyền templateId = dùng mẫu mặc định */
  check(documentId: number, templateId?: number | null): Promise<FormatCheckResult>
  getLatest(documentId: number): FormatCheckResult | null
  /** Ghi báo cáo của lần kiểm tra gần nhất ra file (đường dẫn do main chọn qua hộp thoại) */
  exportReport(documentId: number, format: ReportFormat, targetPath: string): Promise<string>
  /** Tên file gợi ý cho báo cáo */
  suggestReportName(documentId: number, format: ReportFormat): string
  /** Học mẫu từ một tài liệu DOCX đã có trong thư viện */
  createTemplateFromDocument(documentId: number): ReturnType<TemplateService['createFromDocx']>
}

export interface FormatServiceDeps {
  db: AppDatabase
  documents: DocumentService
  templates: TemplateService
  activity: ActivityRepository
  logger: ErrorLogger
}

export function createFormatService(deps: FormatServiceDeps): FormatService {
  const { db, documents, templates, activity, logger } = deps

  function getLatest(documentId: number): FormatCheckResult | null {
    const row = db
      .select()
      .from(formatChecks)
      .where(eq(formatChecks.documentId, documentId))
      .orderBy(desc(formatChecks.checkedAt), desc(formatChecks.id))
      .limit(1)
      .get()
    if (!row) return null
    // Kết quả từ phiên bản cũ (trước khi có mẫu) không đọc được → coi như chưa kiểm tra
    const spec = templateSpecSchema.safeParse(JSON.parse(row.specJson))
    if (!spec.success) return null
    return {
      id: row.id,
      documentId: row.documentId,
      checkedAt: row.checkedAt,
      templateId: row.templateId,
      templateName: row.templateName ?? 'Không rõ',
      spec: spec.data,
      stats: JSON.parse(row.statsJson),
      issues: JSON.parse(row.issuesJson)
    }
  }

  async function readDocxOf(documentId: number): Promise<{ data: Buffer; name: string }> {
    const doc = documents.getSummary(documentId)
    if (doc.kind !== 'docx') throw new UserError('Chỉ dùng được file DOCX.')
    return { data: await readFile(documents.getStoredPath(documentId)), name: doc.name }
  }

  return {
    async check(documentId, templateId) {
      const doc = documents.getSummary(documentId)
      const template =
        templateId === undefined || templateId === null
          ? templates.getDefault()
          : templates.get(templateId)
      const { data } = await readDocxOf(documentId)
      let model
      try {
        model = await loadDocx(data)
      } catch (err) {
        logger.error(`[format] không đọc được cấu trúc ${doc.name}`, err)
        throw new UserError('Không đọc được cấu trúc file DOCX (file có thể bị hỏng).')
      }

      const { stats, issues } = checkFormat(model, template.spec)
      const checkedAt = Date.now()

      return db.transaction(() => {
        const row = db
          .insert(formatChecks)
          .values({
            documentId,
            checkedAt,
            issueCount: issues.length,
            templateId: template.id,
            templateName: template.name,
            specJson: JSON.stringify(template.spec),
            statsJson: JSON.stringify(stats),
            issuesJson: JSON.stringify(issues)
          })
          .returning({ id: formatChecks.id })
          .get()
        activity.log({
          type: 'format.checked',
          message: `Kiểm tra "${doc.name}" theo mẫu "${template.name}": ${issues.length === 0 ? 'không có lỗi' : `${issues.length} lỗi`}`,
          projectId: doc.projectId
        })
        return {
          id: row.id,
          documentId,
          checkedAt,
          templateId: template.id,
          templateName: template.name,
          spec: template.spec,
          stats,
          issues
        }
      })
    },

    getLatest,

    async exportReport(documentId, format, targetPath) {
      const doc = documents.getSummary(documentId)
      const result = getLatest(documentId)
      if (!result) throw new UserError('Chưa có kết quả kiểm tra. Hãy bấm "Kiểm tra" trước.')
      // Không bao giờ ghi đè file gốc hay bản sao làm việc của tài liệu
      const same = (a: string, b: string): boolean =>
        resolve(a).toLowerCase() === resolve(b).toLowerCase()
      if (
        same(targetPath, documents.getSourcePath(documentId)) ||
        same(targetPath, documents.getStoredPath(documentId))
      ) {
        throw new UserError(
          'Không thể lưu báo cáo đè lên chính tài liệu gốc. Hãy chọn tên file khác.'
        )
      }
      const content =
        format === 'md'
          ? Buffer.from(buildMarkdown(doc.name, result), 'utf8')
          : await buildReportDocx(doc.name, result)
      await writeFile(targetPath, content)
      return targetPath
    },

    suggestReportName(documentId, format) {
      const base = documents.getSummary(documentId).name.replace(/\.docx$/i, '')
      return `${base} - bao cao dinh dang.${format}`
    },

    async createTemplateFromDocument(documentId) {
      const { data, name } = await readDocxOf(documentId)
      return templates.createFromDocx(data, name)
    }
  }
}
