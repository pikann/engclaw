import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type EngclawApi } from '@engclaw/ipc-contract'

const api: EngclawApi = {
  ping: (req) => ipcRenderer.invoke(IPC.ping, req),
  youtube: {
    meta: (req) => ipcRenderer.invoke(IPC.youtubeMeta, req),
    transcript: (req) => ipcRenderer.invoke(IPC.youtubeTranscript, req),
    audioRange: (req) => ipcRenderer.invoke(IPC.youtubeAudioRange, req),
  },
}

contextBridge.exposeInMainWorld('engclaw', api)
