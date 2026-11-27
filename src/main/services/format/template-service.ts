import { asc, eq } from 'drizzle-orm'
import {
  DEFAULT_TEMPLATE_NAME,
  DEFAULT_TEMPLATE_SPEC,
  templateSpecSchema,
  type FormatTemplate,
  type FormatTemplateSummary,
  type TemplateLearnInfo,
  type TemplateSpec
} from '@shared/format'
import type { AppDatabase } from '../../db/client'
import { formatTemplates } from '../../db/schema'
import { UserError } from '../../errors'
import { loadDocx } from './docx-model'
import { learnTemplate } from './learn'

const NOT_FOUND = 'Không tìm thấy mẫu định dạng. Có thể nó đã bị xóa.'

export interface TemplateService {
  /** Tạo mẫu có sẵn nếu chưa có mẫu nào (gọi khi khởi động) */
  ensureDefault(): void
  list(): FormatTemplateSummary[]
  get(id: number): FormatTemplate
  getDefault(): FormatTemplate
  createFromPreset(name: string): FormatTemplate
  /** Học mẫu từ nội dung file DOCX; name mặc định = tên file bỏ đuôi */
  createFromDocx(data: Buffer, sourceName: string, name?: string): Promise<FormatTemplate>
  update(id: number, name: string, spec: TemplateSpec): FormatTemplate
  setDefault(id: number): FormatTemplate
  remove(id: number): { id: number }
}

type Row = typeof formatTemplates.$inferSelect

function toTemplate(row: Row): FormatTemplate {
  const parsed = templateSpecSchema.safeParse(JSON.parse(row.specJson))
  return {
    id: row.id,
    name: row.name,
    isDefault: row.isDefault,
    sourceName: row.sourceName,
    updatedAt: row.updatedAt,
    spec: parsed.success ? parsed.data : DEFAULT_TEMPLATE_SPEC,
    learned: row.learnedJson ? (JSON.parse(row.learnedJson) as TemplateLearnInfo) : null
  }
}

export function createTemplateService(db: AppDatabase): TemplateService {
  function find(id: number): Row {
    const row = db.select().from(formatTemplates).where(eq(formatTemplates.id, id)).get()
    if (!row) throw new UserError(NOT_FOUND)
    return row
  }

  function insert(values: {
    name: string
    spec: TemplateSpec
    sourceName?: string | null
    learned?: TemplateLearnInfo | null
    isDefault?: boolean
  }): FormatTemplate {
    const now = Date.now()
    const row = db
      .insert(formatTemplates)
      .values({
        name: values.name,
        isDefault: values.isDefault ?? false,
        sourceName: values.sourceName ?? null,
        specJson: JSON.stringify(templateSpecSchema.parse(values.spec)),
        learnedJson: values.learned ? JSON.stringify(values.learned) : null,
        createdAt: now,
        updatedAt: now
      })
      .returning()
      .get()
    return toTemplate(row)
  }

  const service: TemplateService = {
    ensureDefault() {
      const any = db.select({ id: formatTemplates.id }).from(formatTemplates).limit(1).get()
      if (!any)
        insert({ name: DEFAULT_TEMPLATE_NAME, spec: DEFAULT_TEMPLATE_SPEC, isDefault: true })
    },

    list() {
      return db
        .select({
          id: formatTemplates.id,
          name: formatTemplates.name,
          isDefault: formatTemplates.isDefault,
          sourceName: formatTemplates.sourceName,
          updatedAt: formatTemplates.updatedAt
        })
        .from(formatTemplates)
        .orderBy(asc(formatTemplates.id))
        .all()
    },

    get(id) {
      return toTemplate(find(id))
    },

    getDefault() {
      const row =
        db.select().from(formatTemplates).where(eq(formatTemplates.isDefault, true)).get() ??
        db.select().from(formatTemplates).orderBy(asc(formatTemplates.id)).limit(1).get()
      if (!row) {
        service.ensureDefault()
        return service.getDefault()
      }
      return toTemplate(row)
    },

    createFromPreset(name) {
      return insert({ name, spec: DEFAULT_TEMPLATE_SPEC })
    },

    async createFromDocx(data, sourceName, name) {
      let model
      try {
        model = await loadDocx(data)
      } catch {
        throw new UserError('Không đọc được file mẫu: không phải DOCX hợp lệ hoặc file bị hỏng.')
      }
      const { spec, learned } = learnTemplate(model, sourceName)
      const fallbackName = sourceName.replace(/\.docx$/i, '')
      return insert({
        name: (name ?? '').trim() || `Mẫu: ${fallbackName}`.slice(0, 100),
        spec,
        sourceName,
        learned
      })
    },

    update(id, name, spec) {
      find(id)
      const row = db
        .update(formatTemplates)
        .set({
          name,
          specJson: JSON.stringify(templateSpecSchema.parse(spec)),
          updatedAt: Date.now()
        })
        .where(eq(formatTemplates.id, id))
        .returning()
        .get()
      return toTemplate(row!)
    },

    setDefault(id) {
      find(id)
      db.transaction(() => {
        db.update(formatTemplates).set({ isDefault: false }).run()
        db.update(formatTemplates).set({ isDefault: true }).where(eq(formatTemplates.id, id)).run()
      })
      return toTemplate(find(id))
    },

    remove(id) {
      const row = find(id)
      const count = db.select({ id: formatTemplates.id }).from(formatTemplates).all().length
      if (count <= 1) throw new UserError('Không thể xóa mẫu duy nhất. Hãy tạo mẫu khác trước.')
      db.transaction(() => {
        db.delete(formatTemplates).where(eq(formatTemplates.id, id)).run()
        if (row.isDefault) {
          const first = db
            .select({ id: formatTemplates.id })
            .from(formatTemplates)
            .orderBy(asc(formatTemplates.id))
            .limit(1)
            .get()
          if (first) {
            db.update(formatTemplates)
              .set({ isDefault: true })
              .where(eq(formatTemplates.id, first.id))
              .run()
          }
        }
      })
      return { id }
    }
  }
  return service
}
