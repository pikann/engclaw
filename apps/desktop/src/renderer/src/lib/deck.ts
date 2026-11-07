import type { DeckGrade, DeckQuizQuestion } from '@engclaw/ipc-contract'

export const GRADE_KEYS: Record<string, DeckGrade> = {
  '1': 'again',
  '2': 'hard',
  '3': 'good',
  '4': 'easy',
}

/** 0 for no reviews, then 1..4 scaled against the busiest day. */
export function heatLevel(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || max <= 0) return 0
  return Math.min(4, Math.max(1, Math.ceil((count / max) * 4))) as 1 | 2 | 3 | 4
}

export const percent = (value: number | null): string =>
  value === null ? '' : `${Math.round(value * 100)}%`

export interface QuizState {
  questions: DeckQuizQuestion[]
  index: number
  picked: number | null
  score: number
}

export const startQuiz = (questions: DeckQuizQuestion[]): QuizState => ({
  questions,
  index: 0,
  picked: null,
  score: 0,
})

export const quizDone = (s: QuizState): boolean => s.index >= s.questions.length

/** Records an answer once per question; later picks on the same question are ignored. */
export function pickAnswer(s: QuizState, option: number): QuizState {
  const q = s.questions[s.index]
  if (!q || s.picked !== null) return s
  return { ...s, picked: option, score: s.score + (option === q.answer ? 1 : 0) }
}

export const nextQuestion = (s: QuizState): QuizState =>
  s.picked === null ? s : { ...s, index: s.index + 1, picked: null }
