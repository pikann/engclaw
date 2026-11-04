import { app } from 'electron'
import { join } from 'node:path'
import { IPC, type SpeakResponse } from '@engclaw/ipc-contract'
import type { ModelManager } from '@engclaw/models'
import { handle } from './ipc'

/** Catalog id of the Kokoro reference-voice model. */
export const KOKORO_MODEL_ID = 'kokoro-82m'

interface Spoke {
  type: 'spoke'
  id: number
  error?: string
  samples?: Float32Array
  sampleRate?: number
  cached?: boolean
}

/** `tts:speak` -> utility process (Kokoro + disk cache under userData/tts-cache). */
export function registerTtsHandlers(child: Electron.UtilityProcess, models: ModelManager): void {
  let nextId = 1
  const waiting = new Map<number, (m: Spoke) => void>()
  child.on('message', (m: Spoke) => {
    if (m?.type === 'spoke') waiting.get(m.id)?.(m)
  })
  child.on('exit', () => {
    for (const done of waiting.values())
      done({ type: 'spoke', id: 0, error: 'inference process exited' })
    waiting.clear()
  })

  handle(IPC.ttsSpeak, async ({ text }): Promise<SpeakResponse> => {
    const model = (await models.list()).find((m) => m.id === KOKORO_MODEL_ID)
    if (!model || model.state !== 'ready' || !model.path)
      return {
        ok: false,
        code: 'MODEL_MISSING',
        message: 'The reference voice model is not downloaded.',
      }
    const id = nextId++
    const reply = new Promise<Spoke>((resolve) => waiting.set(id, resolve))
    child.postMessage({
      type: 'speak',
      id,
      text,
      modelDir: model.path,
      cacheDir: join(app.getPath('userData'), 'tts-cache'),
    })
    const m = await reply
    waiting.delete(id)
    if (m.error || !m.samples)
      return { ok: false, code: 'FAILED', message: m.error ?? 'no audio returned' }
    return { ok: true, samples: m.samples, sampleRate: m.sampleRate ?? 16000, cached: !!m.cached }
  })
}
