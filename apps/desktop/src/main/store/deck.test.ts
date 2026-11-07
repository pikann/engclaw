import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { DeckStore } from './deck'
import { migrate } from './migrations'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const T0 = Date.UTC(2026, 2, 10, 12) // noon UTC; tz offset 0 in tests
const limits = { newPerDay: 2, reviewsPerDay: 2 }

let clock: number
let db: Database.Database
let deck: DeckStore
const open = (): DeckStore => new DeckStore(db, () => clock, 0)

beforeEach(() => {
  clock = T0
  db = new Database(':memory:')
  migrate(db)
  deck = open()
})

describe('deck membership', () => {
  it('adds words once, skipping ones already in the deck', () => {
    expect(deck.add(['inspect', 'spectator', 'inspect'])).toEqual({ added: 2, skipped: 0 })
    expect(deck.add(['inspect', 'prospect'])).toEqual({ added: 1, skipped: 1 })
    expect(deck.has(['spectator', 'nope', 'prospect'])).toEqual(['spectator', 'prospect'])
  })

  it('removes a word', () => {
    deck.add(['inspect'])
    expect(deck.remove('inspect')).toBe(true)
    expect(deck.remove('inspect')).toBe(false)
    expect(deck.cards()).toEqual([])
  })
})

describe('studying', () => {
  it('offers new cards up to the daily limit, then nothing until tomorrow', () => {
    deck.add(['a', 'b', 'c'])
    expect(deck.remaining(limits)).toEqual({ new: 2, due: 0 })
    deck.review(deck.next(limits)!.word, 'good')
    deck.review(deck.next(limits)!.word, 'good')
    expect(deck.next(limits)).toBeNull()
    clock += DAY
    expect(deck.next(limits)?.word).toBeDefined()
  })

  it('persists the SM-2 result and shows a reviewed card again when it is due', () => {
    deck.add(['a'])
    const card = deck.review('a', 'good')
    expect(card).toMatchObject({ repetitions: 1, interval: 1, lastReviewedAt: T0 })
    expect(deck.next(limits)).toBeNull()
    clock += DAY
    expect(open().next(limits)?.word).toBe('a')
    expect(open().cards()[0]).toMatchObject({ interval: 1, repetitions: 1 })
  })

  it('serves due reviews before new cards and respects the review limit', () => {
    deck.add(['a', 'b', 'c', 'd'])
    deck.review('a', 'good')
    deck.review('b', 'good')
    clock += DAY
    deck.add(['e'])
    expect(deck.next(limits)?.word).toBe('a')
    deck.review('a', 'good')
    deck.review('b', 'good')
    expect(deck.remaining(limits).due).toBe(0)
    expect(deck.next(limits)?.word).toBe('c') // new cards continue after the reviews
  })

  it('does not count a new card re-shown after Again as a review against the review limit', () => {
    deck.add(['a'])
    deck.review('a', 'again')
    expect(deck.cards()[0]).toMatchObject({ interval: 1, lapses: 0 })
    clock += DAY
    expect(deck.remaining(limits)).toEqual({ new: 0, due: 1 })
  })

  it('a root drill only serves the given words and ignores daily limits', () => {
    deck.add(['a', 'b', 'c', 'd'])
    const drill = ['b', 'c', 'd']
    drill.forEach(() => deck.review(deck.next(limits, drill)!.word, 'good'))
    expect(
      deck
        .cards()
        .filter((c) => c.lastReviewedAt !== null)
        .map((c) => c.word),
    ).toEqual(drill)
    expect(deck.next(limits, ['a'])?.word).toBe('a')
    expect(deck.next(limits, ['zzz'])).toBeNull()
  })

  it('rejects reviewing a word that is not in the deck', () => {
    expect(() => deck.review('ghost', 'good')).toThrow(/not in the deck/)
  })
})

