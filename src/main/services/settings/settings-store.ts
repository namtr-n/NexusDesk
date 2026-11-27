import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../db/client'
import { settings } from '../../db/schema'

/** Lưu/đọc cài đặt dạng chuỗi theo key (bảng settings). */
export interface SettingsStore {
  get(key: string): string | undefined
  set(key: string, value: string): void
  remove(key: string): void
}

export function createSettingsStore(db: AppDatabase): SettingsStore {
  return {
    get(key) {
      return db.select().from(settings).where(eq(settings.key, key)).get()?.value
    },
    set(key, value) {
      db.insert(settings)
        .values({ key, value, updatedAt: Date.now() })
        .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: Date.now() } })
        .run()
    },
    remove(key) {
      db.delete(settings).where(eq(settings.key, key)).run()
    }
  }
}
