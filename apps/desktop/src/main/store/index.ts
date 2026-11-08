import Database from 'better-sqlite3'
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { HistoryExport, type HistoryExportFile } from '@engclaw/ipc-contract'
import { DeckStore } from './deck'
import { GameProgressStore } from './game-progress'
import { HistoryStore } from './history'
import { migrate } from './migrations'
import { SettingsStore } from './settings-store'
import { VideoStore } from './videos'
import { WordImageStore } from './word-images'

export interface Store {
  db: Database.Database
  history: HistoryStore
  game: GameProgressStore
  deck: DeckStore
  settings: SettingsStore
  videos: VideoStore
  wordImages: WordImageStore
  /** History plus game progress, as written to the export file. */
  exportData(): HistoryExportFile
  /** Validates the whole file first, then imports attempts and merges game progress (best of both). */
  importData(raw: unknown): { imported: number; skipped: number }
  /** Wipes attempts, game progress, recordings, flashcards, cached videos and preferences (not downloaded models). */
  deleteAll(): void
}

export function openStore(dbPath: string): Store {
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  migrate(db)
  const audioDir = join(dirname(dbPath), 'audio')
  const history = new HistoryStore(db, audioDir)
  const game = new GameProgressStore(db)
  const settings = new SettingsStore(db)
  const deck = new DeckStore(db)
  const videos = new VideoStore(db)
  const wordImages = new WordImageStore(db, join(dirname(dbPath), 'word-images'), 50 * 1024 * 1024)
  return {
    db,
    history,
    game,
    deck,
    settings,
    videos,
    wordImages,
    exportData: () => ({ ...history.export(), gameProgress: game.list() }),
    importData: (raw) => {
      const file = HistoryExport.parse(raw)
      return db.transaction(() => {
        const res = history.import(file)
        game.merge(file.gameProgress ?? [])
        return res
      })()
    },
    deleteAll: () => {
      history.clear()
      game.clear()
      deck.clear()
      settings.clear()
      videos.clear()
      wordImages.clear()
      rmSync(audioDir, { recursive: true, force: true })
    },
  }
}