describe('stats', () => {
  it('counts new, learning, mature and due cards', () => {
    deck.add(['new', 'learn', 'old'])
    deck.review('learn', 'good')
    db.prepare(
      "UPDATE card SET interval = 30, repetitions = 4, last_reviewed_at = 1, due = ? WHERE word = 'old'",
    ).run(Math.floor(T0 / DAY) + 20)
    const s = deck.stats()
    expect(s).toMatchObject({ total: 3, newCards: 1, learning: 1, mature: 1, dueToday: 0 })
    clock += DAY
    expect(open().stats().dueToday).toBe(1)
  })

  it('computes retention, a 30-day heatmap and a streak that survives an empty today', () => {
    deck.add(['a', 'b'])
    deck.review('a', 'good')
    deck.review('b', 'again')
    clock += DAY
    open().review('a', 'easy')
    clock += DAY // today has no reviews yet; streak runs through yesterday
    const s = open().stats()
    expect(s.retention).toBeCloseTo(2 / 3)
    expect(s.streak).toBe(2)
    expect(s.heatmap).toHaveLength(30)
    expect(s.heatmap.at(-1)!.count).toBe(0)
    expect(s.heatmap.at(-2)!.count).toBe(1)
    expect(s.heatmap.at(-3)!.count).toBe(2)
    clock += DAY
    expect(open().stats().streak).toBe(0)
  })

  it('reports null retention and accuracy before any activity', () => {
    expect(deck.stats()).toMatchObject({ retention: null, quizAccuracy: null, streak: 0 })
  })

  it('records quiz answers for accuracy without touching schedules', () => {
    deck.add(['a'])
    const before = deck.cards()
    deck.recordQuiz('a', true)
    deck.recordQuiz('a', false)
    deck.recordQuiz('a', true)
    expect(deck.stats().quizAccuracy).toBeCloseTo(2 / 3)
    expect(deck.cards()).toEqual(before)
    expect(db.prepare('SELECT COUNT(*) AS n FROM review_log').get()).toEqual({ n: 0 })
  })

  it('lists mature words', () => {
    deck.add(['a', 'b'])
    db.prepare("UPDATE card SET interval = 21, last_reviewed_at = 1 WHERE word = 'a'").run()
    expect([...deck.matureWords()]).toEqual(['a'])
  })
})

describe('export / import', () => {
  const known = (w: string): boolean => w !== 'gone'

  it('round-trips cards, schedules and the review log', () => {
    deck.add(['a', 'b'])
    deck.review('a', 'good')
    clock += DAY
    deck.review('a', 'hard')
    const file = JSON.parse(JSON.stringify(deck.export()))
    const cards = deck.cards()
    const reviews = file.reviews

    deck.clear()
    expect(deck.cards()).toEqual([])
    expect(deck.import(file, known)).toEqual({ imported: 2, updated: 0, skipped: 0 })
    expect(deck.cards()).toEqual(cards)
    expect(deck.export().reviews).toEqual(reviews)
  })

  it('merges: the more recently reviewed card wins, local-only cards stay, nothing is deleted', () => {
    deck.add(['a', 'b'])
    deck.review('a', 'good')
    const older = deck.export()
    clock += DAY
    deck.review('a', 'good') // local is newer
    deck.add(['local'])
    const localA = deck.cards().find((c) => c.word === 'a')!

    expect(deck.import(older, known)).toEqual({ imported: 0, updated: 0, skipped: 0 })
    expect(deck.cards().find((c) => c.word === 'a')).toEqual(localA)
    expect(deck.has(['local'])).toEqual(['local'])

    const newer = {
      ...older,
      cards: older.cards.map((c) =>
        c.word === 'a' ? { ...c, lastReviewedAt: clock + DAY, interval: 99 } : c,
      ),
    }
    expect(deck.import(newer, known)).toMatchObject({ updated: 1 })
    expect(deck.cards().find((c) => c.word === 'a')!.interval).toBe(99)
  })

  it('skips words missing from the dictionary and their reviews', () => {
    deck.add(['gone', 'a'])
    deck.review('gone', 'good')
    const file = deck.export()
    deck.clear()
    expect(deck.import(file, known)).toEqual({ imported: 1, updated: 0, skipped: 1 })
    expect(deck.has(['gone', 'a'])).toEqual(['a'])
    expect(deck.export().reviews).toEqual([])
  })

  it('importing the same file twice does not duplicate the review log', () => {
    deck.add(['a'])
    deck.review('a', 'good')
    const file = deck.export()
    deck.import(file, known)
    deck.import(file, known)
    expect(deck.export().reviews).toHaveLength(1)
  })

  it('rejects unknown versions and malformed files without changing data', () => {
    deck.add(['a'])
    const before = deck.export()
    for (const bad of [
      { ...before, version: 2 },
      { ...before, format: 'other' },
      null,
      'x',
      { cards: [{}] },
    ])
      expect(() => deck.import(bad, known)).toThrow()
    expect(deck.export()).toEqual(before)
  })
})
