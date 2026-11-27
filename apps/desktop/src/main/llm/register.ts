import { app, net, safeStorage } from 'electron'
import { join } from 'node:path'
import { IPC } from '@engclaw/ipc-contract'
import { handle } from '../ipc'
import { LlmConfigStore } from './config-store'
import { LlmService } from './service'
import { translateSentence } from './translate-sentence'

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
  const fetchProvider = (url: string, init: RequestInit) => net.fetch(url, init)
  const service = new LlmService(store, fetchProvider)
  handle(IPC.llmTranslateSentence, (request) =>
    translateSentence(request, store.load(), fetchProvider),
  )
  handle(IPC.llmStatus, () => service.status())
  handle(IPC.llmSave, (req) => service.save(req))
  handle(IPC.llmTest, (req) => service.test(req))
  handle(IPC.llmRemove, () => service.remove())
  return store
}
