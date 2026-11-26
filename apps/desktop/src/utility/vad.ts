/** Silero VAD (v6.3, MIT; `resources/vad/`): the probability that each 32 ms frame is speech. */
import { VAD_FRAME } from '@engclaw/pronounce'
import { createSession } from './sessions'

/** Samples of the previous frame the model sees again. */
const CONTEXT = 64
/** What the model remembers of one recording: its recurrent state, then the context samples. */
const MEMORY = 256
const STATE = MEMORY + CONTEXT

export interface VadChunk {
  /** One speech probability per frame of the audio given. */
  probs: number[]
  /** Pass back with the next piece of the same recording. */
  state: Float32Array
}

export interface SileroVad {
  /** The next whole frames (16 kHz mono) of one recording; no state starts a new one. */
  process(frames: Float32Array, state?: Float32Array): Promise<VadChunk>
  /** One probability per frame of a whole clip; a final partial frame is zero-padded. */
  probabilities(audio: Float32Array): Promise<number[]>
  dispose(): Promise<void>
}

export async function loadSileroVad(
  path: string,
  make: typeof createSession = createSession,
): Promise<SileroVad> {
  // The model is tiny and runs every 32 ms, so the CPU is the right place for it.
  const { ort, session } = await make(path, ['cpu'])
  const rate = new ort.Tensor('int64', BigInt64Array.from([16000n]), [])

  const step = async (frames: Float32Array, state?: Float32Array): Promise<VadChunk> => {
    if (frames.length % VAD_FRAME !== 0)
      throw new Error(`VAD audio must be whole frames of ${VAD_FRAME} samples`)
    if (state && state.length !== STATE) throw new Error('not a VAD state')
    let memory = state?.slice(0, MEMORY) ?? new Float32Array(MEMORY)
    const input = new Float32Array(CONTEXT + VAD_FRAME)
    input.set(state?.subarray(MEMORY) ?? new Float32Array(CONTEXT))
    const probs: number[] = []
    for (let at = 0; at < frames.length; at += VAD_FRAME) {
      input.set(frames.subarray(at, at + VAD_FRAME), CONTEXT)
      const out = await session.run({
        input: new ort.Tensor('float32', input.slice(), [1, input.length]),
        state: new ort.Tensor('float32', memory, [2, 1, 128]),
        sr: rate,
      })
      memory = Float32Array.from(out['stateN']!.data as Float32Array)
      probs.push((out['output']!.data as Float32Array)[0]!)
      input.copyWithin(0, VAD_FRAME)
    }
    const next = new Float32Array(STATE)
    next.set(memory)
    next.set(input.subarray(0, CONTEXT), MEMORY)
    return { probs, state: next }
  }

  return {
    process: step,
    async probabilities(audio) {
      const whole = new Float32Array(Math.ceil(audio.length / VAD_FRAME) * VAD_FRAME)
      whole.set(audio)
      return (await step(whole)).probs
    },
    dispose: () => session.release(),
  }
}
