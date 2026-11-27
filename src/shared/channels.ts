/**
 * Tên các "kênh" IPC. Giao diện và main process gọi nhau qua những tên này.
 * File này KHÔNG import thư viện nào để preload (chạy trong sandbox) dùng được.
 */
export const IPC = {
  app: {
    getInfo: 'app:get-info',
    getOutputDir: 'app:get-output-dir',
    chooseOutputDir: 'app:choose-output-dir',
    resetOutputDir: 'app:reset-output-dir',
    openOutputDir: 'app:open-output-dir',
    revealFile: 'app:reveal-file'
  },
  projects: {
    list: 'projects:list',
    create: 'projects:create',
    update: 'projects:update',
    remove: 'projects:remove'
  },
  activity: {
    listRecent: 'activity:list-recent'
  },
  documents: {
    pickAndImport: 'documents:pick-and-import',
    list: 'documents:list',
    get: 'documents:get',
    remove: 'documents:remove',
    setProject: 'documents:set-project'
  },
  format: {
    check: 'format:check',
    getLatest: 'format:get-latest',
    exportReport: 'format:export-report',
    createTemplateFromDocument: 'format:create-template-from-document',
    autoFix: 'format:auto-fix'
  },
  ai: {
    getStatus: 'ai:get-status',
    setKey: 'ai:set-key',
    removeKey: 'ai:remove-key',
    setModel: 'ai:set-model',
    listModels: 'ai:list-models',
    test: 'ai:test',
    analyze: 'ai:analyze',
    cancel: 'ai:cancel',
    getAnalyses: 'ai:get-analyses',
    /** Sự kiện main → giao diện: từng đoạn chữ AI vừa trả về */
    chunkEvent: 'ai:chunk'
  },
  polish: {
    run: 'polish:run',
    cancel: 'polish:cancel',
    /** Sự kiện main → giao diện: tiến độ hoàn thiện */
    progressEvent: 'polish:progress'
  },
  templates: {
    list: 'templates:list',
    get: 'templates:get',
    createFromPreset: 'templates:create-from-preset',
    createFromFile: 'templates:create-from-file',
    update: 'templates:update',
    setDefault: 'templates:set-default',
    remove: 'templates:remove'
  }
} as const
