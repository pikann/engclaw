// Inference worker entry (utility process). ML services land here in later tasks.
import { join } from 'node:path'
import { CachedPhonemizer } from '@engclaw/pronounce'
import { EspeakProcess } from './espeak'
import { DEFAULT_KOKORO_FILES, loadKokoro } from './kokoro'
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

process.parentPort.on('message', (e) => {
  const data = e.data as {
    type?: string
    modelPath?: string
    id?: number
    text?: string
    modelDir?: string
    cacheDir?: string
  }
  if (data.type === 'hello') process.parentPort.postMessage({ type: 'ready', pid: process.pid })
  if (data.type === 'smoke' && data.modelPath)
    void runSmoke(data.modelPath).then((report) =>
      process.parentPort.postMessage({ type: 'smoke', report }),
    )
  if (data.type === 'phonemize' && typeof data.text === 'string')
    phonemizer.getPhonemesWithWordMapping(data.text).then(
      (words) => process.parentPort.postMessage({ type: 'phonemized', id: data.id, words }),
      (err: Error) =>
        process.parentPort.postMessage({ type: 'phonemized', id: data.id, error: err.message }),
    )
  if (data.type === 'speak' && typeof data.text === 'string' && data.modelDir && data.cacheDir)
    speechFor(data.modelDir, data.cacheDir)
      .then((svc) => svc.speak(data.text!))
      .then(
        (r) => process.parentPort.postMessage({ type: 'spoke', id: data.id, ...r }),
        (err: Error) =>
          process.parentPort.postMessage({ type: 'spoke', id: data.id, error: err.message }),
      )
})
