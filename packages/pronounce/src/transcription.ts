/** Word-level comparison (port of OpenPronounce `speech.py`: `clean_transcription`, `compare_transcriptions`, `_feedback`). */

import { align, splitWords } from './compare'
import { levenshtein } from './levenshtein'
import type { WordPhones } from './phonemizer'

/** Ratio of edited phones over expected phones above which a word counts as mispronounced. */
export const WORD_ERROR_THRESHOLD = 0.4

const chars = (s: string) => Array.from(s)
const round = (x: number, digits: number) => {
  const f = 10 ** digits
  return Math.round(x * f) / f
}

/** Lower-case, strip and keep only letters, apostrophes and single spaces. */
export function cleanTranscription(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-zA-Z' ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface TranscriptionError {
  /** Index of the word's first expected phone. */
  position: number
  expected: string
  actual: string
  word: string
  actualWord: string
}

export interface TranscriptionComparison {
  /** Character-level distance between the lower-cased transcript and reference. */
  wordDistance: number
  wordErrorRate: number
  phonemeErrorRate: number
  errors: TranscriptionError[]
  feedback: string
  transcribe: string
  expectedPhonemes: string[]
  transcribedPhonemes: string[]
  wordsWithErrors: string[]
}

export function feedbackText(wordsWithErrors: readonly string[]): string {
  let feedback = '🔊 Feedback on your pronunciation:\n'
  feedback += wordsWithErrors.length
    ? '❌ You need to better pronounce these words: ' + wordsWithErrors.join(', ') + '\n'
    : '✅ Your pronunciation is excellent! 🎉\n'
  return feedback
}

/**
 * Compare an ASR transcription with the reference text, word by word.
 * `reference` / `transcript` are phonemizer output (`Phonemizer.getPhonemesWithWordMapping`) for the
 * reference text and the lower-cased transcription.
 */
export function compareTranscriptions(
  transcription: string,
  textReference: string,
  reference: readonly WordPhones[],
  transcript: readonly WordPhones[],
): TranscriptionComparison {
  const transcriptionClean = transcription.toLowerCase().trim()
  const referenceClean = textReference.toLowerCase().trim()
  const wordDistance = levenshtein(chars(transcriptionClean), chars(referenceClean))

  const expectedPhonemes = reference.flatMap((w) => w.phones)
  const transcribedPhonemes = transcript.flatMap((w) => w.phones)
  const transcribedMap = transcript.flatMap((w) => w.phones.map(() => w.word))
  const alignment = align(expectedPhonemes, transcribedPhonemes)

  const errors: TranscriptionError[] = []
  const flagged: string[] = []
  let current = 0
  for (const { word, phones } of reference) {
    if (!phones.length) continue
    const first = current
    current += phones.length

    const matched = new Set<number>()
    for (let idx = first; idx < current; idx++)
      if (idx < alignment.length) for (const j of alignment[idx]!) matched.add(j)

    if (!matched.size) {
      errors.push({ position: first, expected: phones.join(''), actual: '', word, actualWord: '' })
      flagged.push(word)
      continue
    }
    const sorted = [...matched].sort((a, b) => a - b)
    const actualWords: string[] = []
    for (const t of sorted) {
      const w = transcribedMap[t]
      if (w !== undefined && actualWords.at(-1) !== w) actualWords.push(w)
    }
    const actualSeg = sorted.map((t) => transcribedPhonemes[t]!)
    if (levenshtein(phones, actualSeg) > phones.length * WORD_ERROR_THRESHOLD) {
      errors.push({
        position: first,
        expected: phones.join(''),
        actual: actualSeg.join(''),
        word,
        actualWord: actualWords.join(' '),
      })
      flagged.push(word)
    }
  }
  const wordsWithErrors = [...new Set(flagged)]

  const expectedWords = splitWords(textReference)
  const transcribedWords = splitWords(transcriptionClean)
  return {
    wordDistance,
    wordErrorRate: round(
      levenshtein(expectedWords, transcribedWords) / Math.max(1, expectedWords.length),
      4,
    ),
    phonemeErrorRate: round(
      levenshtein(expectedPhonemes, transcribedPhonemes) / Math.max(1, expectedPhonemes.length),
      4,
    ),
    errors,
    feedback: feedbackText(wordsWithErrors),
    transcribe: transcription,
    expectedPhonemes,
    transcribedPhonemes,
    wordsWithErrors,
  }
}
