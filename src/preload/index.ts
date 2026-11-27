import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC } from '@shared/channels'
import type { AiChunkEvent } from '@shared/ai'
import type { PolishProgressEvent } from '@shared/polish'
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
    check: (input) => ipcRenderer.invoke(IPC.format.check, input),
    getLatest: (input) => ipcRenderer.invoke(IPC.format.getLatest, input),
    exportReport: (input) => ipcRenderer.invoke(IPC.format.exportReport, input),
    createTemplateFromDocument: (input) =>
      ipcRenderer.invoke(IPC.format.createTemplateFromDocument, input),
    autoFix: (input) => ipcRenderer.invoke(IPC.format.autoFix, input)
  },
  ai: {
    getStatus: () => ipcRenderer.invoke(IPC.ai.getStatus),
    setKey: (input) => ipcRenderer.invoke(IPC.ai.setKey, input),
    removeKey: () => ipcRenderer.invoke(IPC.ai.removeKey),
    setModel: (input) => ipcRenderer.invoke(IPC.ai.setModel, input),
    listModels: () => ipcRenderer.invoke(IPC.ai.listModels),
    test: () => ipcRenderer.invoke(IPC.ai.test),
    analyze: (input) => ipcRenderer.invoke(IPC.ai.analyze, input),
    cancel: (input) => ipcRenderer.invoke(IPC.ai.cancel, input),
    getAnalyses: (input) => ipcRenderer.invoke(IPC.ai.getAnalyses, input),
    onChunk: (listener) => {
      // Chỉ chuyển tiếp dữ liệu, không đưa đối tượng event của Electron sang giao diện
      const handler = (_event: IpcRendererEvent, payload: AiChunkEvent): void => listener(payload)
      ipcRenderer.on(IPC.ai.chunkEvent, handler)
      return () => {
        ipcRenderer.removeListener(IPC.ai.chunkEvent, handler)
      }
    }
  },
  polish: {
    run: (input) => ipcRenderer.invoke(IPC.polish.run, input),
    cancel: (input) => ipcRenderer.invoke(IPC.polish.cancel, input),
    onProgress: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: PolishProgressEvent): void =>
        listener(payload)
      ipcRenderer.on(IPC.polish.progressEvent, handler)
      return () => {
        ipcRenderer.removeListener(IPC.polish.progressEvent, handler)
      }
    }
  },
  templates: {
    list: () => ipcRenderer.invoke(IPC.templates.list),
    get: (input) => ipcRenderer.invoke(IPC.templates.get, input),
    createFromPreset: (input) => ipcRenderer.invoke(IPC.templates.createFromPreset, input),
    createFromFile: () => ipcRenderer.invoke(IPC.templates.createFromFile),
    update: (input) => ipcRenderer.invoke(IPC.templates.update, input),
    setDefault: (input) => ipcRenderer.invoke(IPC.templates.setDefault, input),
    remove: (input) => ipcRenderer.invoke(IPC.templates.remove, input)
  }
}

contextBridge.exposeInMainWorld('nexus', api)
