import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../db/client'
import { settings } from '../../db/schema'

/** Lưu/đọc cài đặt dạng JSON theo key. */
export interface SettingsStore {
  getJson(key: string): unknown
  setJson(key: string, value: unknown): void
  remove(key: string): void
}

export function createSettingsStore(db: AppDatabase): SettingsStore {
  return {
    getJson(key) {
      const row = db.select().from(settings).where(eq(settings.key, key)).get()
      if (!row) return undefined
      try {
        return JSON.parse(row.value)
      } catch {
        return undefined
      }
    },
    setJson(key, value) {
      const json = JSON.stringify(value)
      db.insert(settings)
        .values({ key, value: json, updatedAt: Date.now() })
        .onConflictDoUpdate({ target: settings.key, set: { value: json, updatedAt: Date.now() } })
        .run()
    },
    remove(key) {
      db.delete(settings).where(eq(settings.key, key)).run()
    }
  }
}
