import { useCallback, useMemo, useRef, useState } from 'react'
import {
  gradeAnswer,
  makeBlanks,
  reviewList,
  seededRandom,
  sessionScore,
  tokenizeSentence,
  type SegmentResult,
} from './dictation'
import type { Segment } from './shadowing'

export interface DictationEntry {
  /** Token indices hidden in this segment; fixed until "New blanks". */
  blanks: number[]
  answers: string[]
  result: SegmentResult | null
}

/** Dictation state of one video: blanks, typed answers and check results per segment. */
export function useDictation(segments: readonly Segment[], percent: number) {
  const [entries, setEntries] = useState<ReadonlyMap<number, DictationEntry>>(new Map())
  const entriesRef = useRef(entries)
  const seed = useRef(Math.floor(Math.random() * 2 ** 31))

  const freshBlanks = useCallback(
    (index: number): DictationEntry => {
      const blanks = makeBlanks(segments[index]?.text ?? '', percent, seededRandom(seed.current++))
      return { blanks, answers: blanks.map(() => ''), result: null }
    },
    [segments, percent],
  )

  const update = useCallback(
    (index: number, fn: (e: DictationEntry | undefined) => DictationEntry) => {
      const next = new Map(entriesRef.current).set(index, fn(entriesRef.current.get(index)))
      entriesRef.current = next
      setEntries(next)
    },
    [],
  )

  const ensure = useCallback(
    (index: number) => {
      if (!entriesRef.current.has(index)) update(index, () => freshBlanks(index))
    },
    [freshBlanks, update],
  )

  const setAnswer = useCallback(
    (index: number, blank: number, value: string) =>
      update(index, (e) => {
        const base = e ?? freshBlanks(index)
        if (base.result) return base
        return { ...base, answers: base.answers.map((a, i) => (i === blank ? value : a)) }
      }),
    [update, freshBlanks],
  )

  const check = useCallback(
    (index: number): SegmentResult | null => {
      const text = segments[index]?.text
      if (text === undefined) return null
      let result!: SegmentResult
      update(index, (e) => {
        const base = e ?? freshBlanks(index)
        const tokens = tokenizeSentence(text)
        const expected = base.blanks.map((b) => tokens[b]!.word)
        result = {
          expected,
          answers: base.answers,
          grades: base.answers.map((a, i) => gradeAnswer(a, expected[i]!)),
        }
        return { ...base, result }
      })
      return result
    },
    [segments, update, freshBlanks],
  )

  const newBlanks = useCallback(
    (index: number) => update(index, () => freshBlanks(index)),
    [update, freshBlanks],
  )

  const retry = useCallback(
    (index: number) =>
      update(index, (e) => {
        const base = e ?? freshBlanks(index)
        return { ...base, answers: base.blanks.map(() => ''), result: null }
      }),
    [update, freshBlanks],
  )

  const results = useMemo(() => {
    const m = new Map<number, SegmentResult>()
    for (const [i, e] of entries) if (e.result) m.set(i, e.result)
    return m
  }, [entries])
  const score = useMemo(() => sessionScore(results), [results])
  const review = useMemo(() => reviewList(results), [results])

  return { entries, ensure, setAnswer, check, newBlanks, retry, results, score, review }
}
