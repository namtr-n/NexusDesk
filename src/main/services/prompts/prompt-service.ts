/**
 * Thư viện prompt: lưu / sửa / xóa / nhân bản, tìm kiếm toàn văn (FTS5, gõ không dấu vẫn tìm được),
 * lịch sử phiên bản và khôi phục. Prompt được dùng để AI phân tích tài liệu (ai-service).
 */
import { and, count, desc, eq, inArray, sql, type SQL } from 'drizzle-orm'
import type {
  Prompt,
  PromptFields,
  PromptSummary,
  PromptVersion,
  promptListSchema
} from '@shared/prompts'
import type { z } from 'zod'
import type { AppDatabase } from '../../db/client'
import { projects, prompts, promptVersions } from '../../db/schema'
import { UserError } from '../../errors'
import type { ActivityRepository } from '../activity/activity-repository'
import type { SettingsStore } from '../settings/settings-store'
import { STARTER_PROMPTS } from './starter-prompts'

const NOT_FOUND = 'Không tìm thấy prompt. Có thể nó đã bị xóa.'
const SEEDED_KEY = 'prompts.seeded'
const PREVIEW_CHARS = 160

type ListFilter = z.output<typeof promptListSchema>
type Row = typeof prompts.$inferSelect

export interface PromptService {
  /** Thêm prompt mẫu ở lần chạy đầu tiên (chỉ một lần) */
  ensureStarter(): void
  list(filter: ListFilter): PromptSummary[]
  /** Danh mục đang dùng và số prompt mỗi danh mục */
  categories(): { name: string; count: number }[]
  get(id: number): Prompt
  create(fields: PromptFields): Prompt
  update(id: number, fields: PromptFields): Prompt
  duplicate(id: number): Prompt
  remove(id: number): { id: number }
  versions(id: number): PromptVersion[]
  /** Khôi phục tiêu đề + nội dung của một phiên bản cũ (tạo thành phiên bản mới nhất) */
  restore(id: number, versionId: number): Prompt
  /** Ghi nhận một lần dùng (để sắp xếp "hay dùng") */
  markUsed(id: number): void
}

/**
 * Đổi chữ người dùng gõ thành truy vấn FTS5 an toàn: mỗi từ thành "từ"* (tìm theo tiền tố),
 * các từ nối bằng AND. Bỏ hết ký tự đặc biệt của cú pháp FTS5.
 */
export function toFtsQuery(input: string): string | null {
  const words = input
    .normalize('NFC')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 12)
  if (words.length === 0) return null
  return words.map((w) => `"${w}"*`).join(' ')
}

function parseTags(json: string): string[] {
  try {
    const v: unknown = JSON.parse(json)
    return Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string') : []
  } catch {
    return []
  }
}

function preview(content: string): string {
  const flat = content.replace(/\s+/g, ' ').trim()
  return flat.length > PREVIEW_CHARS ? `${flat.slice(0, PREVIEW_CHARS)}…` : flat
}

function toSummary(r: Row): PromptSummary {
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    tags: parseTags(r.tagsJson),
    projectId: r.projectId,
    preview: preview(r.content),
    useCount: r.useCount,
    lastUsedAt: r.lastUsedAt,
    updatedAt: r.updatedAt
  }
}

