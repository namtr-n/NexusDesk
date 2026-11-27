import mammoth from 'mammoth'
import type { DocumentKind } from '@shared/ipc-contract'

export interface ExtractedText {
  text: string
  pageCount: number | null
}

/** Trích nội dung chữ từ file. Ném lỗi nếu file hỏng / không đọc được. */
export async function extractText(data: Buffer, kind: DocumentKind): Promise<ExtractedText> {
  switch (kind) {
    case 'txt':
      return { text: normalize(decodeText(data)), pageCount: null }
    case 'docx':
      return { text: normalize(await extractDocx(data)), pageCount: null }
    case 'pdf':
      return extractPdf(data)
  }
}

/** Đọc file TXT: hỗ trợ UTF-8 (có/không BOM) và UTF-16 (có BOM). */
export function decodeText(data: Buffer): string {
  if (data.length >= 3 && data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(data.subarray(3))
  }
  if (data.length >= 2 && data[0] === 0xff && data[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(data.subarray(2))
  }
  if (data.length >= 2 && data[0] === 0xfe && data[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(data.subarray(2))
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data)
  } catch {
    // Không phải UTF-8 hợp lệ: đọc theo bảng mã Windows (file cũ)
    return new TextDecoder('windows-1252').decode(data)
  }
}

async function extractDocx(data: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer: data })
  return result.value
}

async function extractPdf(data: Buffer): Promise<ExtractedText> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({
    data: new Uint8Array(data),
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0
  })
  try {
    const doc = await task.promise
    const pages: string[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      let pageText = ''
      for (const item of content.items) {
        if ('str' in item) pageText += item.str + (item.hasEOL ? '\n' : '')
      }
      pages.push(pageText)
      page.cleanup()
    }
    return { text: normalize(pages.join('\n\n')), pageCount: doc.numPages }
  } finally {
    await task.destroy()
  }
}

/** Chuẩn hóa xuống dòng, bỏ khoảng trắng cuối dòng và dòng trống thừa. */
function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
