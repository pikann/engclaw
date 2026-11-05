import { contextBridge, ipcRenderer } from 'electron'

// Preload for the sandboxed YouTube player view only. It must not import the IPC contract (and its
// zod schemas); the channel names are mirrored in src/main/player.ts, which validates every event.
const VIEW_EVENT = 'player:viewEvent'
const VIEW_COMMAND = 'player:viewCommand'

contextBridge.exposeInMainWorld('engclawPlayer', {
  emit: (message: unknown): void => ipcRenderer.send(VIEW_EVENT, message),
  onCommand: (cb: (command: unknown) => void): void => {
    ipcRenderer.on(VIEW_COMMAND, (_e, command: unknown) => cb(command))
  },
})
