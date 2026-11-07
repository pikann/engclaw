import { describe, expect, it } from 'vitest'
import { heatLevel, nextQuestion, percent, pickAnswer, quizDone, startQuiz } from './deck'

const q = (answer: number) => ({ word: 'w', ipa: null, options: ['a', 'b', 'c'], answer })

describe('heatLevel', () => {
  it('is 0 without reviews and scales to 4 at the busiest day', () => {
    expect(heatLevel(0, 10)).toBe(0)
    expect(heatLevel(1, 10)).toBe(1)
    expect(heatLevel(5, 10)).toBe(2)
    expect(heatLevel(10, 10)).toBe(4)
    expect(heatLevel(3, 0)).toBe(0)
  })
})

describe('percent', () => {
  it('rounds and tolerates null', () => {
    expect(percent(0.666)).toBe('67%')
    expect(percent(null)).toBe('')
  })
})

describe('quiz state', () => {
  it('scores correct picks, ignores a second pick, and finishes after the last question', () => {
    let s = startQuiz([q(1), q(0)])
    s = pickAnswer(s, 1)
    expect(s.score).toBe(1)
    s = pickAnswer(s, 0)
    expect(s).toMatchObject({ picked: 1, score: 1 })
    s = nextQuestion(s)
    expect(s).toMatchObject({ index: 1, picked: null })
    s = pickAnswer(s, 2)
    expect(s.score).toBe(1)
    expect(quizDone(s)).toBe(false)
    expect(quizDone(nextQuestion(s))).toBe(true)
  })

  it('cannot advance before answering', () => {
    const s = startQuiz([q(0)])
    expect(nextQuestion(s)).toBe(s)
  })
})
