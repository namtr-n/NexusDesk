import { desc, eq } from 'drizzle-orm'
import type { z } from 'zod'
import type {
  Project,
  projectCreateSchema,
  projectRemoveSchema,
  projectUpdateSchema
} from '@shared/ipc-contract'
import type { AppDatabase } from '../../db/client'
import { projects } from '../../db/schema'
import { UserError } from '../../errors'
import type { ActivityRepository } from '../activity/activity-repository'

// Dữ liệu ĐÃ qua kiểm tra zod (đã trim, đã có giá trị mặc định).
type CreateData = z.output<typeof projectCreateSchema>
type UpdateData = z.output<typeof projectUpdateSchema>
type RemoveData = z.output<typeof projectRemoveSchema>

const NOT_FOUND = 'Không tìm thấy dự án. Có thể nó đã bị xóa.'

export interface ProjectService {
  list(): Project[]
  create(data: CreateData): Project
  update(data: UpdateData): Project
  remove(data: RemoveData): { id: number }
}

/** Nghiệp vụ "Dự án": thêm, sửa, xóa, liệt kê. Mỗi thay đổi đều ghi nhật ký hoạt động. */
export function createProjectService(
  db: AppDatabase,
  activity: ActivityRepository
): ProjectService {
  return {
    list(): Project[] {
      return db.select().from(projects).orderBy(desc(projects.updatedAt), desc(projects.id)).all()
    },

    create(data: CreateData): Project {
      // transaction: hoặc cả hai việc (tạo dự án + ghi nhật ký) cùng thành công, hoặc không việc nào.
      return db.transaction(() => {
        const now = Date.now()
        const row = db
          .insert(projects)
          .values({
            name: data.name,
            description: data.description,
            createdAt: now,
            updatedAt: now
          })
          .returning()
          .get()
        activity.log({
          type: 'project.created',
          message: `Tạo dự án "${row.name}"`,
          projectId: row.id
        })
        return row
      })
    },

    update(data: UpdateData): Project {
      return db.transaction(() => {
        const row = db
          .update(projects)
          .set({ name: data.name, description: data.description, updatedAt: Date.now() })
          .where(eq(projects.id, data.id))
          .returning()
          .get()
        if (!row) throw new UserError(NOT_FOUND)
        activity.log({
          type: 'project.updated',
          message: `Cập nhật dự án "${row.name}"`,
          projectId: row.id
        })
        return row
      })
    },

    remove(data: RemoveData): { id: number } {
      return db.transaction(() => {
        const row = db.delete(projects).where(eq(projects.id, data.id)).returning().get()
        if (!row) throw new UserError(NOT_FOUND)
        activity.log({ type: 'project.deleted', message: `Xóa dự án "${row.name}"` })
        return { id: row.id }
      })
    }
  }
}
