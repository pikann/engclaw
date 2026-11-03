import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type EngclawApi } from '@engclaw/ipc-contract'

const api: EngclawApi = {
  ping: (req) => ipcRenderer.invoke(IPC.ping, req),
}

contextBridge.exposeInMainWorld('engclaw', api)
