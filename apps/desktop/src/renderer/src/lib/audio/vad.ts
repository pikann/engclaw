/** Energy-based silence auto-stop (port of static/audio.js: 2 s of silence after speech). */

export const SILENCE_STOP_SECONDS = 2
export const SPEECH_RMS_THRESHOLD = 0.01

export function frameRms(frame: Float32Array): number {
  if (frame.length === 0) return 0
  let sum = 0
  for (const v of frame) sum += v * v
  return Math.sqrt(sum / frame.length)
}

export class SilenceDetector {
  private heardSpeech = false
  private silentSamples = 0
  private readonly limit: number
  private readonly threshold: number

  constructor(opts: { sampleRate: number; silenceSeconds?: number; threshold?: number }) {
    this.limit = Math.round(opts.sampleRate * (opts.silenceSeconds ?? SILENCE_STOP_SECONDS))
    this.threshold = opts.threshold ?? SPEECH_RMS_THRESHOLD
  }

  /** Feed the next frame; returns true once recording should stop. */
  push(frame: Float32Array): boolean {
    if (frameRms(frame) >= this.threshold) {
      this.heardSpeech = true
      this.silentSamples = 0
      return false
    }
    if (!this.heardSpeech) return false
    this.silentSamples += frame.length
    return this.silentSamples >= this.limit
  }
}
