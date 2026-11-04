/** Plays mono PCM through the default output; resolves when playback ends. `stop()` ends it early. */
export function playPcm(
  samples: Float32Array,
  sampleRate: number,
): { done: Promise<void>; stop: () => void } {
  const ctx = new AudioContext()
  const buffer = ctx.createBuffer(1, samples.length, sampleRate)
  buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0)
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(ctx.destination)
  const done = new Promise<void>((resolve) => {
    source.onended = () => {
      void ctx.close()
      resolve()
    }
  })
  source.start()
  return { done, stop: () => source.stop() }
}
