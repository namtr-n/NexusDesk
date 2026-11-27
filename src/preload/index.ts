import { contextBridge } from 'electron'

// Preload là "cửa giao tiếp" duy nhất giữa giao diện và main process.
// Chỉ mở đúng những hàm cần thiết qua window.nexus, không bao giờ mở ipcRenderer thô.
const api = {}

contextBridge.exposeInMainWorld('nexus', api)
