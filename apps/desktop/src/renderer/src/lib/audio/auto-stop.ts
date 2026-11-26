/**
 * Silence auto-stop for a live recording: 2 s of silence after speech. The speech model in the
 * utility process decides; the loudness detector listens alongside and takes over if the model
 * fails or falls too far behind.
 */
import type { EngclawApi } from '@engclaw/ipc-contract'
import { SpeechEndpoint, TARGET_SAMPLE_RATE, VAD_FRAME } from '@engclaw/pronounce'
import { SilenceDetector } from './vad'

export type VadClient = EngclawApi['inference']['vad']

/** Frames collected before asking (about 0.1 s), and the most one request carries. */
const MIN_BATCH = 3
const MAX_BATCH = 64
/** Unanswered audio beyond this means the model cannot keep up. */
const MAX_BACKLOG = 3 * TARGET_SAMPLE_RATE

export class AutoStop {
  private readonly loudness: SilenceDetector
  private readonly endpoint = new SpeechEndpoint()
  /** Input samples per 16 kHz sample. */
  private readonly ratio: number
  /** Microphone samples not yet resampled, and where the next output falls among them. */
  private input = new Float32Array(0)
  private position = 0
  /** 16 kHz samples not yet sent. */
  private pending: number[] = []
  private state: Float32Array | undefined
  private asking = false
  private useModel = true
  private done = false

  constructor(private readonly opts: { sampleRate: number; vad: VadClient; onStop: () => void }) {
    this.loudness = new SilenceDetector({ sampleRate: opts.sampleRate })
    this.ratio = opts.sampleRate / TARGET_SAMPLE_RATE
  }

  /** Feed the next microphone frame. */
  push(frame: Float32Array): void {
    if (this.done) return
    const quiet = this.loudness.push(frame)
    if (this.useModel) {
      this.resample(frame)
      if (this.pending.length > MAX_BACKLOG) this.useModel = false
      else return this.ask()
    }
    if (quiet) this.stop()
  }

  /** The recording ended; late answers are ignored. */
  close(): void {
    this.done = true
  }

  private stop(): void {
    this.done = true
    this.opts.onStop()
  }

  /** Linear resampling that carries its position from one frame to the next. */
  private resample(frame: Float32Array): void {
    const input = new Float32Array(this.input.length + frame.length)
    input.set(this.input)
    input.set(frame, this.input.length)
    let at = this.position
    for (; at + 1 < input.length; at += this.ratio) {
      const i = Math.floor(at)
      this.pending.push(input[i]! + (input[i + 1]! - input[i]!) * (at - i))
    }
    const used = Math.min(Math.floor(at), input.length)
    this.input = input.slice(used)
    this.position = at - used
  }

  private ask(): void {
    const frames = Math.min(Math.floor(this.pending.length / VAD_FRAME), MAX_BATCH)
    if (this.asking || frames < MIN_BATCH) return
    this.asking = true
    const audio = Float32Array.from(this.pending.splice(0, frames * VAD_FRAME))
    const giveUp = () => {
      this.useModel = false
    }
    void Promise.resolve()
      .then(() => this.opts.vad({ frames: audio, state: this.state }))
      .then((result) => {
        this.asking = false
        if (this.done || !this.useModel) return
        if (!result.ok) return giveUp()
        this.state = result.value.state
        for (const p of result.value.probs) if (this.endpoint.push(p)) return this.stop()
        this.ask()
      })
      .catch(giveUp)
  }
}
