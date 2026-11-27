/** Tạo báo cáo kết quả kiểm tra định dạng dạng Markdown và DOCX. */
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from 'docx'
import {
  FORMAT_RULE_LABELS,
  groupIssues,
  type FormatCheckResult,
  type FormatIssue,
  type FormatRules
} from '@shared/format'

const n = (v: number): string => v.toLocaleString('vi-VN', { maximumFractionDigits: 2 })

export function describeRules(r: FormatRules): string[] {
  return [
    `Font: ${r.fontFamily}, cỡ chữ thân bài ${n(r.bodyFontSizePt)} pt`,
    `Giãn dòng: ${n(r.lineSpacing)} dòng`,
    `Khoảng cách trước đoạn: ${n(r.spaceBeforePt.min)}–${n(r.spaceBeforePt.max)} pt; sau đoạn: ${n(r.spaceAfterPt.min)}–${n(r.spaceAfterPt.max)} pt`,
    `Căn đều hai bên: ${r.justifyBody ? 'có' : 'không kiểm tra'}`,
    `Thụt đầu dòng: ${r.firstLineIndentCm ? `${n(r.firstLineIndentCm.min)}–${n(r.firstLineIndentCm.max)} cm` : 'không kiểm tra'}`,
    `Lề trang: trên ${n(r.marginsCm.top)}, dưới ${n(r.marginsCm.bottom)}, trái ${n(r.marginsCm.left)}, phải ${n(r.marginsCm.right)} cm`,
    `Thứ tự heading: ${r.checkHeadingOrder ? 'có kiểm tra' : 'không kiểm tra'}`
  ]
}

const dateText = (ms: number): string =>
  new Date(ms).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

const where = (i: FormatIssue): string => (i.paragraph === null ? i.excerpt : `Đoạn ${i.paragraph}`)

export function buildMarkdown(documentName: string, result: FormatCheckResult): string {
  const esc = (s: string): string => s.replace(/\|/g, '\\|')
  const lines: string[] = [
    `# Báo cáo kiểm tra định dạng`,
    '',
    `- **Tài liệu:** ${documentName}`,
    `- **Thời điểm kiểm tra:** ${dateText(result.checkedAt)}`,
    `- **Số đoạn có chữ:** ${result.stats.paragraphs} (thân bài ${result.stats.bodyParagraphs}, heading ${result.stats.headings})`,
    `- **Tổng số lỗi:** ${result.issues.length}`,
    '',
    '## Quy tắc áp dụng',
    '',
    ...describeRules(result.rules).map((l) => `- ${l}`),
    ''
  ]
  if (result.issues.length === 0) {
    lines.push('## Kết quả', '', 'Không phát hiện lỗi định dạng nào.', '')
    return lines.join('\n')
  }
  lines.push('## Tóm tắt', '', '| Loại lỗi | Số lượng |', '| --- | ---: |')
  for (const [rule, list] of groupIssues(result.issues)) {
    lines.push(`| ${FORMAT_RULE_LABELS[rule]} | ${list.length} |`)
  }
  lines.push('')
  for (const [rule, list] of groupIssues(result.issues)) {
    lines.push(`## ${FORMAT_RULE_LABELS[rule]} (${list.length})`, '')
    lines.push('| Vị trí | Nội dung đầu đoạn | Hiện tại | Yêu cầu |', '| --- | --- | --- | --- |')
    for (const i of list) {
      const excerpt = i.paragraph === null ? '' : esc(i.excerpt)
      lines.push(`| ${esc(where(i))} | ${excerpt} | ${esc(i.actual)} | ${esc(i.expected)} |`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

const FONT = 'Times New Roman'
const border = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' }
const borders = { top: border, bottom: border, left: border, right: border }

function cell(text: string, opts: { bold?: boolean; width: number; shade?: boolean }): TableCell {
  return new TableCell({
    borders,
    width: { size: opts.width, type: WidthType.PERCENTAGE },
    shading: opts.shade ? { fill: 'EDEFF5' } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: opts.bold, size: 22 })] })]
  })
}

function table(header: string[], rows: string[][], widths: number[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: header.map((h, i) => cell(h, { bold: true, width: widths[i], shade: true }))
      }),
      ...rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, { width: widths[i] })) }))
    ]
  })
}

const para = (text: string, bold = false): Paragraph =>
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text, bold })] })

export async function buildReportDocx(
  documentName: string,
  result: FormatCheckResult
): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: 'BÁO CÁO KIỂM TRA ĐỊNH DẠNG', bold: true, size: 32 })]
    }),
    para(`Tài liệu: ${documentName}`),
    para(`Thời điểm kiểm tra: ${dateText(result.checkedAt)}`),
    para(
      `Số đoạn có chữ: ${result.stats.paragraphs} (thân bài ${result.stats.bodyParagraphs}, heading ${result.stats.headings})`
    ),
    para(`Tổng số lỗi: ${result.issues.length}`, true),
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Quy tắc áp dụng')] }),
    ...describeRules(result.rules).map(
      (l) => new Paragraph({ bullet: { level: 0 }, children: [new TextRun(l)] })
    )
  ]

  if (result.issues.length === 0) {
    children.push(para('Không phát hiện lỗi định dạng nào.', true))
  } else {
    const groups = groupIssues(result.issues)
    children.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Tóm tắt')] }),
      table(
        ['Loại lỗi', 'Số lượng'],
        groups.map(([rule, list]) => [FORMAT_RULE_LABELS[rule], String(list.length)]),
        [75, 25]
      )
    )
    for (const [rule, list] of groups) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun(`${FORMAT_RULE_LABELS[rule]} (${list.length})`)]
        }),
        table(
          ['Vị trí', 'Nội dung đầu đoạn', 'Hiện tại', 'Yêu cầu'],
          list.map((i) => [where(i), i.paragraph === null ? '' : i.excerpt, i.actual, i.expected]),
          [12, 44, 22, 22]
        )
      )
    }
  }

  const doc = new Document({
    creator: 'Nexus Desk',
    title: `Báo cáo định dạng - ${documentName}`,
    styles: {
      default: {
        document: { run: { font: FONT, size: 24 } },
        heading1: {
          run: { font: FONT, size: 28, bold: true, color: '1F2A44' },
          paragraph: { spacing: { before: 240, after: 120 } }
        },
        title: { run: { font: FONT } }
      }
    },
    sections: [
      {
        properties: { page: { margin: { top: 1134, bottom: 1134, left: 1418, right: 1134 } } },
        children
      }
    ]
  })
  return Packer.toBuffer(doc)
}
