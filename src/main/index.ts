import { app, BrowserWindow, session } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createMainWindow } from './window'

// Chỉ cho chạy một bản app cùng lúc (tránh hai bản cùng ghi vào database).
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.nexusdesk.app')

  // Từ chối mọi yêu cầu quyền (camera, micro, vị trí...). App không cần.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, callback) => callback(false))

  // F12 mở DevTools khi dev; chặn Ctrl+R khi chạy bản thật.
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  createMainWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
