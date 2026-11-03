// Inference worker entry (utility process). ML services land here in later tasks.
import { runSmoke } from './smoke'

process.parentPort.on('message', (e) => {
  const data = e.data as { type?: string; modelPath?: string }
  if (data.type === 'hello') process.parentPort.postMessage({ type: 'ready', pid: process.pid })
  if (data.type === 'smoke' && data.modelPath)
    void runSmoke(data.modelPath).then((report) =>
      process.parentPort.postMessage({ type: 'smoke', report }),
    )
})
