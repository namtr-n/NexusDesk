import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { is } from '@electron-toolkit/utils'
import { z } from 'zod'
import { IPC } from '@shared/channels'
import {
  activityListSchema,
  documentIdSchema,
  documentImportSchema,
  documentListSchema,
  documentSetProjectSchema,
  formatExportSchema,
  projectCreateSchema,
  projectRemoveSchema,
  projectUpdateSchema,
  type AppInfo,
  type Result
} from '@shared/ipc-contract'
import { logger } from '../logger'
import type { ActivityRepository } from '../services/activity/activity-repository'
import { formatRulesSchema, type ReportFormat } from '@shared/format'
import type { DocumentService } from '../services/documents/document-service'
import type { FormatService } from '../services/format/format-service'
import type { ProjectService } from '../services/projects/project-service'
import { createHandler } from './handler'

export interface IpcDependencies {
  projects: ProjectService
  activity: ActivityRepository
  documents: DocumentService
  appInfo: () => AppInfo
  format: FormatService
  /** Hiện hộp thoại chọn file của Windows; trả [] nếu người dùng bấm Hủy */
  pickDocumentFiles: () => Promise<string[]>
  /** Hiện hộp thoại "Lưu thành"; trả null nếu người dùng bấm Hủy */
  pickSavePath: (defaultName: string, format: ReportFormat) => Promise<string | null>
}

const noInput = z.undefined()

/** Chỉ nhận lời gọi từ chính giao diện của app (không nhận từ trang web lạ). */
function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? ''
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (is.dev && devUrl && url.startsWith(devUrl)) return true
  return url.startsWith('file://')
}

function register<S extends z.ZodType, R>(
  channel: string,
  schema: S,
  fn: (input: z.output<S>) => R | Promise<R>
): void {
  const handler = createHandler(channel, schema, fn, logger)
  ipcMain.handle(channel, (event, raw): Promise<Result<Awaited<R>>> | Result<never> => {
    if (!isTrustedSender(event)) {
      logger.warn(`[ipc] từ chối ${channel} từ nguồn lạ: ${event.senderFrame?.url}`)
      return { ok: false, error: 'Nguồn gọi không hợp lệ' }
    }
    return handler(raw)
  })
}

export function registerIpcHandlers(deps: IpcDependencies): void {
  register(IPC.app.getInfo, noInput, () => deps.appInfo())

  register(IPC.projects.list, noInput, () => deps.projects.list())
  register(IPC.projects.create, projectCreateSchema, (input) => deps.projects.create(input))
  register(IPC.projects.update, projectUpdateSchema, (input) => deps.projects.update(input))
  register(IPC.projects.remove, projectRemoveSchema, (input) => deps.projects.remove(input))

  register(IPC.activity.listRecent, activityListSchema, (input) =>
    deps.activity.listRecent(input.limit)
  )

  // Đường dẫn file do main process tự lấy từ hộp thoại, giao diện không gửi đường dẫn tùy ý.
  register(IPC.documents.pickAndImport, documentImportSchema, async (input) => {
    const paths = await deps.pickDocumentFiles()
    if (paths.length === 0) return { cancelled: true, imported: [], skipped: [] }
    return deps.documents.importFiles(paths, input.projectId)
  })
  register(IPC.documents.list, documentListSchema, (input) => deps.documents.list(input.projectId))
  register(IPC.documents.get, documentIdSchema, (input) => deps.documents.get(input.id))
  register(IPC.documents.remove, documentIdSchema, (input) => deps.documents.remove(input.id))
  register(IPC.documents.setProject, documentSetProjectSchema, (input) =>
    deps.documents.setProject(input.id, input.projectId)
  )

  register(IPC.format.getRules, noInput, () => deps.format.getRules())
  register(IPC.format.saveRules, formatRulesSchema, (rules) => deps.format.saveRules(rules))
  register(IPC.format.resetRules, noInput, () => deps.format.resetRules())
  register(IPC.format.check, documentIdSchema, (input) => deps.format.check(input.id))
  register(IPC.format.getLatest, documentIdSchema, (input) => deps.format.getLatest(input.id))
  register(IPC.format.exportReport, formatExportSchema, async ({ documentId, format }) => {
    const name = deps.format.suggestReportName(documentId, format)
    const target = await deps.pickSavePath(name, format)
    if (!target) return { cancelled: true, path: null }
    const path = await deps.format.exportReport(documentId, format, target)
    return { cancelled: false, path }
  })
}
