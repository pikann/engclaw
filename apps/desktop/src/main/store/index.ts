import Database from 'better-sqlite3'
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DeckStore } from './deck'
import { HistoryStore } from './history'
import { migrate } from './migrations'
import { SettingsStore } from './settings-store'
import { VideoStore } from './videos'

export interface Store {
  db: Database.Database
  history: HistoryStore
  deck: DeckStore
  settings: SettingsStore
  videos: VideoStore
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
  return {
    db,
    history,
    deck,
    settings,
    videos,
    deleteAll: () => {
      history.clear()
      deck.clear()
      settings.clear()
      videos.clear()
      rmSync(audioDir, { recursive: true, force: true })
    },
  }
}
