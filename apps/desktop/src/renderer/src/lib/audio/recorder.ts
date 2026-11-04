import { SilenceDetector } from './vad'
import { MAX_CLIP_SECONDS } from './clip'
import { resampleLinear, TARGET_SAMPLE_RATE } from './resample'
import workletUrl from './recorder.worklet.ts?worker&url'

export interface RecorderOptions {
  deviceId?: string
  onTick?: (seconds: number) => void
  /** Fired when recording ends on its own (silence or max length); call stop() to collect. */
  onAutoStop?: (reason: 'silence' | 'max') => void
}

export interface Recording {
  /** 16 kHz mono float PCM. */
  samples: Float32Array
  sampleRate: typeof TARGET_SAMPLE_RATE
  seconds: number
}

export class Recorder {
  private ctx?: AudioContext
  private stream?: MediaStream
  private node?: AudioWorkletNode
  private chunks: Float32Array[] = []
  private total = 0
  private vad?: SilenceDetector
  private stopped = false

  constructor(private readonly opts: RecorderOptions = {}) {}

  /** Throws the underlying getUserMedia error; classify it with classifyMicError. */
  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: this.opts.deviceId ? { exact: this.opts.deviceId } : undefined,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    })
    const ctx = new AudioContext()
    this.ctx = ctx
    await ctx.audioWorklet.addModule(workletUrl)
    const src = ctx.createMediaStreamSource(this.stream)
    const node = new AudioWorkletNode(ctx, 'recorder', { numberOfOutputs: 0 })
    this.node = node
    this.vad = new SilenceDetector({ sampleRate: ctx.sampleRate })
    node.port.onmessage = (e: MessageEvent<Float32Array>) => this.onFrame(e.data, ctx.sampleRate)
    src.connect(node)
  }

  private onFrame(frame: Float32Array, rate: number): void {
    if (this.stopped) return
    this.chunks.push(frame)
    this.total += frame.length
    this.opts.onTick?.(this.total / rate)
    if (this.total / rate >= MAX_CLIP_SECONDS) this.opts.onAutoStop?.('max')
    else if (this.vad?.push(frame)) this.opts.onAutoStop?.('silence')
  }

  async stop(): Promise<Recording> {
    this.stopped = true
    const rate = this.ctx?.sampleRate ?? TARGET_SAMPLE_RATE
    this.node?.disconnect()
    this.stream?.getTracks().forEach((t) => t.stop())
    await this.ctx?.close()
    const all = new Float32Array(this.total)
    let off = 0
    for (const c of this.chunks) {
      all.set(c, off)
      off += c.length
    }
    const samples = resampleLinear(all, rate, TARGET_SAMPLE_RATE)
    return { samples, sampleRate: TARGET_SAMPLE_RATE, seconds: samples.length / TARGET_SAMPLE_RATE }
  }
}
