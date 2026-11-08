import { app, net, safeStorage } from 'electron'
import { join } from 'node:path'
import { IPC } from '@engclaw/ipc-contract'
import { handle } from '../ipc'
import { LlmConfigStore } from './config-store'
import { LlmService } from './service'

/** `basic_text` on Linux means the "encryption" key sits in the clear, so it does not count. */
const secureAvailable = (): boolean =>
  safeStorage.isEncryptionAvailable() &&
  !(process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')

/** Registers the provider-setup channels; returns the store so "delete all data" can wipe it. */
export function registerLlmHandlers(): LlmConfigStore {
  const store = new LlmConfigStore(join(app.getPath('userData'), 'llm-provider.json'), {
    available: secureAvailable,
    encrypt: (plain) => safeStorage.encryptString(plain),
    decrypt: (blob) => safeStorage.decryptString(blob),
  })
  const service = new LlmService(store, (url, init) => net.fetch(url, init))
  handle(IPC.llmStatus, () => service.status())
  handle(IPC.llmSave, (req) => service.save(req))
  handle(IPC.llmTest, (req) => service.test(req))
  handle(IPC.llmRemove, () => service.remove())
  return store
}
