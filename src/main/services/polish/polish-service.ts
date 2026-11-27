/**
 * "Hoàn thiện báo cáo": (1) sửa định dạng theo mẫu, (2) AI hiệu đính câu chữ, ghi mọi sửa đổi
 * bằng Track Changes để người dùng duyệt trong Word, (3) lưu FILE MỚI và thêm vào thư viện.
 * File gốc không bao giờ bị ghi đè.
 */
import { readFile, writeFile } from 'fs/promises'
import { resolve } from 'path'
import type { PolishChange, PolishMode, PolishProgressEvent, PolishResult } from '@shared/polish'
import { UserError } from '../../errors'
import type { ErrorLogger } from '../../ipc/handler'
import type { ActivityRepository } from '../activity/activity-repository'
import type { AiService } from '../ai/ai-service'
import type { RunControl } from '../ai/stream-runner'
import type { DocumentService } from '../documents/document-service'
import { checkFormat } from '../format/check'
import { loadDocx, openDocx, type DocxParagraph } from '../format/docx-model'
import { fixDocx } from '../format/fix'
import { classifyAll } from '../format/paragraph-facts'
import type { TemplateService } from '../format/template-service'
import { buildXml } from '../format/xml'
import {
  buildPolishPrompt,
  makeBatches,
  parsePolishResponse,
  unsafeReason,
  type PolishItem,
  type ProposedEdit
} from './polish-prompt'
import { applyEdits, paragraphText } from './track-changes'

const AUTHOR = 'Nexus Desk AI'
const MAX_CHANGES_LISTED = 300
/** Phần sau các heading này (tài liệu tham khảo, phụ lục) không hiệu đính */
const SKIP_SECTION_RE =
  /tài liệu tham khảo|danh mục tài liệu|references|bibliography|phụ lục|appendix/i

export interface PolishOptions {
  documentId: number
  mode: PolishMode
  fixFormat: boolean
  templateId?: number | null
  requestId: string
}

export interface PolishService {
  run(
    options: PolishOptions,
    targetPath: string,
    onProgress: (e: PolishProgressEvent) => void
  ): Promise<PolishResult>
  cancel(requestId: string): boolean
  suggestName(documentId: number): string
}

export interface PolishServiceDeps {
  documents: DocumentService
  templates: TemplateService
  ai: AiService
  activity: ActivityRepository
  logger: ErrorLogger
}

/** Chọn các đoạn cần hiệu đính: thân bài, heading, chú thích; bỏ bảng, mục lục, trang bìa, tham khảo */
export function selectParagraphs(paragraphs: DocxParagraph[]): DocxParagraph[] {
  const kinds = classifyAll(paragraphs)
  const out: DocxParagraph[] = []
  let skipUntilLevel: number | null = null
  paragraphs.forEach((p, i) => {
    const kind = kinds[i]
    if (kind.type === 'heading') {
      if (skipUntilLevel !== null && kind.level <= skipUntilLevel) skipUntilLevel = null
      if (SKIP_SECTION_RE.test(p.text)) {
        skipUntilLevel = kind.level
        return
      }
    }
    if (skipUntilLevel !== null) return
    if (p.number === 0 || p.inToc || !p.xml) return
    if (kind.type === 'table' || kind.type === 'cover') return
    if (p.text.trim().length < 3) return
    out.push(p)
  })
  return out
}

