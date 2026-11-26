/**
 * Reading Silero VAD's speech probabilities. Shared by the recorder (when to stop) and the
 * recognizer (where to cut); the thresholds were compared in ENGC-124.
 */

/** Samples per probability: the model's frame at 16 kHz (32 ms). */
export const VAD_FRAME = 512
/** A frame is speech at or above this probability… */
export const SPEECH_ON = 0.3
/** …and silence only below this one. */
export const SPEECH_OFF = 0.15
/** Fewer speech frames than this (about 0.1 s) is a click, not a word. */
export const MIN_SPEECH_FRAMES = 3

const SAMPLE_RATE = 16000

/** Says when a recording is over: silence of `silenceSeconds` after someone has spoken. */
export class SpeechEndpoint {
  private speech = 0
  private silent = 0
  private readonly limit: number

  constructor(silenceSeconds = 2) {
    this.limit = Math.round((silenceSeconds * SAMPLE_RATE) / VAD_FRAME)
  }

  /** Feed the next frame's probability; returns true once recording should stop. */
  push(probability: number): boolean {
    if (probability >= SPEECH_ON) {
      this.speech++
      this.silent = 0
    } else if (probability < SPEECH_OFF && this.speech >= MIN_SPEECH_FRAMES) this.silent++
    return this.speech >= MIN_SPEECH_FRAMES && this.silent >= this.limit
  }
}
