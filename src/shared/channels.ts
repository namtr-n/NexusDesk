/**
 * Tên các "kênh" IPC. Giao diện và main process gọi nhau qua những tên này.
 * File này KHÔNG import thư viện nào để preload (chạy trong sandbox) dùng được.
 */
export const IPC = {
  app: {
    getInfo: 'app:get-info'
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
    getRules: 'format:get-rules',
    saveRules: 'format:save-rules',
    resetRules: 'format:reset-rules',
    check: 'format:check',
    getLatest: 'format:get-latest',
    exportReport: 'format:export-report'
  }
} as const
