import type Database from 'better-sqlite3'
import {
  GRADE_Q,
  MATURE_DAYS,
  newCard,
  review,
  studyDay,
  type CardState,
} from '@engclaw/dictionary'
import {
  LearningExport,
  type DeckCard,
  type DeckGrade,
  type LearningExportFile,
} from '@engclaw/ipc-contract'

interface Row {
  word: string
  ease: number
  interval: number
  repetitions: number
  lapses: number
  due: number
  added_at: number
  last_reviewed_at: number | null
}

export interface DeckLimits {
  newPerDay: number
  reviewsPerDay: number
}

export interface DeckCounts {
  total: number
  dueToday: number
  newCards: number
  learning: number
  mature: number
  retention: number | null
  streak: number
  heatmap: { day: number; count: number }[]
  quizAccuracy: number | null
}

const toCard = (r: Row): DeckCard => ({
  word: r.word,
  ease: r.ease,
  interval: r.interval,
  repetitions: r.repetitions,
  lapses: r.lapses,
  due: r.due,
  addedAt: r.added_at,
  lastReviewedAt: r.last_reviewed_at,
})

const HEATMAP_DAYS = 30

/** Flashcard deck: SM-2 state per dictionary word plus the review and quiz history, in SQLite. */
export class DeckStore {
  constructor(
    private readonly db: Database.Database,
    private readonly now: () => number = Date.now,
    private readonly tzOffsetMin?: number,
  ) {}

  private today(): number {
    return studyDay(this.now(), this.tzOffsetMin)
  }

  private dayOf(ms: number): number {
    return studyDay(ms, this.tzOffsetMin)
  }

  private rows(): Row[] {
    return this.db.prepare('SELECT * FROM card ORDER BY added_at, word').all() as Row[]
  }

  cards(): DeckCard[] {
    return this.rows().map(toCard)
  }

