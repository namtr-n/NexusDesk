import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/channels'
import type { NexusApi } from '@shared/ipc-contract'

// Preload là "cửa giao tiếp" duy nhất giữa giao diện và main process.
// Chỉ mở đúng những hàm dưới đây qua window.nexus, không bao giờ mở ipcRenderer thô.
const api: NexusApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IPC.app.getInfo)
  },
  projects: {
    list: () => ipcRenderer.invoke(IPC.projects.list),
    create: (input) => ipcRenderer.invoke(IPC.projects.create, input),
    update: (input) => ipcRenderer.invoke(IPC.projects.update, input),
    remove: (input) => ipcRenderer.invoke(IPC.projects.remove, input)
  },
  activity: {
    listRecent: (input) => ipcRenderer.invoke(IPC.activity.listRecent, input)
  },
  documents: {
    pickAndImport: (input) => ipcRenderer.invoke(IPC.documents.pickAndImport, input),
    list: (input) => ipcRenderer.invoke(IPC.documents.list, input),
    get: (input) => ipcRenderer.invoke(IPC.documents.get, input),
    remove: (input) => ipcRenderer.invoke(IPC.documents.remove, input),
    setProject: (input) => ipcRenderer.invoke(IPC.documents.setProject, input)
  },
  format: {
    getRules: () => ipcRenderer.invoke(IPC.format.getRules),
    saveRules: (input) => ipcRenderer.invoke(IPC.format.saveRules, input),
    resetRules: () => ipcRenderer.invoke(IPC.format.resetRules),
    check: (input) => ipcRenderer.invoke(IPC.format.check, input),
    getLatest: (input) => ipcRenderer.invoke(IPC.format.getLatest, input),
    exportReport: (input) => ipcRenderer.invoke(IPC.format.exportReport, input)
  }
}

contextBridge.exposeInMainWorld('nexus', api)
