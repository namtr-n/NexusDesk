import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { readFile } from 'fs/promises'
import { basename } from 'path'
import { is } from '@electron-toolkit/utils'
import { z } from 'zod'
import { IPC } from '@shared/channels'
import {
  activityListSchema,
  documentIdSchema,
  documentImportSchema,
  documentListSchema,
  documentSetProjectSchema,
  formatAutoFixSchema,
  formatCheckSchema,
  formatExportSchema,
  projectCreateSchema,
  projectRemoveSchema,
  projectUpdateSchema,
  templateIdSchema,
  templatePresetSchema,
  templateUpdateSchema,
  aiAnalyzeSchema,
  aiAnalyzeWithPromptSchema,
  aiCancelSchema,
  aiSetKeySchema,
  aiSetModelSchema,
  revealFileSchema,
  type AppInfo,
  type Result
} from '@shared/ipc-contract'
import type { AiChunkEvent } from '@shared/ai'
import { polishRunSchema, type PolishProgressEvent } from '@shared/polish'
import {
  promptCreateSchema,
  promptIdSchema,
  promptListSchema,
  promptRestoreSchema,
  promptUpdateSchema
} from '@shared/prompts'
import type { PromptService } from '../services/prompts/prompt-service'
import type { PolishService } from '../services/polish/polish-service'
import type { ReportFormat } from '@shared/format'
import { logger } from '../logger'
import type { ActivityRepository } from '../services/activity/activity-repository'
import type { AiService } from '../services/ai/ai-service'
import type { DocumentService } from '../services/documents/document-service'
import type { FormatService } from '../services/format/format-service'
import type { TemplateService } from '../services/format/template-service'
import type { ProjectService } from '../services/projects/project-service'
import type { OutputDirService } from '../services/settings/output-dir'
import { UserError } from '../errors'
import { createHandler, type HandlerContext } from './handler'

export interface IpcDependencies {
  projects: ProjectService
  activity: ActivityRepository
  documents: DocumentService
  appInfo: () => AppInfo
  format: FormatService
  templates: TemplateService
  ai: AiService
  polish: PolishService
  prompts: PromptService
  /** Hiện hộp thoại chọn file của Windows; trả [] nếu người dùng bấm Hủy */
  pickDocumentFiles: () => Promise<string[]>
  /** Hộp thoại chọn MỘT file DOCX mẫu; trả null nếu người dùng bấm Hủy */
  pickTemplateFile: () => Promise<string | null>
  /** Hiện hộp thoại "Lưu thành" mở sẵn ở defaultDir; trả null nếu người dùng bấm Hủy */
  pickSavePath: (
    defaultName: string,
    format: ReportFormat,
    defaultDir?: string
  ) => Promise<string | null>
  /** Thư mục lưu file kết quả */
  outputDir: OutputDirService
  pickFolder: (title: string, defaultPath: string) => Promise<string | null>
  /** Mở thư mục bằng File Explorer */
  openFolder: (path: string) => Promise<void>
  /** Mở File Explorer và chọn sẵn file */
  revealFile: (path: string) => void
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
  fn: (input: z.output<S>, ctx: HandlerContext) => R | Promise<R>
): void {
  const handler = createHandler(channel, schema, fn, logger)
  ipcMain.handle(channel, (event, raw): Promise<Result<Awaited<R>>> | Result<never> => {
    if (!isTrustedSender(event)) {
      logger.warn(`[ipc] từ chối ${channel} từ nguồn lạ: ${event.senderFrame?.url}`)
      return { ok: false, error: 'Nguồn gọi không hợp lệ' }
    }
    const sender = event.sender
    return handler(raw, {
      send: (ch, payload) => {
        if (!sender.isDestroyed()) sender.send(ch, payload)
      }
    })
  })
}