export function createPolishService(deps: PolishServiceDeps): PolishService {
  const { documents, templates, ai, activity, logger } = deps
  const running = new Map<string, RunControl>()

  function assertNotOriginal(documentId: number, targetPath: string): void {
    const same = (a: string, b: string): boolean =>
      resolve(a).toLowerCase() === resolve(b).toLowerCase()
    if (
      same(targetPath, documents.getSourcePath(documentId)) ||
      same(targetPath, documents.getStoredPath(documentId))
    ) {
      throw new UserError('Không thể lưu đè lên chính tài liệu gốc. Hãy chọn tên file khác.')
    }
  }

  return {
    async run(options, targetPath, onProgress) {
      const { documentId, mode, fixFormat, requestId } = options
      const doc = documents.getSummary(documentId)
      if (doc.kind !== 'docx') throw new UserError('Chỉ hoàn thiện được file DOCX.')
      assertNotOriginal(documentId, targetPath)
      if (running.has(requestId)) throw new UserError('Yêu cầu này đang chạy.')
      const control: RunControl = {}
      running.set(requestId, control)
      const progress = (stage: PolishProgressEvent['stage'], done: number, total: number): void =>
        onProgress({ requestId, stage, done, total })

      try {
        let data: Buffer = await readFile(documents.getStoredPath(documentId))

        // ---- 1. Định dạng ----
        let format: PolishResult['format'] = null
        if (fixFormat) {
          progress('format', 0, 1)
          const template =
            options.templateId === undefined || options.templateId === null
              ? templates.getDefault()
              : templates.get(options.templateId)
          const issuesBefore = checkFormat(await loadDocx(data), template.spec).issues.length
          const fixed = await fixDocx(data, template.spec)
          data = fixed.data
          const issuesAfter = checkFormat(await loadDocx(data), template.spec).issues.length
          format = { issuesBefore, issuesAfter, paragraphsChanged: fixed.summary.paragraphsChanged }
          progress('format', 1, 1)
        }

        // ---- 2. AI hiệu đính, ghi Track Changes ----
        const { zip, documentTree, model } = await openDocx(data)
        const targets = selectParagraphs(model.paragraphs)
        const byId = new Map<number, DocxParagraph>()
        const items: PolishItem[] = []
        for (const p of targets) {
          const text = paragraphText(p.xml!)
          if (!text.trim()) continue
          byId.set(p.number, p)
          items.push({ id: p.number, text })
        }
        if (items.length === 0) throw new UserError('Không tìm thấy đoạn văn nào để hiệu đính.')

        const batches = makeBatches(items)
        let nextId = 900000
        const ctx = {
          author: AUTHOR,
          date: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
          nextId: () => nextId++
        }
        const changes: PolishChange[] = []
        let applied = 0
        let skipped = 0
        let usedModel = ''

        for (let b = 0; b < batches.length; b++) {
          if (control.reason === 'user') throw new UserError('Đã hủy.')
          progress('ai', b, batches.length)
          const { system, prompt } = buildPolishPrompt(mode, batches[b])
          const { model: m, content } = await ai.complete({
            task: `polish-${mode}`,
            system,
            prompt,
            json: true,
            documentId,
            control
          })
          usedModel = m
          let proposed: ProposedEdit[]
          try {
            proposed = parsePolishResponse(content)
          } catch (err) {
            logger.error('[polish] JSON của AI không đọc được', err)
            skipped++
            continue
          }

          // Gom theo đoạn, lọc sửa đổi không an toàn, áp dụng bằng Track Changes
          const grouped = new Map<number, ProposedEdit[]>()
          for (const e of proposed) {
            if (!byId.has(e.id)) {
              skipped++
              continue
            }
            if (unsafeReason(e, mode)) {
              skipped++
              continue
            }
            grouped.set(e.id, [...(grouped.get(e.id) ?? []), e])
          }
          for (const [pid, edits] of grouped) {
            const r = applyEdits(byId.get(pid)!.xml!, edits, ctx)
            skipped += r.skipped.length
            for (const ok of r.applied) {
              applied++
              const full = edits.find((e) => e.find === ok.find && e.replace === ok.replace)
              if (changes.length < MAX_CHANGES_LISTED) {
                changes.push({
                  paragraph: pid,
                  find: ok.find,
                  replace: ok.replace,
                  reason: full?.reason ?? ''
                })
              }
            }
          }
        }
        progress('ai', batches.length, batches.length)

        // ---- 3. Lưu file mới + thêm vào thư viện ----
        progress('save', 0, 1)
        zip.file('word/document.xml', buildXml(documentTree))
        const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
        await writeFile(targetPath, out)
        const imported = await documents.importFiles([targetPath], doc.projectId)
        progress('save', 1, 1)

        activity.log({
          type: 'ai.polished',
          message: `Hoàn thiện "${doc.name}": ${applied} sửa đổi câu chữ${format ? `, định dạng ${format.issuesBefore} → ${format.issuesAfter} lỗi` : ''}`,
          projectId: doc.projectId
        })

        return {
          path: targetPath,
          newDocumentId: imported.imported[0]?.id ?? null,
          model: usedModel,
          format,
          paragraphsReviewed: items.length,
          editsApplied: applied,
          editsSkipped: skipped,
          changes
        }
      } finally {
        running.delete(requestId)
      }
    },

    cancel(requestId) {
      const control = running.get(requestId)
      if (!control) return false
      control.reason = 'user'
      control.abort?.()
      return true
    },

    suggestName(documentId) {
      const base = documents.getSummary(documentId).name.replace(/\.docx$/i, '')
      return `${base} - hoan thien.docx`
    }
  }
}
