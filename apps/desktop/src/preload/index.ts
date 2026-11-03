import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type EngclawApi } from '@engclaw/ipc-contract'

const api: EngclawApi = {
  ping: (req) => ipcRenderer.invoke(IPC.ping, req),
  settings: {
    getLanguage: () => ipcRenderer.invoke(IPC.settingsGetLanguage),
    setLanguage: (req) => ipcRenderer.invoke(IPC.settingsSetLanguage, req),
    onLanguageChanged: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, language: string): void => cb(language)
      ipcRenderer.on(IPC.settingsLanguageChanged, listener)
      return () => ipcRenderer.removeListener(IPC.settingsLanguageChanged, listener)
    },
  },
  youtube: {
    meta: (req) => ipcRenderer.invoke(IPC.youtubeMeta, req),
    transcript: (req) => ipcRenderer.invoke(IPC.youtubeTranscript, req),
    audioRange: (req) => ipcRenderer.invoke(IPC.youtubeAudioRange, req),
  },
}

contextBridge.exposeInMainWorld('engclaw', api)
