import { encodePcmWav } from '../../../../shared/pcm-wav'

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

/** Slow reference playback while retaining the pitch contour of the original audio. */
export function playSlowPcm(samples: Float32Array, sampleRate: number, rate: number) {
  const url = URL.createObjectURL(
    new Blob([encodePcmWav(samples, sampleRate)], { type: 'audio/wav' }),
  )
  const player = new Audio(url)
  player.defaultPlaybackRate = rate
  player.playbackRate = rate
  player.preservesPitch = true

  let finish: (error?: unknown) => void
  const done = new Promise<void>((resolve, reject) => {
    let finished = false
    finish = (error) => {
      if (finished) return
      finished = true
      player.onended = null
      player.onerror = null
      player.pause()
      player.removeAttribute('src')
      player.load()
      URL.revokeObjectURL(url)
      if (error) reject(error)
      else resolve()
    }
    player.onended = () => finish()
    player.onerror = () => finish(player.error ?? new Error('Reference playback failed'))
    void player.play().catch(finish)
  })
  return { done, stop: () => finish() }
}
