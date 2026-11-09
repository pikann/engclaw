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

export const CHAPTER_ASK_KINDS = ['meaning', 'usage', 'example', 'pronounce', 'mistakes'] as const
export type ChapterAskKind = (typeof CHAPTER_ASK_KINDS)[number] | 'free'
export type ChapterTargetType = 'word' | 'phrase' | 'idiom'

/** What the tutor needs to know about one game attempt. */
export interface ChapterAttemptSummary {
  score: number
  correct: boolean
  flaggedWords: string[]
  sounds: string[]
}

export interface ChapterAskContext {
  text: string
  type: ChapterTargetType
  ipa: string
  meaning: string
  examples: readonly string[]
  attempts: readonly ChapterAttemptSummary[]
}

const MAX_ATTEMPTS = 3

/** Starts the background block of a chapter question; the chat shows only what comes before it. */
export const CHAPTER_CONTEXT_MARKER = 'Context (pronunciation game chapter). Answer briefly.'

/** The part of a user message worth showing in the chat: the question without the tutor's context. */
export function visibleUserText(text: string): string {
  const i = text.indexOf(`\n\n${CHAPTER_CONTEXT_MARKER}`)
  return i === -1 ? text : text.slice(0, i).trim()
}

interface AttemptAnalysisLike {
  differences: {
    errors: readonly {
      word: string
      phones: readonly { expected: string; heard: string; confidence?: number }[]
    }[]
  }
}

export function summarizeAttempt(
  attempt: { score: number; correct: boolean },
  analysis: AttemptAnalysisLike,
): ChapterAttemptSummary {
  const errors = analysis.differences.errors
  return {
    score: Math.round(attempt.score),
    correct: attempt.correct,
    flaggedWords: errors.map((e) => e.word),
    sounds: errors.flatMap((e) =>
      e.phones
        .filter((p) => p.expected !== p.heard)
        .map((p) => `/${p.expected}/ heard as /${p.heard}/`),
    ),
  }
}

const KIND_LABEL: Record<ChapterTargetType, string> = {
  word: 'word',
  phrase: 'phrase',
  idiom: 'idiom',
}

function chapterQuestion(
  kind: Exclude<ChapterAskKind, 'free'>,
  text: string,
  type: ChapterTargetType,
): string {
  const whole =
    type === 'word' ? '' : ` Treat the whole ${KIND_LABEL[type]} as one unit, not word by word.`
  switch (kind) {
    case 'meaning':
      return type === 'idiom'
        ? `What does the idiom "${text}" mean? Explain the whole expression, literal versus real meaning.`
        : `Explain "${text}" simply.${whole}`
    case 'usage':
      return `When do I use "${text}"? Is it formal or casual?${whole}`
    case 'example':
      return `Give me another example sentence with "${text}".`
    case 'pronounce':
      return `How do I pronounce "${text}"?`
    case 'mistakes':
      return `Why did I get "${text}" wrong in my attempts, and how do I fix it?`
  }
}

function describeAttempt(a: ChapterAttemptSummary, i: number): string {
  const parts = [`${i + 1}) score ${a.score}${a.correct ? ' (correct)' : ' (not correct)'}`]
  if (a.flaggedWords.length) parts.push(`flagged: ${a.flaggedWords.join(', ')}`)
  if (a.sounds.length) parts.push(`sounds: ${a.sounds.join('; ')}`)
  return parts.join(', ')
}

/** The message sent to the tutor from a game chapter: the question plus the chapter and attempt context. */
export function buildChapterAskMessage(
  kind: ChapterAskKind,
  chapter: ChapterAskContext,
  freeText?: string,
): string {
  const question =
    kind === 'free' ? (freeText ?? '').trim() : chapterQuestion(kind, chapter.text, chapter.type)
  const recent = chapter.attempts.slice(-MAX_ATTEMPTS)
  const lines = [
    question,
    '',
    CHAPTER_CONTEXT_MARKER,
    `- Target (${KIND_LABEL[chapter.type]}): "${chapter.text}" /${chapter.ipa}/`,
    `- Dictionary meaning: ${chapter.meaning}`,
  ]
  if (chapter.examples.length)
    lines.push(`- Examples: ${chapter.examples.map((e) => `"${e}"`).join(' | ')}`)
  lines.push(
    recent.length
      ? `- My latest attempts: ${recent.map((a, i) => describeAttempt(a, chapter.attempts.length - recent.length + i)).join(' / ')}`
      : '- My attempts: no attempts yet',
  )
  return lines.join('\n')
}
