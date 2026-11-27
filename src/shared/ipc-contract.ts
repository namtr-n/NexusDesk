/**
 * "Hợp đồng" giữa giao diện (renderer) và main process:
 * - Schema zod: quy tắc dữ liệu hợp lệ. Main dùng để kiểm tra mọi dữ liệu nhận vào,
 *   giao diện dùng để báo lỗi sớm trên form.
 * - Kiểu dữ liệu trả về và interface NexusApi (window.nexus).
 */
import { z } from 'zod'

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

export type ActivityType = 'project.created' | 'project.updated' | 'project.deleted'

export interface ActivityEntry {
  id: number
  type: string
  message: string
  projectId: number | null
  createdAt: number
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
}