  add(words: string[]): { added: number; skipped: number } {
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO card (word, ease, interval, repetitions, lapses, due, added_at, last_reviewed_at)
       VALUES (@word, @ease, @interval, @repetitions, @lapses, @due, @addedAt, NULL)`,
    )
    const fresh = newCard(this.today())
    let added = 0
    this.db.transaction(() => {
      for (const word of new Set(words))
        added += insert.run({ ...fresh, word, addedAt: this.now() }).changes
    })()
    return { added, skipped: new Set(words).size - added }
  }

  remove(word: string): boolean {
    return this.db.prepare('DELETE FROM card WHERE word = ?').run(word).changes > 0
  }

  has(words: string[]): string[] {
    const q = this.db.prepare('SELECT 1 FROM card WHERE word = ?')
    return words.filter((w) => q.get(w) !== undefined)
  }

  private dayRange(day: number): [number, number] {
    // Review timestamps are matched by study day, so scan a window around it and filter exactly.
    const ms = day * 86_400_000
    return [ms - 86_400_000 * 2, ms + 86_400_000 * 3]
  }

  private reviewsOn(day: number, isNew: 0 | 1): number {
    const [from, to] = this.dayRange(day)
    const rows = this.db
      .prepare(
        'SELECT reviewed_at FROM review_log WHERE is_new = ? AND reviewed_at BETWEEN ? AND ?',
      )
      .all(isNew, from, to) as { reviewed_at: number }[]
    return rows.filter((r) => this.dayOf(r.reviewed_at) === day).length
  }

  /** Cards that can be studied now. A drill (`words`) ignores the daily limits. */
  private queue(words?: string[]): { due: Row[]; fresh: Row[] } {
    const today = this.today()
    const scope = words ? new Set(words) : null
    const all = this.rows().filter((r) => !scope || scope.has(r.word))
    const due = all
      .filter((r) => r.last_reviewed_at !== null && r.due <= today)
      .sort((a, b) => a.due - b.due || a.added_at - b.added_at)
    const fresh = all.filter((r) => r.last_reviewed_at === null)
    return { due, fresh }
  }

  remaining(limits: DeckLimits, words?: string[]): { new: number; due: number } {
    const { due, fresh } = this.queue(words)
    const today = this.today()
    if (words) return { new: fresh.length, due: due.length }
    return {
      new: Math.min(fresh.length, Math.max(0, limits.newPerDay - this.reviewsOn(today, 1))),
      due: Math.min(due.length, Math.max(0, limits.reviewsPerDay - this.reviewsOn(today, 0))),
    }
  }

  /** The next card to study: due reviews first, then new cards, within limits. */
  next(limits: DeckLimits, words?: string[]): DeckCard | null {
    const { due, fresh } = this.queue(words)
    const left = this.remaining(limits, words)
    if (left.due > 0 && due[0]) return toCard(due[0])
    if (left.new > 0 && fresh[0]) return toCard(fresh[0])
    return null
  }

  review(word: string, grade: DeckGrade): DeckCard {
    const row = this.db.prepare('SELECT * FROM card WHERE word = ?').get(word) as Row | undefined
    if (!row) throw new Error(`"${word}" is not in the deck`)
    const at = this.now()
    const before: CardState = {
      ease: row.ease,
      interval: row.interval,
      repetitions: row.repetitions,
      lapses: row.lapses,
      due: row.due,
    }
    const after = review(before, grade, this.today())
    this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE card SET ease = @ease, interval = @interval, repetitions = @repetitions,
             lapses = @lapses, due = @due, last_reviewed_at = @at WHERE word = @word`,
        )
        .run({ ...after, at, word })
      this.db
        .prepare(
          `INSERT INTO review_log (word, reviewed_at, grade, prev_interval, is_new)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(word, at, GRADE_Q[grade], row.interval, row.last_reviewed_at === null ? 1 : 0)
    })()
    return toCard({ ...row, ...after, last_reviewed_at: at })
  }

  recordQuiz(word: string, correct: boolean): void {
    this.db
      .prepare('INSERT INTO quiz_log (word, answered_at, correct) VALUES (?, ?, ?)')
      .run(word, this.now(), correct ? 1 : 0)
  }

  stats(): DeckCounts {
    const today = this.today()
    const cards = this.rows()
    const reviewed = cards.filter((r) => r.last_reviewed_at !== null)
    const logs = this.db.prepare('SELECT reviewed_at, grade FROM review_log').all() as {
      reviewed_at: number
      grade: number
    }[]
    const perDay = new Map<number, number>()
    for (const l of logs) {
      const d = this.dayOf(l.reviewed_at)
      perDay.set(d, (perDay.get(d) ?? 0) + 1)
    }
    // Today may still be empty without breaking a streak that ran up to yesterday.
    let streak = 0
    for (let d = perDay.has(today) ? today : today - 1; perDay.has(d); d--) streak++
    const quiz = this.db
      .prepare('SELECT COUNT(*) AS n, COALESCE(SUM(correct), 0) AS ok FROM quiz_log')
      .get() as {
      n: number
      ok: number
    }
    return {
      total: cards.length,
      dueToday: cards.filter((r) => r.last_reviewed_at !== null && r.due <= today).length,
      newCards: cards.length - reviewed.length,
      learning: reviewed.filter((r) => r.interval < MATURE_DAYS).length,
      mature: reviewed.filter((r) => r.interval >= MATURE_DAYS).length,
      retention: logs.length
        ? logs.filter((l) => l.grade >= GRADE_Q.good).length / logs.length
        : null,
      streak,
      heatmap: Array.from({ length: HEATMAP_DAYS }, (_, i) => {
        const day = today - (HEATMAP_DAYS - 1) + i
        return { day, count: perDay.get(day) ?? 0 }
      }),
      quizAccuracy: quiz.n ? quiz.ok / quiz.n : null,
    }
  }

  matureWords(): Set<string> {
    return new Set(
      this.rows()
        .filter((r) => r.interval >= MATURE_DAYS)
        .map((r) => r.word),
    )
  }

  export(): LearningExportFile {
    const reviews = this.db
      .prepare(
        'SELECT word, reviewed_at, grade, prev_interval, is_new FROM review_log ORDER BY reviewed_at, id',
      )
      .all() as {
      word: string
      reviewed_at: number
      grade: number
      prev_interval: number
      is_new: number
    }[]
    return {
      format: 'engclaw-learning',
      version: 1,
      exportedAt: this.now(),
      cards: this.cards(),
      reviews: reviews.map((r) => ({
        word: r.word,
        reviewedAt: r.reviewed_at,
        grade: r.grade,
        prevInterval: r.prev_interval,
        isNew: r.is_new === 1,
      })),
    }
  }

  /**
   * Validates `raw`, then merges it atomically. For a word in both, the card reviewed more recently
   * wins (ties keep the local card). Words `known` rejects are skipped. Nothing is ever deleted.
   * Throws on a malformed or unknown-version file before touching the database.
   */
  import(
    raw: unknown,
    known: (word: string) => boolean,
  ): { imported: number; updated: number; skipped: number } {
    const file = LearningExport.parse(raw)
    let imported = 0
    let updated = 0
    let skipped = 0
    const existing = this.db.prepare('SELECT last_reviewed_at FROM card WHERE word = ?')
    const upsert = this.db.prepare(
      `INSERT INTO card (word, ease, interval, repetitions, lapses, due, added_at, last_reviewed_at)
       VALUES (@word, @ease, @interval, @repetitions, @lapses, @due, @addedAt, @lastReviewedAt)
       ON CONFLICT(word) DO UPDATE SET ease = excluded.ease, interval = excluded.interval,
         repetitions = excluded.repetitions, lapses = excluded.lapses, due = excluded.due,
         last_reviewed_at = excluded.last_reviewed_at`,
    )
    const log = this.db.prepare(
      `INSERT OR IGNORE INTO review_log (word, reviewed_at, grade, prev_interval, is_new)
       VALUES (?, ?, ?, ?, ?)`,
    )
    const accepted = new Set<string>()
    this.db.transaction(() => {
      for (const card of file.cards) {
        if (!known(card.word)) {
          skipped++
          continue
        }
        accepted.add(card.word)
        const local = existing.get(card.word) as { last_reviewed_at: number | null } | undefined
        if (!local) {
          upsert.run(card)
          imported++
        } else if ((card.lastReviewedAt ?? -1) > (local.last_reviewed_at ?? -1)) {
          upsert.run(card)
          updated++
        }
      }
      for (const r of file.reviews)
        if (accepted.has(r.word))
          log.run(r.word, r.reviewedAt, r.grade, r.prevInterval, r.isNew ? 1 : 0)
    })()
    return { imported, updated, skipped }
  }

  clear(): void {
    this.db.exec('DELETE FROM card; DELETE FROM review_log; DELETE FROM quiz_log;')
  }
}
