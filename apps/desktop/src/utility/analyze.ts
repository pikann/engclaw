import type { InferenceProgress, PronunciationResult } from '@engclaw/ipc-contract'
import {
  acousticDistance,
  alignByPath,
  cleanTranscription,
  compareTranscriptions,
  comparePhones,
  computePronunciationScore,
  decodeCtc,
  decodeCtcText,
  fastDtw,
  logSoftmax,
  normalizeIndexed,
  type PhoneRecognition,
  type Phonemizer,
} from '@engclaw/pronounce'
import { extractEnergy, extractF0, interpolateF0 } from '@engclaw/prosody'
import { InferenceError } from './errors'
import type { ModelAdapter } from './model-adapter'

export interface Control {
  stage(stage: InferenceProgress['stage']): void
  /** Throws CANCELLED once the caller aborted; checked between model runs. */
  check(): void
}

const round = (x: number, digits: number) => Math.round(x * 10 ** digits) / 10 ** digits
const SAMPLE_RATE = 16000

export function recognizePhones(adapter: ModelAdapter, out: ModelOutputLike): PhoneRecognition {
  const logPosteriors = logSoftmax(out.logits, out.frames, out.vocabSize)
  const hits = normalizeIndexed(decodeCtc(logPosteriors, out.frames, adapter.vocab))
  return {
    phones: hits.map((h) => h.phone),
    confidences: hits.map((h) => h.confidence),
    spans: hits.map((h) => [h.start, h.end]),
    logPosteriors,
    frames: out.frames,
    vocab: adapter.vocab.tokens,
  }
}
type ModelOutputLike = Awaited<ReturnType<ModelAdapter['run']>>

/** Word ASR (upper-case, as the model emits it). */
export async function transcribeAudio(
  asr: ModelAdapter,
  audio: Float32Array,
): Promise<{ text: string; out: ModelOutputLike }> {
  const out = await asr.run(audio)
  const text = decodeCtcText(
    logSoftmax(out.logits, out.frames, out.vocabSize),
    out.frames,
    asr.vocab,
  )
  return { text: text.toUpperCase(), out }
}

const codepoints = (parts: readonly string[]) =>
  Float32Array.from([...parts.join(' ')].map((c) => c.codePointAt(0)!))

export interface AnalyzeDeps {
  phone: ModelAdapter
  asr: ModelAdapter
  phonemizer: Phonemizer
  /** Reference-voice audio (16 kHz) for the sentence. */
  reference(text: string): Promise<Float32Array>
}

/** Port of OpenPronounce `compare_audio_with_text` with the phone model enabled. */
export async function analyzeRecording(
  deps: AnalyzeDeps,
  audio: Float32Array,
  text: string,
  language: string,
  ctl: Control,
): Promise<PronunciationResult> {
  const expected = await deps.phonemizer.getPhonemesWithWordMapping(text)
  if (expected.length === 0)
    throw new InferenceError('INVALID_INPUT', 'text has no speakable words')

  ctl.check()
  ctl.stage('synthesizing')
  const referenceAudio = await deps.reference(text)

  ctl.check()
  ctl.stage('recognizing-phones')
  const rec = recognizePhones(deps.phone, await deps.phone.run(audio))

  ctl.check()
  ctl.stage('transcribing')
  const { text: transcript, out: userOut } = await transcribeAudio(deps.asr, audio)
  ctl.check()
  const refOut = await deps.asr.run(referenceAudio)
  if (!userOut.hidden || !refOut.hidden || userOut.hiddenSize !== refOut.hiddenSize)
    throw new InferenceError('FAILED', 'the ASR model returned no hidden states')

  ctl.check()
  ctl.stage('scoring')
  const dim = userOut.hiddenSize!
  const acoustic = acousticDistance(
    userOut.hidden.subarray(0, userOut.frames * dim),
    refOut.hidden.subarray(0, refOut.frames * dim),
    dim,
  )
  const cleaned = cleanTranscription(transcript)
  const heard = cleaned ? await deps.phonemizer.getPhonemesWithWordMapping(cleaned) : []
  const tc = compareTranscriptions(transcript, text, expected, heard)
  const pc = comparePhones(
    rec,
    expected.map((w) => w.word),
    expected.map((w) => w.phones),
  )

  let phonemeDistance = 0
  let expectedVector: number[] = []
  let transcribedVector: number[] = []
  if (tc.expectedPhonemes.length && tc.transcribedPhonemes.length) {
    const x = codepoints(expected.map((w) => w.phones.join('')))
    const y = codepoints(heard.map((w) => w.phones.join('')))
    const d = fastDtw(x, y, 1)
    phonemeDistance = d.distance
    const aligned = alignByPath(x, y, d.path)
    expectedVector = aligned.a
    transcribedVector = aligned.b
  }

  const score = computePronunciationScore({
    acousticDistance: acoustic.distance,
    phonemeErrorRate: pc.phoneErrorRate,
    wordErrorRate: tc.wordErrorRate,
  })

  const f0 = interpolateF0(extractF0(audio, { sampleRate: SAMPLE_RATE }))
  return {
    score,
    distance: Math.trunc(acoustic.distance * acoustic.path.length),
    acoustic_distance: round(acoustic.distance, 3),
    differences: {
      word_distance: tc.wordDistance,
      phoneme_distance: phonemeDistance,
      word_error_rate: tc.wordErrorRate,
      phoneme_error_rate: pc.phoneErrorRate,
      errors: pc.errors.map((e) => ({
        position: e.position,
        word: e.word,
        expected: e.expected,
        actual: e.actual,
        actual_word: e.actualWord,
        phone_distance: e.phoneDistance,
        confidence: e.confidence,
        phones: e.phones,
      })),
      feedback: {
        code: pc.wordsWithErrors.length ? 'NEEDS_WORK' : 'EXCELLENT',
        words: pc.wordsWithErrors,
      },
      transcribe: transcript,
      expected_vector: expectedVector,
      transcribed_vector: transcribedVector,
      expected_phonemes: expected.map((w) => w.phones.join('')),
      transcribed_phonemes: heard.map((w) => w.phones.join('')),
      words_with_errors: pc.wordsWithErrors,
      expected_phones: pc.expectedPhones,
      heard_phones: pc.heardPhones,
      heard_phones_confidence: pc.heardPhonesConfidence,
    },
    feedback: {
      code: pc.wordsWithErrors.length ? 'NEEDS_WORK' : 'EXCELLENT',
      words: pc.wordsWithErrors,
    },
    transcribe: transcript,
    language,
    prosody: {
      f0: Array.from(f0, (v) => round(v, 3)),
      energy: Array.from(extractEnergy(audio), (v) => round(v, 3)),
    },
  }
}
