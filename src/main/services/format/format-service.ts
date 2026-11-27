import { readFile, writeFile } from 'fs/promises'
import { resolve } from 'path'
import { desc, eq } from 'drizzle-orm'
import {
  DEFAULT_FORMAT_RULES,
  formatRulesSchema,
  type FormatCheckResult,
  type FormatRules,
  type ReportFormat
} from '@shared/format'
import type { AppDatabase } from '../../db/client'
import { formatChecks } from '../../db/schema'
import { UserError } from '../../errors'
import type { ErrorLogger } from '../../ipc/handler'
import type { ActivityRepository } from '../activity/activity-repository'
import type { DocumentService } from '../documents/document-service'
import type { SettingsStore } from '../settings/settings-store'
import { checkFormat } from './check'
import { loadDocx } from './docx-model'
import { buildMarkdown, buildReportDocx } from './report'

const RULES_KEY = 'format.rules'

export interface FormatService {
  getRules(): FormatRules
  saveRules(rules: FormatRules): FormatRules
  resetRules(): FormatRules
  check(documentId: number): Promise<FormatCheckResult>
  getLatest(documentId: number): FormatCheckResult | null
  /** Ghi báo cáo của lần kiểm tra gần nhất ra file (đường dẫn do main chọn qua hộp thoại) */
  exportReport(documentId: number, format: ReportFormat, targetPath: string): Promise<string>
  /** Tên file gợi ý cho báo cáo */
  suggestReportName(documentId: number, format: ReportFormat): string
}

export interface FormatServiceDeps {
  db: AppDatabase
  documents: DocumentService
  settings: SettingsStore
  activity: ActivityRepository
  logger: ErrorLogger
}

export function createFormatService(deps: FormatServiceDeps): FormatService {
  const { db, documents, settings, activity, logger } = deps

  function getRules(): FormatRules {
    const parsed = formatRulesSchema.safeParse(settings.getJson(RULES_KEY))
    return parsed.success ? parsed.data : DEFAULT_FORMAT_RULES
  }

  function getLatest(documentId: number): FormatCheckResult | null {
    const row = db
      .select()
      .from(formatChecks)
      .where(eq(formatChecks.documentId, documentId))
      .orderBy(desc(formatChecks.checkedAt), desc(formatChecks.id))
      .limit(1)
      .get()
    if (!row) return null
    return {
      id: row.id,
      documentId: row.documentId,
      checkedAt: row.checkedAt,
      rules: JSON.parse(row.rulesJson),
      stats: JSON.parse(row.statsJson),
      issues: JSON.parse(row.issuesJson)
    }
  }

  return {
    getRules,

    saveRules(rules) {
      const valid = formatRulesSchema.parse(rules)
      settings.setJson(RULES_KEY, valid)
      return valid
    },

    resetRules() {
      settings.remove(RULES_KEY)
      return DEFAULT_FORMAT_RULES
    },

    async check(documentId) {
      const doc = documents.getSummary(documentId)
      if (doc.kind !== 'docx') throw new UserError('Chỉ kiểm tra định dạng được file DOCX.')

      const data = await readFile(documents.getStoredPath(documentId))
      let model
      try {
        model = await loadDocx(data)
      } catch (err) {
        logger.error(`[format] không đọc được cấu trúc ${doc.name}`, err)
        throw new UserError('Không đọc được cấu trúc file DOCX (file có thể bị hỏng).')
      }

      const rules = getRules()
      const { stats, issues } = checkFormat(model, rules)
      const checkedAt = Date.now()

      return db.transaction(() => {
        const row = db
          .insert(formatChecks)
          .values({
            documentId,
            checkedAt,
            issueCount: issues.length,
            rulesJson: JSON.stringify(rules),
            statsJson: JSON.stringify(stats),
            issuesJson: JSON.stringify(issues)
          })
          .returning({ id: formatChecks.id })
          .get()
        activity.log({
          type: 'format.checked',
          message: `Kiểm tra định dạng "${doc.name}": ${issues.length === 0 ? 'không có lỗi' : `${issues.length} lỗi`}`,
          projectId: doc.projectId
        })
        return { id: row.id, documentId, checkedAt, rules, stats, issues }
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
    }
  }
}
