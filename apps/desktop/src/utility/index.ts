// Inference worker entry (utility process): serves the main process over `rpc` messages.
import { join } from 'node:path'
import type { ContourData } from '@engclaw/ipc-contract'
import { CachedPhonemizer, TTS_MODEL_ID } from '@engclaw/pronounce'
import { EspeakProcess } from './espeak'
import { DEFAULT_KOKORO_FILES, loadKokoro } from './kokoro'
import { InferenceError, toInferenceError } from './errors'
import { InferenceService, type ModelDirs } from './inference'
import { analyzeIntonation } from './intonation'
import { loadModelAdapter } from './model-adapter'
import type { RpcCancel, RpcRequest, RpcResult } from './rpc'
import { runSmoke } from './smoke'
import { SpeechService } from './speech'

// Bundled binary resolution (extraResources) lands with packaging, ENGC-54.
const espeak = new EspeakProcess({
  binary: process.env.ESPEAK_NG ?? 'espeak-ng',
  dataPath: process.env.ESPEAK_DATA_PATH,
})
const phonemizer = new CachedPhonemizer(espeak)

// Kokoro loads lazily on the first `speak` and stays warm; one service per installed model folder.
let speech: { key: string; service: Promise<SpeechService> } | null = null
function speechFor(modelDir: string, cacheDir: string): Promise<SpeechService> {
  const key = `${modelDir}|${cacheDir}`
  if (speech?.key !== key) {
    const service = loadKokoro({ dir: modelDir, ...DEFAULT_KOKORO_FILES }, (l) =>
      espeak.phonemize(l),
    ).then((synth) => new SpeechService(synth, join(cacheDir, synth.id.replace(/[^\w.-]+/g, '_'))))
    service.catch(() => (speech?.service === service ? (speech = null) : undefined))
    speech = { key, service }
  }
  return speech.service
}
process.on('exit', () => phonemizer.dispose())

// Set by each request that carries it: where the reference-voice model and its audio cache live.
let kokoroDirs: { modelDir: string; cacheDir: string } | null = null

const inference = new InferenceService({
  loadAdapter: loadModelAdapter,
  phonemizer,
  speak: async (text) => {
    if (!kokoroDirs)
      throw new InferenceError('MODEL_MISSING', 'reference voice not installed', TTS_MODEL_ID)
    return (await (await speechFor(kokoroDirs.modelDir, kokoroDirs.cacheDir)).speak(text)).samples
  },
})
const running = new Map<number, AbortController>()
const post = (m: object) => process.parentPort.postMessage(m)

async function dispatch(req: RpcRequest, signal: AbortSignal): Promise<unknown> {
  const p = req.params as {
    audio?: Float32Array
    text?: string
    language?: string
    reference?: { audio: Float32Array } | { contour: ContourData }
    models?: ModelDirs
    kokoro?: { modelDir: string; cacheDir: string }
  }
  const opts = {
    signal,
    onStage: (stage: string) => post({ type: 'rpc-progress', id: req.id, stage }),
  }
  if (p.kokoro) kokoroDirs = p.kokoro
  switch (req.method) {
    case 'analyze':
      return inference.analyze(p.audio!, p.text!, p.language, p.models ?? {}, opts)
    case 'transcribe':
      return inference.transcribe(p.audio!, p.language, p.models ?? {}, opts)
    case 'intonation':
      return analyzeIntonation(p.audio!, p.reference!)
    case 'prosody':
      return inference.prosody(p.audio!, p.text!, p.language, p.models ?? {}, opts)
    case 'phonemize':
      return inference.phonemize(p.text!, p.language)
    case 'speak': {
      if (!p.kokoro)
        throw new InferenceError('MODEL_MISSING', 'reference voice not installed', TTS_MODEL_ID)
      return (await speechFor(p.kokoro.modelDir, p.kokoro.cacheDir)).speak(p.text!)
    }
  }
}

async function handleRpc(req: RpcRequest): Promise<void> {
  const ctl = new AbortController()
  running.set(req.id, ctl)
  let reply: RpcResult
  try {
    reply = { type: 'rpc-result', id: req.id, ok: true, value: await dispatch(req, ctl.signal) }
  } catch (e) {
    const err = toInferenceError(e)
    reply = {
      type: 'rpc-result',
      id: req.id,
      ok: false,
      code: err.code,
      message: err.message,
      ...(err.modelId ? { modelId: err.modelId } : {}),
    }
  } finally {
    running.delete(req.id)
  }
  post(reply)
}

process.parentPort.on('message', (e) => {
  const data = e.data as { type?: string; modelPath?: string }
  if (data.type === 'hello') post({ type: 'ready', pid: process.pid })
  if (data.type === 'smoke' && data.modelPath)
    void runSmoke(data.modelPath).then((report) => post({ type: 'smoke', report }))
  if (data.type === 'rpc') void handleRpc(e.data as RpcRequest)
  if (data.type === 'rpc-cancel') running.get((e.data as RpcCancel).id)?.abort()
})
