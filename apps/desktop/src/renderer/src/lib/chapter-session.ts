import type { Attempt, ChapterRun } from '@engclaw/game'
import type { GameProgressEntry, PronunciationResult } from '@engclaw/ipc-contract'
import type { ChapterAttemptSummary } from '@/lib/ask-agent'

export interface ChapterSnapshot {
  run: ChapterRun
  last: { attempt: Attempt; result: PronunciationResult; samples: Float32Array } | null
  summaries: ChapterAttemptSummary[]
  best: GameProgressEntry | null
  outcome: {
    previous: GameProgressEntry | null
    progress: GameProgressEntry
    improved: boolean
  } | null
}

const snapshots = new Map<string, ChapterSnapshot>()

export const saveChapterSnapshot = (chapterId: string, s: ChapterSnapshot): void => {
  snapshots.set(chapterId, s)
}

export const peekChapterSnapshot = (chapterId: string): ChapterSnapshot | null =>
  snapshots.get(chapterId) ?? null

export const clearChapterSnapshot = (chapterId: string): void => {
  snapshots.delete(chapterId)
}
