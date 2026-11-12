import { Converter } from 'opencc-js/t2cn'
import type { PronunciationResult } from '@engclaw/ipc-contract'
import { levenshtein, opcodes } from '@engclaw/pronounce'
import { pinyin } from 'pinyin-pro'
import { InferenceError } from './errors'

// Normalize orthography only; do not translate regional vocabulary.
const toSimplified = Converter({ from: 'tw', to: 'cn' })

export const chineseCharacters = (text: string) =>
  Array.from(toSimplified(text.normalize('NFKC')).toLowerCase()).filter((char) =>
    /[\p{L}\p{N}]/u.test(char),
  )

/** Pinyin is a reading aid; it is deliberately not presented as IPA or a phone assessment. */
export function mandarinReadings(text: string) {
  const readings = pinyin(text, { type: 'array', toneType: 'symbol' })
  return Array.from(text).flatMap((char, index) =>
    /[\p{L}\p{N}]/u.test(char) ? [{ word: char, phones: [readings[index] ?? char] }] : [],
  )
}

/** Character error rate from actual Mandarin ASR. No phone, acoustic or tone measurements are claimed. */
export function mandarinResult(text: string, transcript: string): PronunciationResult {
  const expected = chineseCharacters(text)
  const heard = chineseCharacters(transcript)
  if (!expected.length)
    throw new InferenceError('INVALID_INPUT', 'text has no speakable characters')
  const distance = levenshtein(expected, heard)
  const errors: PronunciationResult['differences']['errors'] = []
  for (const [tag, i1, i2, j1, j2] of opcodes(expected, heard)) {
    if (tag === 'equal') continue
    if (tag === 'insert') {
      errors.push({
        position: i1,
        word: '',
        expected: '',
        actual: heard.slice(j1, j2).join(''),
        actual_word: heard.slice(j1, j2).join(''),
        phone_distance: 0,
        confidence: 0,
        phones: [],
      })
    } else {
      for (let i = i1; i < i2; i++)
        errors.push({
          position: i,
          word: expected[i]!,
          expected: expected[i]!,
          actual: tag === 'delete' ? '' : (heard[j1 + i - i1] ?? ''),
          actual_word: tag === 'delete' ? '' : (heard[j1 + i - i1] ?? ''),
          phone_distance: 0,
          confidence: 0,
          phones: [],
        })
    }
  }
  const flagged = errors.filter((error) => error.word).map((error) => error.word)
  const feedback = {
    code: distance ? ('NEEDS_WORK' as const) : ('EXCELLENT' as const),
    words: flagged,
  }
  return {
    language: 'zh',
    assessment: 'character-accuracy',
    score: Math.round(100 * Math.max(0, 1 - distance / expected.length)),
    distance,
    acoustic_distance: 0,
    transcribe: transcript,
    feedback,
    prosody: { f0: [], energy: [] },
    differences: {
      word_distance: distance,
      word_error_rate: distance / expected.length,
      phoneme_distance: 0,
      phoneme_error_rate: 0,
      errors,
      feedback,
      transcribe: transcript,
      expected_vector: [],
      transcribed_vector: [],
      expected_phonemes: [],
      transcribed_phonemes: [],
      words_with_errors: flagged,
      expected_phones: [],
      heard_phones: [],
      heard_phones_confidence: [],
    },
  }
}
