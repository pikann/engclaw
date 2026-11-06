import type { IpaWord } from '@engclaw/ipc-contract'

export interface IpaToken {
  text: string
  /** IPA of the word(s) in `text`, or null for punctuation-only pieces. */
  ipa: string | null
}

const WORD = /\b[\w']+\b/g

/**
 * Pairs the whitespace-separated pieces of a sentence with the IPA words the phonemizer returned
 * for it. Returns null when the counts disagree, so a misaligned line is hidden rather than wrong.
 */
export function alignIpa(text: string, words: readonly IpaWord[]): IpaToken[] | null {
  let next = 0
  const tokens: IpaToken[] = []
  for (const piece of text.split(/\s+/).filter(Boolean)) {
    const n = piece.match(WORD)?.length ?? 0
    if (n === 0) {
      tokens.push({ text: piece, ipa: null })
      continue
    }
    const slice = words.slice(next, next + n)
    next += n
    tokens.push({ text: piece, ipa: slice.map((w) => w.ipa).join(' ') })
  }
  return next === words.length && tokens.every((t) => t.ipa === null || t.ipa !== '')
    ? tokens
    : null
}
