import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'

export type AppDatabase = BetterSQLite3Database<typeof schema>

export interface DatabaseHandle {
  db: AppDatabase
  close(): void
}

/**
 * Mở (hoặc tạo mới) file database và chạy các migration còn thiếu.
 * @param filePath đường dẫn file .db, hoặc ':memory:' khi chạy test
 * @param migrationsFolder thư mục chứa các file migration SQL (drizzle/)
 */
export function openDatabase(filePath: string, migrationsFolder: string): DatabaseHandle {
  const sqlite = new Database(filePath)
  try {
    sqlite.pragma('journal_mode = WAL') // ghi nhanh và an toàn hơn khi app bị tắt đột ngột
    sqlite.pragma('foreign_keys = ON') // bắt SQLite tôn trọng quan hệ giữa các bảng
    const db = drizzle({ client: sqlite, schema })
    migrate(db, { migrationsFolder })
    return { db, close: () => sqlite.close() }
  } catch (err) {
    sqlite.close()
    throw err
  }
}
