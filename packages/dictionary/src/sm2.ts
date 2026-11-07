export type Grade = 'again' | 'hard' | 'good' | 'easy'

export const GRADES: readonly Grade[] = ['again', 'hard', 'good', 'easy']
export const GRADE_Q: Record<Grade, number> = { again: 1, hard: 3, good: 4, easy: 5 }
export const MATURE_DAYS = 21
export const INITIAL_EASE = 2.5
export const MIN_EASE = 1.3
const DAY_START_HOUR = 4
const DAY_MS = 86_400_000

export interface CardState {
  ease: number
  /** Days until the next review. 0 for a card that was never reviewed. */
  interval: number
  repetitions: number
  lapses: number
  /** Study day (see {@link studyDay}) the card is due on. */
  due: number
}

export const newCard = (today: number): CardState => ({
  ease: INITIAL_EASE,
  interval: 0,
  repetitions: 0,
  lapses: 0,
  due: today,
})

/** Whole local days since the epoch, where a day runs 04:00 to 04:00. `tzOffsetMin` is `getTimezoneOffset()`. */
export function studyDay(ms: number, tzOffsetMin = new Date(ms).getTimezoneOffset()): number {
  return Math.floor((ms - tzOffsetMin * 60_000 - DAY_START_HOUR * 3_600_000) / DAY_MS)
}

/** Classic SM-2: returns the next state of `card` after a review on study day `today`. */
export function review(card: CardState, grade: Grade, today: number): CardState {
  if (grade === 'again') {
    return {
      ...card,
      repetitions: 0,
      interval: 1,
      due: today + 1,
      lapses: card.lapses + (card.repetitions > 0 || card.interval > 0 ? 1 : 0),
    }
  }
  const q = GRADE_Q[grade]
  const ease = Math.max(MIN_EASE, card.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
  const repetitions = card.repetitions + 1
  const interval =
    repetitions === 1
      ? 1
      : repetitions === 2
        ? 6
        : Math.max(card.interval + 1, Math.round(card.interval * card.ease))
  return { ease, interval, repetitions, lapses: card.lapses, due: today + interval }
}
