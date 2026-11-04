import Database from 'better-sqlite3'
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { HistoryStore } from './history'
import { migrate } from './migrations'
import { SettingsStore } from './settings-store'

export interface Store {
  db: Database.Database
  history: HistoryStore
  settings: SettingsStore
  /** Wipes attempts, recordings and preferences (not downloaded models). */
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
  return {
    db,
    history,
    settings,
    deleteAll: () => {
      history.clear()
      settings.clear()
      rmSync(audioDir, { recursive: true, force: true })
    },
  }
}
