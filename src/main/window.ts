import { BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

/**
 * Tạo cửa sổ chính với cấu hình bảo mật:
 * - contextIsolation: giao diện và preload chạy ở hai "thế giới" tách biệt.
 * - nodeIntegration: false → giao diện không gọi được Node.js (đọc/xóa file...).
 * - sandbox: true → preload cũng bị giới hạn quyền.
 */
export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'Nexus Desk',
    backgroundColor: '#0b0d12',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  })

  win.on('ready-to-show', () => win.show())

  // Không cho mở cửa sổ mới. Link https thì mở bằng trình duyệt mặc định.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // Không cho trang tự chuyển sang địa chỉ khác (chống bị "dẫn" sang trang lạ).
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  win.webContents.on('will-navigate', (event, url) => {
    if (!(is.dev && devUrl && url.startsWith(devUrl))) event.preventDefault()
  })

  if (is.dev && devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}