export function registerIpcHandlers(deps: IpcDependencies): void {
  /** Hộp thoại "Lưu thành" mở sẵn ở thư mục kết quả; ghi nhận file để sau này "mở thư mục chứa" */
  async function pickOutput(name: string, format: ReportFormat): Promise<string | null> {
    const target = await deps.pickSavePath(name, format, deps.outputDir.get())
    if (target) deps.outputDir.remember(target)
    return target
  }
  const outputDirInfo = (): { path: string; isDefault: boolean } => ({
    path: deps.outputDir.get(),
    isDefault: deps.outputDir.isDefault()
  })

  register(IPC.app.getInfo, noInput, () => deps.appInfo())
  register(IPC.app.getOutputDir, noInput, () => outputDirInfo())
  register(IPC.app.chooseOutputDir, noInput, async () => {
    const dir = await deps.pickFolder('Chọn thư mục lưu file kết quả', deps.outputDir.get())
    if (dir) deps.outputDir.set(dir)
    return outputDirInfo()
  })
  register(IPC.app.resetOutputDir, noInput, () => {
    deps.outputDir.reset()
    return outputDirInfo()
  })
  register(IPC.app.openOutputDir, noInput, () => deps.openFolder(deps.outputDir.get()))
  register(IPC.app.revealFile, revealFileSchema, ({ path }) => {
    // Chỉ mở được file chính app vừa lưu (không cho giao diện mở đường dẫn tùy ý)
    if (!deps.outputDir.isKnownOutput(path)) throw new UserError('Không tìm thấy file.')
    deps.revealFile(path)
  })

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

  register(IPC.format.check, formatCheckSchema, (input) =>
    deps.format.check(input.id, input.templateId)
  )
  register(IPC.format.createTemplateFromDocument, documentIdSchema, (input) =>
    deps.format.createTemplateFromDocument(input.id)
  )
  register(IPC.format.autoFix, formatAutoFixSchema, async ({ documentId, templateId }) => {
    const target = await pickOutput(deps.format.suggestFixedName(documentId), 'docx')
    if (!target) return { cancelled: true, result: null }
    return { cancelled: false, result: await deps.format.autoFix(documentId, templateId, target) }
  })
  register(IPC.format.getLatest, documentIdSchema, (input) => deps.format.getLatest(input.id))
  register(IPC.format.exportReport, formatExportSchema, async ({ documentId, format }) => {
    const name = deps.format.suggestReportName(documentId, format)
    const target = await pickOutput(name, format)
    if (!target) return { cancelled: true, path: null }
    const path = await deps.format.exportReport(documentId, format, target)
    return { cancelled: false, path }
  })

  register(IPC.templates.list, noInput, () => deps.templates.list())
  register(IPC.templates.get, templateIdSchema, (input) => deps.templates.get(input.id))
  register(IPC.templates.createFromPreset, templatePresetSchema, (input) =>
    deps.templates.createFromPreset(input.name)
  )
  register(IPC.templates.createFromFile, noInput, async () => {
    const path = await deps.pickTemplateFile()
    if (!path) return { cancelled: true, template: null }
    const data = await readFile(path)
    return { cancelled: false, template: await deps.templates.createFromDocx(data, basename(path)) }
  })
  register(IPC.templates.update, templateUpdateSchema, (input) =>
    deps.templates.update(input.id, input.name, input.spec)
  )
  register(IPC.templates.setDefault, templateIdSchema, (input) =>
    deps.templates.setDefault(input.id)
  )
  register(IPC.templates.remove, templateIdSchema, (input) => deps.templates.remove(input.id))

  register(IPC.ai.getStatus, noInput, () => deps.ai.getStatus())
  register(IPC.ai.setKey, aiSetKeySchema, (input) => deps.ai.setKey(input.apiKey))
  register(IPC.ai.removeKey, noInput, () => deps.ai.removeKey())
  register(IPC.ai.setModel, aiSetModelSchema, (input) => deps.ai.setModel(input.model))
  register(IPC.ai.listModels, noInput, () => deps.ai.listModels())
  register(IPC.ai.test, noInput, () => deps.ai.test())
  register(IPC.ai.analyze, aiAnalyzeSchema, (input, ctx) =>
    deps.ai.analyze(input.documentId, input.task, input.requestId, (text) => {
      const event: AiChunkEvent = { requestId: input.requestId, text }
      ctx.send(IPC.ai.chunkEvent, event)
    })
  )
  register(IPC.ai.analyzeWithPrompt, aiAnalyzeWithPromptSchema, (input, ctx) =>
    deps.ai.analyzeWithPrompt(input.documentId, input.promptId, input.requestId, (text) => {
      const event: AiChunkEvent = { requestId: input.requestId, text }
      ctx.send(IPC.ai.chunkEvent, event)
    })
  )
  register(IPC.ai.cancel, aiCancelSchema, (input) => deps.ai.cancel(input.requestId))

  register(IPC.prompts.list, promptListSchema, (input) => deps.prompts.list(input))
  register(IPC.prompts.categories, noInput, () => deps.prompts.categories())
  register(IPC.prompts.get, promptIdSchema, (input) => deps.prompts.get(input.id))
  register(IPC.prompts.create, promptCreateSchema, (input) => deps.prompts.create(input))
  register(IPC.prompts.update, promptUpdateSchema, ({ id, ...fields }) =>
    deps.prompts.update(id, fields)
  )
  register(IPC.prompts.duplicate, promptIdSchema, (input) => deps.prompts.duplicate(input.id))
  register(IPC.prompts.remove, promptIdSchema, (input) => deps.prompts.remove(input.id))
  register(IPC.prompts.versions, promptIdSchema, (input) => deps.prompts.versions(input.id))
  register(IPC.prompts.restore, promptRestoreSchema, (input) =>
    deps.prompts.restore(input.id, input.versionId)
  )

  register(IPC.polish.run, polishRunSchema, async (input, ctx) => {
    const target = await pickOutput(deps.polish.suggestName(input.documentId), 'docx')
    if (!target) return { cancelled: true, result: null }
    const result = await deps.polish.run(input, target, (event: PolishProgressEvent) =>
      ctx.send(IPC.polish.progressEvent, event)
    )
    return { cancelled: false, result }
  })
  register(IPC.polish.cancel, aiCancelSchema, (input) => deps.polish.cancel(input.requestId))
  register(IPC.ai.getAnalyses, documentIdSchema, (input) => deps.ai.getAnalyses(input.id))
}
