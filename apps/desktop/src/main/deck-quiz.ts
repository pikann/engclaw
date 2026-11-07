import {
  firstPronunciation,
  primaryDefinition,
  randomDefinitions,
  type SqlDb,
} from '@engclaw/dictionary'
import type { DeckQuizQuestion } from '@engclaw/ipc-contract'

const OPTIONS = 4

const shuffle = <T>(items: T[], rng: () => number): T[] => {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/** Word-to-definition multiple choice for up to `count` of `words`; words without a definition are skipped. */
export function buildQuiz(
  db: SqlDb,
  words: string[],
  count: number,
  rng: () => number = Math.random,
): DeckQuizQuestion[] {
  const questions: DeckQuizQuestion[] = []
  for (const word of shuffle(words, rng)) {
    if (questions.length >= count) break
    const definition = primaryDefinition(db, word)
    if (!definition) continue
    const distractors = randomDefinitions(db, word, definition, OPTIONS - 1)
    if (distractors.length === 0) continue
    const options = shuffle([definition, ...distractors], rng)
    questions.push({
      word,
      ipa: firstPronunciation(db, word),
      options,
      answer: options.indexOf(definition),
    })
  }
  return questions
}
