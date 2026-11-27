import {
  app,
  BrowserWindow,
  dialog,
  type OpenDialogOptions,
  type SaveDialogOptions
} from 'electron'
import { join } from 'path'
import type { ReportFormat } from '@shared/format'

/**
 * Hộp thoại của Windows. Đường dẫn file luôn do main process lấy từ đây,
 * giao diện không bao giờ gửi đường dẫn tùy ý.
 *
 * NEXUS_E2E_PICK / NEXUS_E2E_SAVE_DIR: chỉ dùng cho kiểm thử tự động khi dev
 * (hộp thoại Windows không tự động hóa được). Bản cài đặt luôn bỏ qua.
 */
const e2e = (name: string): string | undefined =>
  app.isPackaged ? undefined : process.env[name] || undefined

export async function pickDocumentFiles(): Promise<string[]> {
  const fake = e2e('NEXUS_E2E_PICK')
  if (fake) return fake.split('|')

  const options: OpenDialogOptions = {
    title: 'Chọn tài liệu',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Tài liệu (DOCX, PDF, TXT)', extensions: ['docx', 'pdf', 'txt'] }]
  }
  const win = BrowserWindow.getFocusedWindow()
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options)
  return result.canceled ? [] : result.filePaths
}

const SAVE_FILTERS: Record<ReportFormat, { name: string; extensions: string[] }> = {
  docx: { name: 'Word (DOCX)', extensions: ['docx'] },
  md: { name: 'Markdown', extensions: ['md'] }
}

export async function pickSavePath(
  defaultName: string,
  format: ReportFormat
): Promise<string | null> {
  const fakeDir = e2e('NEXUS_E2E_SAVE_DIR')
  if (fakeDir) return join(fakeDir, defaultName)

  const options: SaveDialogOptions = {
    title: 'Lưu báo cáo',
    defaultPath: join(app.getPath('documents'), defaultName),
    filters: [SAVE_FILTERS[format]]
  }
  const win = BrowserWindow.getFocusedWindow()
  const result = win
    ? await dialog.showSaveDialog(win, options)
    : await dialog.showSaveDialog(options)
  return result.canceled || !result.filePath ? null : result.filePath
}
