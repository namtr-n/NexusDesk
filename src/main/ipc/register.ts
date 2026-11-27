import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { is } from '@electron-toolkit/utils'
import { z } from 'zod'
import { IPC } from '@shared/channels'
import {
  activityListSchema,
  projectCreateSchema,
  projectRemoveSchema,
  projectUpdateSchema,
  type AppInfo,
  type Result
} from '@shared/ipc-contract'
import { logger } from '../logger'
import type { ActivityRepository } from '../services/activity/activity-repository'
import type { ProjectService } from '../services/projects/project-service'
import { createHandler } from './handler'

export interface IpcDependencies {
  projects: ProjectService
  activity: ActivityRepository
  appInfo: () => AppInfo
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
}
