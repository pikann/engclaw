import type Database from 'better-sqlite3'

/**
 * Append-only list of schema migrations. A migration's version is its 1-based position; the
 * applied version lives in SQLite's `user_version` pragma. Never edit or reorder shipped entries.
 */
export const MIGRATIONS: readonly string[] = [
  `CREATE TABLE attempts (
     id          TEXT PRIMARY KEY,
     created_at  INTEGER NOT NULL,
     mode        TEXT NOT NULL CHECK (mode IN ('sentence', 'free')),
     text        TEXT NOT NULL,
     language    TEXT NOT NULL,
     score       REAL NOT NULL,
     errors      TEXT NOT NULL,
     has_audio   INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX attempts_created_at ON attempts (created_at DESC);
   CREATE TABLE settings (
     key   TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );`,
  `CREATE TABLE videos (
     video_id        TEXT PRIMARY KEY,
     title           TEXT NOT NULL,
     duration_sec    REAL NOT NULL,
     caption_tracks  TEXT NOT NULL,
     fetched_at      INTEGER NOT NULL,
     last_opened_at  INTEGER
   );
   CREATE INDEX videos_last_opened ON videos (last_opened_at DESC);
   CREATE TABLE transcripts (
     video_id    TEXT NOT NULL,
     lang        TEXT NOT NULL,
     cues        TEXT NOT NULL,
     fetched_at  INTEGER NOT NULL,
     PRIMARY KEY (video_id, lang)
   );`,
  `ALTER TABLE videos ADD COLUMN sentence_settings TEXT;`,
  `CREATE TABLE transcript_ipa (
     video_id  TEXT NOT NULL,
     text      TEXT NOT NULL,
     words     TEXT NOT NULL,
     PRIMARY KEY (video_id, text)
   );`,
]

export class FutureSchemaError extends Error {
  constructor(found: number, supported: number) {
    super(`Database schema v${found} is newer than this app supports (v${supported})`)
  }
}

export function currentVersion(db: Database.Database): number {
  return db.pragma('user_version', { simple: true }) as number
}

/** Applies pending migrations, each in its own transaction. Returns the resulting version. */
export function migrate(db: Database.Database, migrations: readonly string[] = MIGRATIONS): number {
  const from = currentVersion(db)
  if (from > migrations.length) throw new FutureSchemaError(from, migrations.length)
  for (let v = from; v < migrations.length; v++) {
    db.transaction(() => {
      db.exec(migrations[v]!)
      db.pragma(`user_version = ${v + 1}`)
    })()
  }
  return migrations.length
}
