// Inference worker entry (utility process). ML services land here in later tasks.
process.parentPort.on('message', (e) => {
  const data = e.data as { type?: string }
  if (data.type === 'hello') process.parentPort.postMessage({ type: 'ready', pid: process.pid })
})
