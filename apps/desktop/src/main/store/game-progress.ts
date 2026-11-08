import type Database from 'better-sqlite3'
import type { GameProgressEntry } from '@engclaw/ipc-contract'
import {
  isNewBest,
  isUnlocked,
  mergeProgress,
  recordResult,
  type ChapterProgress,
  type RunResult,
  type Stars,
} from '@engclaw/game'

interface Row {
  chapter_order: number
  stars: number
  avg_score: number
  best_score: number
  attempts: number
  first_passed_at: number
  last_passed_at: number
}

const toEntry = (r: Row): GameProgressEntry => ({
  order: r.chapter_order,
  stars: r.stars as Stars,
  avgScore: r.avg_score,
  bestScore: r.best_score,
  attempts: r.attempts,
  firstPassedAt: r.first_passed_at,
  lastPassedAt: r.last_passed_at,
})

const toProgress = (e: GameProgressEntry): ChapterProgress => ({
  stars: e.stars,
  avgScore: e.avgScore,
  bestScore: e.bestScore,
  attempts: e.attempts,
  firstPassedAt: e.firstPassedAt,
  lastPassedAt: e.lastPassedAt,
})

/** Per-chapter pronunciation game progress. A chapter can only gain stars, never lose them. */
export class GameProgressStore {
  constructor(
    private readonly db: Database.Database,
    private readonly now: () => number = Date.now,
  ) {}

  private write(order: number, p: ChapterProgress): void {
    this.db
      .prepare(
        `INSERT INTO game_progress (chapter_order, stars, avg_score, best_score, attempts, first_passed_at, last_passed_at)
         VALUES (@order, @stars, @avgScore, @bestScore, @attempts, @firstPassedAt, @lastPassedAt)
         ON CONFLICT(chapter_order) DO UPDATE SET stars = excluded.stars, avg_score = excluded.avg_score,
           best_score = excluded.best_score, attempts = excluded.attempts,
           first_passed_at = excluded.first_passed_at, last_passed_at = excluded.last_passed_at`,
      )
      .run({ order, ...p })
  }

  get(order: number): GameProgressEntry | null {
    const row = this.db
      .prepare('SELECT * FROM game_progress WHERE chapter_order = ?')
      .get(order) as Row | undefined
    return row ? toEntry(row) : null
  }

  list(): GameProgressEntry[] {
    return (
      this.db.prepare('SELECT * FROM game_progress ORDER BY chapter_order').all() as Row[]
    ).map(toEntry)
  }

  /** Stores a passed run, keeping the best stars and scores. Returns the new and previous records and whether the run beat the previous best. */
  record(
    order: number,
    result: RunResult,
  ): { progress: GameProgressEntry; previous: GameProgressEntry | null; improved: boolean } {
    return this.db.transaction(() => {
      const prev = this.get(order)
      const next = recordResult(prev ? toProgress(prev) : null, result, this.now())
      this.write(order, next)
      return {
        progress: { order, ...next },
        previous: prev,
        improved: isNewBest(prev, result),
      }
    })()
  }

  isUnlocked(order: number): boolean {
    return isUnlocked(order, new Set(this.list().map((e) => e.order)))
  }

  /** Merges imported entries (best of both). Returns how many chapters changed. */
  merge(entries: readonly GameProgressEntry[]): number {
    let changed = 0
    for (const e of entries) {
      const prev = this.get(e.order)
      const next = prev ? mergeProgress(toProgress(prev), toProgress(e)) : toProgress(e)
      if (prev && JSON.stringify(toProgress(prev)) === JSON.stringify(next)) continue
      this.write(e.order, next)
      changed++
    }
    return changed
  }

  clear(): void {
    this.db.prepare('DELETE FROM game_progress').run()
  }
}
