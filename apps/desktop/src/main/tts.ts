import { app } from 'electron'
import { join } from 'node:path'
import { IPC, type SpeakResponse } from '@engclaw/ipc-contract'
import type { ModelManager } from '@engclaw/models'
import { TTS_MODEL_ID } from '@engclaw/pronounce'
import { handle } from './ipc'
import type { UtilityClient } from './utility-client'

/** Catalog id of the Kokoro reference-voice model. */
export const KOKORO_MODEL_ID = TTS_MODEL_ID

/** Where the reference-voice model and its audio cache live, or null if the model is not installed. */
export async function kokoroLocation(
  models: ModelManager,
): Promise<{ modelDir: string; cacheDir: string } | null> {
  const model = (await models.list()).find((m) => m.id === KOKORO_MODEL_ID)
  if (!model || model.state !== 'ready' || !model.path) return null
  return { modelDir: model.path, cacheDir: join(app.getPath('userData'), 'tts-cache') }
}

interface Spoke {
  samples: Float32Array
  sampleRate: number
  cached: boolean
}

/** `tts:speak` -> utility process (Kokoro + disk cache under userData/tts-cache). */
export function registerTtsHandlers(client: UtilityClient, models: ModelManager): void {
  handle(IPC.ttsSpeak, async ({ text }): Promise<SpeakResponse> => {
    const started = performance.now()
    const kokoro = await kokoroLocation(models)
    if (!kokoro)
      return {
        ok: false,
        code: 'MODEL_MISSING',
        message: 'The reference voice model is not downloaded.',
      }
    try {
      const r = await client.call<Spoke>('speak', { text, kokoro }).result
      const ms = Math.round(performance.now() - started)
      console.info(`[tts] speak cached=${r.cached} ${ms}ms (${text.length} chars)`)
      return { ok: true, samples: r.samples, sampleRate: r.sampleRate, cached: r.cached, ms }
    } catch (e) {
      return { ok: false, code: 'FAILED', message: e instanceof Error ? e.message : String(e) }
    }
  })
}
