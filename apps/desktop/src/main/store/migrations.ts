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
  `ALTER TABLE attempts ADD COLUMN video_id TEXT;
   ALTER TABLE attempts ADD COLUMN segment_index INTEGER;
   CREATE INDEX attempts_video ON attempts (video_id, segment_index);`,
  `CREATE TABLE contours (
     video_id  TEXT NOT NULL,
     start_ms  INTEGER NOT NULL,
     end_ms    INTEGER NOT NULL,
     f0        TEXT NOT NULL,
     energy    TEXT NOT NULL,
     frame_sec REAL NOT NULL,
     PRIMARY KEY (video_id, start_ms, end_ms)
   );`,
  // Contours extracted with the old pitch range can be empty; they are re-extracted on demand.
  `DELETE FROM contours;`,
  `CREATE TABLE segment_prosody (
     video_id  TEXT NOT NULL,
     start_ms  INTEGER NOT NULL,
     end_ms    INTEGER NOT NULL,
     text      TEXT NOT NULL,
     version   INTEGER NOT NULL,
     result    TEXT NOT NULL,
     PRIMARY KEY (video_id, start_ms, end_ms, text, version)
   );`,
  // Flashcard deck. Cards are keyed by dictionary word text (the dictionary ships separately).
  `CREATE TABLE card (
     word              TEXT PRIMARY KEY,
     ease              REAL NOT NULL,
     interval          INTEGER NOT NULL,
     repetitions       INTEGER NOT NULL,
     lapses            INTEGER NOT NULL,
     due               INTEGER NOT NULL,
     added_at          INTEGER NOT NULL,
     last_reviewed_at  INTEGER
   );
   CREATE INDEX card_due ON card (due);
   CREATE TABLE review_log (
     id             INTEGER PRIMARY KEY AUTOINCREMENT,
     word           TEXT NOT NULL,
     reviewed_at    INTEGER NOT NULL,
     grade          INTEGER NOT NULL CHECK (grade BETWEEN 1 AND 5),
     prev_interval  INTEGER NOT NULL,
     is_new         INTEGER NOT NULL,
     UNIQUE (word, reviewed_at)
   );
   CREATE INDEX review_log_time ON review_log (reviewed_at);
   CREATE TABLE quiz_log (
     id           INTEGER PRIMARY KEY AUTOINCREMENT,
     word         TEXT NOT NULL,
     answered_at  INTEGER NOT NULL,
     correct      INTEGER NOT NULL
   );`,
  // Wikimedia illustrations: metadata here, thumbnail bytes on disk. `file` is null for a cached "no image".
  `CREATE TABLE word_image (
     word        TEXT PRIMARY KEY,
     file        TEXT,
     mime        TEXT,
     author      TEXT,
     license     TEXT,
     license_url TEXT,
     page_url    TEXT,
     fetched_at  INTEGER NOT NULL,
     last_used   INTEGER NOT NULL
   );`,
  // Earlier builds rejected every thumbnail host and cached "no image" for all words; drop those entries.
  `DELETE FROM word_image WHERE file IS NULL;`,
  // Pronunciation game: one row per passed chapter (by its 1-based global order). Stars and scores only improve.
  `CREATE TABLE game_progress (
     chapter_order    INTEGER PRIMARY KEY CHECK (chapter_order >= 1),
     stars            INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 3),
     avg_score        REAL NOT NULL,
     best_score       REAL NOT NULL,
     attempts         INTEGER NOT NULL,
     first_passed_at  INTEGER NOT NULL,
     last_passed_at   INTEGER NOT NULL
   );`,
  // AI agent conversations: user and assistant turns only; tool traffic is not persisted.
  `CREATE TABLE agent_conversation (
     id          TEXT PRIMARY KEY,
     created_at  INTEGER NOT NULL,
     updated_at  INTEGER NOT NULL
   );
   CREATE TABLE agent_message (
     id               INTEGER PRIMARY KEY AUTOINCREMENT,
     conversation_id  TEXT NOT NULL REFERENCES agent_conversation(id) ON DELETE CASCADE,
     role             TEXT NOT NULL CHECK (role IN ('user','assistant')),
     text             TEXT NOT NULL,
     created_at       INTEGER NOT NULL
   );
   CREATE INDEX agent_message_conv ON agent_message (conversation_id, id);`,
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
