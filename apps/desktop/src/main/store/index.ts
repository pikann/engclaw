import Database from 'better-sqlite3'
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DeckStore } from './deck'
import { HistoryStore } from './history'
import { migrate } from './migrations'
import { SettingsStore } from './settings-store'
import { VideoStore } from './videos'
import { WordImageStore } from './word-images'

export interface Store {
  db: Database.Database
  history: HistoryStore
  deck: DeckStore
  settings: SettingsStore
  videos: VideoStore
  wordImages: WordImageStore
  /** Wipes attempts, recordings, flashcards, cached videos and preferences (not downloaded models). */
  deleteAll(): void
}

export function openStore(dbPath: string): Store {
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  migrate(db)
  const audioDir = join(dirname(dbPath), 'audio')
  const history = new HistoryStore(db, audioDir)
  const settings = new SettingsStore(db)
  const deck = new DeckStore(db)
  const videos = new VideoStore(db)
  const wordImages = new WordImageStore(db, join(dirname(dbPath), 'word-images'), 50 * 1024 * 1024)
  return {
    db,
    history,
    deck,
    settings,
    videos,
    wordImages,
    deleteAll: () => {
      history.clear()
      deck.clear()
      settings.clear()
      videos.clear()
      wordImages.clear()
      rmSync(audioDir, { recursive: true, force: true })
    },
  }
}