export function createPromptService(deps: {
  db: AppDatabase
  settings: SettingsStore
  activity: ActivityRepository
}): PromptService {
  const { db, settings, activity } = deps

  function find(id: number): Row {
    const row = db.select().from(prompts).where(eq(prompts.id, id)).get()
    if (!row) throw new UserError(NOT_FOUND)
    return row
  }

  function assertProject(projectId: number | null): void {
    if (projectId === null) return
    const p = db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).get()
    if (!p) throw new UserError('Không tìm thấy dự án. Có thể nó đã bị xóa.')
  }

  function addVersion(promptId: number, title: string, content: string, at: number): void {
    db.insert(promptVersions).values({ promptId, title, content, createdAt: at }).run()
  }

  function toPrompt(r: Row): Prompt {
    const versionCount =
      db.select({ n: count() }).from(promptVersions).where(eq(promptVersions.promptId, r.id)).get()
        ?.n ?? 0
    return {
      id: r.id,
      title: r.title,
      category: r.category,
      tags: parseTags(r.tagsJson),
      projectId: r.projectId,
      useCount: r.useCount,
      lastUsedAt: r.lastUsedAt,
      updatedAt: r.updatedAt,
      content: r.content,
      createdAt: r.createdAt,
      versionCount
    }
  }

  function insert(fields: PromptFields): Row {
    assertProject(fields.projectId)
    const now = Date.now()
    return db.transaction(() => {
      const row = db
        .insert(prompts)
        .values({
          title: fields.title,
          content: fields.content,
          category: fields.category,
          tagsJson: JSON.stringify(fields.tags),
          projectId: fields.projectId,
          createdAt: now,
          updatedAt: now
        })
        .returning()
        .get()
      addVersion(row.id, row.title, row.content, now)
      return row
    })
  }

  const service: PromptService = {
    ensureStarter() {
      if (settings.get(SEEDED_KEY)) return
      db.transaction(() => {
        const any = db.select({ id: prompts.id }).from(prompts).limit(1).get()
        if (!any) for (const p of STARTER_PROMPTS) insert(p)
        settings.set(SEEDED_KEY, '1')
      })
    },

    list({ query, category, projectId }) {
      const conditions: SQL[] = []
      if (category !== undefined) conditions.push(eq(prompts.category, category))
      if (projectId !== undefined) {
        conditions.push(
          projectId === null ? sql`${prompts.projectId} IS NULL` : eq(prompts.projectId, projectId)
        )
      }

      const fts = toFtsQuery(query)
      if (!fts) {
        return db
          .select()
          .from(prompts)
          .where(and(...conditions))
          .orderBy(desc(prompts.updatedAt), desc(prompts.id))
          .all()
          .map(toSummary)
      }

      // Trọng số: tiêu đề quan trọng nhất, rồi tag, danh mục, nội dung
      const ranked = db.all<{ id: number }>(
        sql`SELECT rowid AS id FROM prompts_fts WHERE prompts_fts MATCH ${fts}
            ORDER BY bm25(prompts_fts, 10.0, 1.0, 5.0, 3.0) LIMIT 200`
      )
      if (ranked.length === 0) return []
      const ids = ranked.map((r) => r.id)
      const rows = db
        .select()
        .from(prompts)
        .where(and(inArray(prompts.id, ids), ...conditions))
        .all()
      const order = new Map(ids.map((id, i) => [id, i]))
      return rows.sort((a, b) => order.get(a.id)! - order.get(b.id)!).map(toSummary)
    },

    categories() {
      return db
        .select({ name: prompts.category, count: count() })
        .from(prompts)
        .where(sql`${prompts.category} <> ''`)
        .groupBy(prompts.category)
        .orderBy(prompts.category)
        .all()
    },

    get(id) {
      return toPrompt(find(id))
    },

    create(fields) {
      const row = insert(fields)
      activity.log({
        type: 'prompt.created',
        message: `Thêm prompt "${row.title}"`,
        projectId: row.projectId
      })
      return toPrompt(row)
    },

    update(id, fields) {
      const old = find(id)
      assertProject(fields.projectId)
      const now = Date.now()
      const row = db.transaction(() => {
        const updated = db
          .update(prompts)
          .set({
            title: fields.title,
            content: fields.content,
            category: fields.category,
            tagsJson: JSON.stringify(fields.tags),
            projectId: fields.projectId,
            updatedAt: now
          })
          .where(eq(prompts.id, id))
          .returning()
          .get()!
        if (old.title !== fields.title || old.content !== fields.content) {
          addVersion(id, fields.title, fields.content, now)
        }
        return updated
      })
      return toPrompt(row)
    },

    duplicate(id) {
      const src = find(id)
      return service.create({
        title: `${src.title} (bản sao)`.slice(0, 120),
        content: src.content,
        category: src.category,
        tags: parseTags(src.tagsJson),
        projectId: src.projectId
      })
    },

    remove(id) {
      const row = find(id)
      db.delete(prompts).where(eq(prompts.id, id)).run()
      activity.log({
        type: 'prompt.deleted',
        message: `Xóa prompt "${row.title}"`,
        projectId: row.projectId
      })
      return { id }
    },

    versions(id) {
      find(id)
      return db
        .select()
        .from(promptVersions)
        .where(eq(promptVersions.promptId, id))
        .orderBy(desc(promptVersions.createdAt), desc(promptVersions.id))
        .all()
    },

    restore(id, versionId) {
      const row = find(id)
      const v = db
        .select()
        .from(promptVersions)
        .where(and(eq(promptVersions.id, versionId), eq(promptVersions.promptId, id)))
        .get()
      if (!v) throw new UserError('Không tìm thấy phiên bản này.')
      return service.update(id, {
        title: v.title,
        content: v.content,
        category: row.category,
        tags: parseTags(row.tagsJson),
        projectId: row.projectId
      })
    },

    markUsed(id) {
      db.update(prompts)
        .set({ useCount: sql`${prompts.useCount} + 1`, lastUsedAt: Date.now() })
        .where(eq(prompts.id, id))
        .run()
    }
  }
  return service
}
