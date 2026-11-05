import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  eventChannels,
  IPC,
  invokeChannels,
  type EngclawApi,
  type EventChannel,
  type EventPayload,
  type InvokeChannel,
  type InvokeRequest,
  type InvokeResponse,
} from '@engclaw/ipc-contract'

/** Validates the request against the contract before it leaves the renderer's reach. */
async function invoke<C extends InvokeChannel>(
  channel: C,
  req?: InvokeRequest<C>,
): Promise<InvokeResponse<C>> {
  const payload = invokeChannels[channel].request.parse(req) as unknown
  const res: unknown = await ipcRenderer.invoke(channel, payload)
  return invokeChannels[channel].response.parse(res) as InvokeResponse<C>
}

function subscribe<C extends EventChannel>(
  channel: C,
  cb: (payload: EventPayload<C>) => void,
): () => void {
  const listener = (_e: IpcRendererEvent, raw: unknown): void =>
    cb(eventChannels[channel].parse(raw))
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

// Only these typed methods cross the context bridge; ipcRenderer itself is never exposed.
const api: EngclawApi = {
  ping: (req) => invoke(IPC.ping, req),
  settings: {
    getLanguage: () => invoke(IPC.settingsGetLanguage),
    setLanguage: (req) => invoke(IPC.settingsSetLanguage, req),
    onLanguageChanged: (cb) => subscribe(IPC.settingsLanguageChanged, cb),
  },
  history: {
    save: (req) => invoke(IPC.historySave, req),
    list: (req) => invoke(IPC.historyList, req),
    audio: (req) => invoke(IPC.historyAudio, req),
    delete: (req) => invoke(IPC.historyDelete, req),
    export: () => invoke(IPC.historyExport),
    import: () => invoke(IPC.historyImport),
  },
  app: {
    getSettings: () => invoke(IPC.appGetSettings),
    updateSettings: (req) => invoke(IPC.appUpdateSettings, req),
    deleteAllData: () => invoke(IPC.appDeleteAllData),
    openMicSettings: () => invoke(IPC.appOpenMicSettings),
  },
  models: {
    list: () => invoke(IPC.modelsList),
    download: (req) => invoke(IPC.modelsDownload, req),
    cancel: (req) => invoke(IPC.modelsCancel, req),
    remove: (req) => invoke(IPC.modelsRemove, req),
    getDir: () => invoke(IPC.modelsGetDir),
    chooseDir: () => invoke(IPC.modelsChooseDir),
    diskInfo: () => invoke(IPC.modelsDiskInfo),
    openFolder: () => invoke(IPC.modelsOpenFolder),
    onProgress: (cb) => subscribe(IPC.modelsProgress, cb),
  },
  youtube: {
    meta: (req) => invoke(IPC.youtubeMeta, req),
    transcript: (req) => invoke(IPC.youtubeTranscript, req),
    audioRange: (req) => invoke(IPC.youtubeAudioRange, req),
  },
  tts: {
    speak: (req) => invoke(IPC.ttsSpeak, req),
  },
  inference: {
    analyze: (req) => invoke(IPC.inferenceAnalyze, req),
    transcribe: (req) => invoke(IPC.inferenceTranscribe, req),
    phonemize: (req) => invoke(IPC.inferencePhonemize, req),
    languages: () => invoke(IPC.inferenceLanguages),
    cancel: (req) => invoke(IPC.inferenceCancel, req),
    onProgress: (cb) => subscribe(IPC.inferenceProgress, cb),
  },
}

contextBridge.exposeInMainWorld('engclaw', api)
