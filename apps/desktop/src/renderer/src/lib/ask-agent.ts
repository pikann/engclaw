export const ASK_KINDS = ['explain', 'sentence', 'pronounce', 'mistakes'] as const
export type AskKind = (typeof ASK_KINDS)[number]

const QUESTIONS: Record<AskKind, (word: string) => string> = {
  explain: (w) => `Explain "${w}" simply.`,
  sentence: (w) => `Use "${w}" in a sentence.`,
  pronounce: (w) => `How do I pronounce "${w}"?`,
  mistakes: (w) => `What are common mistakes with "${w}"?`,
}

const MAX_CONTEXT_CHARS = 300

/** The message sent to the tutor: the quick question, plus the sentence the word came from if known. */
export function buildAskMessage(kind: AskKind, word: string, context?: string | null): string {
  const question = QUESTIONS[kind](word)
  const sentence = context?.replace(/\s+/g, ' ').trim()
  if (!sentence) return question
  return `${question}\nI came across it in this sentence: "${sentence.slice(0, MAX_CONTEXT_CHARS)}"`
}

const SENTENCE_END = /[.!?…]/

/** The sentence of `text` that contains the character at `offset`. */
export function sentenceAround(text: string, offset: number): string {
  let start = offset
  while (start > 0 && !SENTENCE_END.test(text[start - 1]!)) start--
  let end = offset
  while (end < text.length && !SENTENCE_END.test(text[end]!)) end++
  if (end < text.length) end++
  return text.slice(start, end).trim()
}
