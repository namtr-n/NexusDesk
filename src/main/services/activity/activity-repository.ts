import { desc } from 'drizzle-orm'
import type { ActivityEntry, ActivityType } from '@shared/ipc-contract'
import type { AppDatabase } from '../../db/client'
import { activityLog } from '../../db/schema'

export interface NewActivity {
  type: ActivityType
  message: string
  projectId?: number | null
}

export interface ActivityRepository {
  log(entry: NewActivity): void
  listRecent(limit: number): ActivityEntry[]
}

/** Ghi và đọc nhật ký hoạt động (Dashboard dùng để hiện "Hoạt động gần đây"). */
export function createActivityRepository(db: AppDatabase): ActivityRepository {
  return {
    log(entry: NewActivity): void {
      db.insert(activityLog)
        .values({
          type: entry.type,
          message: entry.message,
          projectId: entry.projectId ?? null,
          createdAt: Date.now()
        })
        .run()
    },

    listRecent(limit: number): ActivityEntry[] {
      return db
        .select()
        .from(activityLog)
        .orderBy(desc(activityLog.createdAt), desc(activityLog.id))
        .limit(limit)
        .all()
    }
  }
}
