// Inference worker entry (utility process). ML services land here in later tasks.
import { CachedPhonemizer } from '@engclaw/pronounce'
import { EspeakProcess } from './espeak'
import { runSmoke } from './smoke'

// Bundled binary resolution (extraResources) lands with packaging, ENGC-54.
const phonemizer = new CachedPhonemizer(
  new EspeakProcess({
    binary: process.env.ESPEAK_NG ?? 'espeak-ng',
    dataPath: process.env.ESPEAK_DATA_PATH,
  }),
)
process.on('exit', () => phonemizer.dispose())

process.parentPort.on('message', (e) => {
  const data = e.data as { type?: string; modelPath?: string; id?: number; text?: string }
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
})
