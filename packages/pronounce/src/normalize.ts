/** Phone normalization (port of `normalize_phone` / `_normalize_indexed`). */

import type { PhoneHit } from './types'

const TOKEN_ALIASES: Record<string, string> = {
  th: 't',
  kh: 'k',
  ph: 'p',
  tʰ: 't',
  kʰ: 'k',
  pʰ: 'p',
  ai: 'aɪ',
  ei: 'eɪ',
  au: 'aʊ',
  ou: 'oʊ',
}

const PHONE_MAP: Record<string, Record<string, string>> = {
  en: { ᵻ: 'ɪ', ɐ: 'ə', ɔ: 'ɑ', ɔɹ: 'oɹ', ɜ: 'ɚ', ɾ: 't', ɫ: 'l' },
}

export function normalizePhone(s: string, lang = 'en'): string {
  const base = s.replace(/[0-9]/g, '').replace(/ː/g, '')
  const aliased = TOKEN_ALIASES[base] ?? base
  return PHONE_MAP[lang]?.[aliased] ?? aliased
}

/** Normalize hits, then merge immediate repeats and `ɚ ɹ` -> `ɚ` (max confidence, span union). */
export function normalizeIndexed(hits: readonly PhoneHit[], lang = 'en'): PhoneHit[] {
  const out: PhoneHit[] = []
  for (const hit of hits) {
    const phone = normalizePhone(hit.phone, lang)
    if (!phone) continue
    const prev = out[out.length - 1]
    if (prev && (prev.phone === phone || (prev.phone === 'ɚ' && phone === 'ɹ'))) {
      prev.confidence = Math.max(prev.confidence, hit.confidence)
      prev.start = Math.min(prev.start, hit.start)
      prev.end = Math.max(prev.end, hit.end)
    } else out.push({ ...hit, phone })
  }
  return out
}

/** Normalize a phone sequence and collapse immediate repetitions ("ɚ ɹ" -> "ɚ", "d d" -> "d"). */
export function normalizePhones(phones: readonly string[], lang = 'en'): string[] {
  return normalizeIndexed(
    phones.map((phone) => ({ phone, confidence: 1, start: 0, end: 0 })),
    lang,
  ).map((hit) => hit.phone)
}
