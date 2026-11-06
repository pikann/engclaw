export const SCHEMA_VERSION = 1

export const SCHEMA_SQL = `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
CREATE TABLE entries (id INTEGER PRIMARY KEY, word TEXT NOT NULL, norm TEXT NOT NULL);
CREATE TABLE senses (
  entry_id INTEGER NOT NULL REFERENCES entries (id),
  ordinal INTEGER NOT NULL,
  pos TEXT NOT NULL,
  definition TEXT NOT NULL,
  example TEXT,
  PRIMARY KEY (entry_id, ordinal)
) WITHOUT ROWID;
CREATE TABLE pronunciations (
  entry_id INTEGER NOT NULL REFERENCES entries (id),
  ordinal INTEGER NOT NULL,
  ipa TEXT NOT NULL,
  PRIMARY KEY (entry_id, ordinal)
) WITHOUT ROWID;
CREATE TABLE roots (
  id INTEGER PRIMARY KEY,
  root TEXT NOT NULL,
  forms TEXT NOT NULL,
  meaning TEXT NOT NULL,
  origins TEXT NOT NULL,
  source_url TEXT NOT NULL
);
CREATE TABLE morphemes (
  entry_id INTEGER NOT NULL REFERENCES entries (id),
  position INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('prefix', 'root', 'suffix')),
  form TEXT NOT NULL,
  root_id INTEGER NOT NULL REFERENCES roots (id),
  PRIMARY KEY (entry_id, position)
) WITHOUT ROWID;
CREATE INDEX morphemes_root ON morphemes (root_id);
CREATE TABLE etymology (
  entry_id INTEGER PRIMARY KEY REFERENCES entries (id),
  origin_chain TEXT NOT NULL,
  pie_root TEXT,
  first_use TEXT,
  source_url TEXT NOT NULL,
  etymonline_url TEXT NOT NULL
);
CREATE VIRTUAL TABLE entries_fts USING fts5(
  norm, content='entries', content_rowid='id', tokenize='unicode61', prefix='2 3 4'
);
CREATE VIRTUAL TABLE entries_tri USING fts5(
  norm, content='entries', content_rowid='id', tokenize='trigram'
);
`

export interface Manifest {
  version: string
  schemaVersion: number
  file: string
  bytes: number
  sha256: string
  counts: Record<string, number>
  sources: { name: string; version: string; license: string; url: string }[]
}
