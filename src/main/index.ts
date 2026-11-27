import { app, BrowserWindow, dialog, safeStorage, session, shell } from 'electron'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { openDatabase } from './db/client'
import { pickDocumentFiles, pickFolder, pickSavePath, pickTemplateFile } from './dialogs'
import { UserError } from './errors'
import { createOutputDirService } from './services/settings/output-dir'
import { registerIpcHandlers } from './ipc/register'
import { getLogFilePath, logger } from './logger'
import { createActivityRepository } from './services/activity/activity-repository'
import { createAiService } from './services/ai/ai-service'
import { createGeminiClient } from './services/ai/gemini-client'
import { createKeyStore, type Encryptor } from './services/ai/key-store'
import { createSettingsStore } from './services/settings/settings-store'
import { createPolishService } from './services/polish/polish-service'
import { createDocumentService } from './services/documents/document-service'
import { createFormatService } from './services/format/format-service'
import { createTemplateService } from './services/format/template-service'
import { createProjectService } from './services/projects/project-service'
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

/** Mở database, tạo các service và đăng ký IPC. Trả về false nếu thất bại. */
function bootstrap(): boolean {
  const dataPath = app.getPath('userData')
  const databasePath = join(dataPath, 'nexus-desk.db')
  // Khi dev: thư mục drizzle/ ở gốc project. Khi cài bản .exe: nằm trong resources.
  const migrationsFolder = app.isPackaged
    ? join(process.resourcesPath, 'drizzle')
    : join(app.getAppPath(), 'drizzle')

  try {
    const database = openDatabase(databasePath, migrationsFolder)
    app.on('will-quit', () => database.close())

    const activity = createActivityRepository(database.db)
    const projects = createProjectService(database.db, activity)

    const storageDir = join(dataPath, 'documents')
    mkdirSync(storageDir, { recursive: true })
    const documents = createDocumentService({ db: database.db, activity, storageDir, logger })
    const templates = createTemplateService(database.db)
    templates.ensureDefault()
    const format = createFormatService({ db: database.db, documents, templates, activity, logger })

    const settings = createSettingsStore(database.db)
    const encryptor: Encryptor = {
      isAvailable: () => safeStorage.isEncryptionAvailable(),
      encrypt: (plain) => safeStorage.encryptString(plain),
      decrypt: (data) => safeStorage.decryptString(data)
    }
    const ai = createAiService({
      db: database.db,
      keys: createKeyStore(settings, encryptor),
      settings,
      documents,
      activity,
      logger,
      clientFactory: createGeminiClient,
      encryptionAvailable: () => safeStorage.isEncryptionAvailable()
    })

    const polish = createPolishService({ documents, templates, ai, activity, logger })

    registerIpcHandlers({
      projects,
      activity,
      documents,
      format,
      templates,
      ai,
      polish,
      pickDocumentFiles,
      pickTemplateFile,
      pickSavePath,
      outputDir: createOutputDirService(settings, app.getPath('documents')),
      pickFolder,
      openFolder: async (dir) => {
        const error = await shell.openPath(dir)
        if (error) throw new UserError(`Không mở được thư mục: ${error}`)
      },
      revealFile: (file) => shell.showItemInFolder(file),
      appInfo: () => ({
        version: app.getVersion(),
        dataPath,
        databasePath,
        logPath: getLogFilePath()
      })
    })
    logger.info(`Nexus Desk ${app.getVersion()} khởi động, database: ${databasePath}`)
    return true
  } catch (err) {
    logger.error('Không mở được database', err)
    dialog.showErrorBox(
      'Nexus Desk không khởi động được',
      `Không mở được cơ sở dữ liệu.\n\n${String(err)}\n\nNhật ký: ${getLogFilePath()}`
    )
    return false
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.nexusdesk.app')

  // Từ chối mọi yêu cầu quyền (camera, micro, vị trí...). App không cần.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, callback) => callback(false))

  // F12 mở DevTools khi dev; chặn Ctrl+R khi chạy bản thật.
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  if (!bootstrap()) {
    app.quit()
    return
  }

  createMainWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
