import type Database from 'better-sqlite3'
import { AppSettings } from '@engclaw/ipc-contract'

/** Key/value app preferences in SQLite; unknown or invalid stored values fall back to defaults. */
export class SettingsStore {
  constructor(private readonly db: Database.Database) {}

  get(): AppSettings {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as {
      key: string
      value: string
    }[]
    const stored: Record<string, unknown> = {}
    for (const { key, value } of rows) {
      try {
        stored[key] = JSON.parse(value)
      } catch {
        // ignore a corrupt value; the default applies
      }
    }
    const parsed = AppSettings.safeParse(stored)
    return parsed.success ? parsed.data : AppSettings.parse({})
  }

  update(patch: Partial<AppSettings>): AppSettings {
    const put = this.db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    )
    this.db.transaction(() => {
      for (const [k, v] of Object.entries(patch)) if (v !== undefined) put.run(k, JSON.stringify(v))
    })()
    return this.get()
  }

  clear(): void {
    this.db.prepare('DELETE FROM settings').run()
  }
}
