/**
 * Cấu trúc database (các bảng). Sửa file này xong chạy `npm run db:generate`
 * để Drizzle tạo file migration SQL trong thư mục drizzle/.
 * Thiết kế đầy đủ cho các giai đoạn sau: docs/ARCHITECTURE.md.
 */
import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core'

export const projects = sqliteTable('projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
})

export const activityLog = sqliteTable(
  'activity_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    type: text('type').notNull(),
    message: text('message').notNull(),
    projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
    createdAt: integer('created_at').notNull()
  },
  (t) => [index('activity_log_created_at_idx').on(t.createdAt)]
)
