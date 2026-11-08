import type Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface ImageCredit {
  author: string
  license: string
  licenseUrl: string | null
  pageUrl: string
}

export type CachedImage =
  { kind: 'none' } | ({ kind: 'found'; bytes: Uint8Array; mime: string } & ImageCredit)

const DAY = 86_400_000
const NONE_TTL = 30 * DAY

interface Row {
  file: string | null
  mime: string | null
  author: string | null
  license: string | null
  license_url: string | null
  page_url: string | null
  fetched_at: number
}

/** Wikimedia illustrations: credits in SQLite, thumbnail bytes in a size-capped (LRU) folder. */
export class WordImageStore {
  constructor(
    private readonly db: Database.Database,
    private readonly dir: string,
    private readonly maxBytes: number,
    private readonly now: () => number = Date.now,
  ) {}

  get(word: string): CachedImage | null {
    const row = this.db.prepare('SELECT * FROM word_image WHERE word = ?').get(word) as
      Row | undefined
    if (!row) return null
    if (row.file === null) {
      if (this.now() - row.fetched_at > NONE_TTL) return null
      return { kind: 'none' }
    }
    let bytes: Buffer
    try {
      bytes = readFileSync(join(this.dir, row.file))
    } catch {
      return null
    }
    this.db.prepare('UPDATE word_image SET last_used = ? WHERE word = ?').run(this.now(), word)
    return {
      kind: 'found',
      bytes: new Uint8Array(bytes),
      mime: row.mime ?? 'image/jpeg',
      author: row.author ?? '',
      license: row.license ?? '',
      licenseUrl: row.license_url,
      pageUrl: row.page_url ?? '',
    }
  }

  putNone(word: string): void {
    this.upsert(word, null, null, null)
  }

  putFound(word: string, bytes: Uint8Array, mime: string, credit: ImageCredit): void {
    if (bytes.length > this.maxBytes) return
    mkdirSync(this.dir, { recursive: true })
    const file = createHash('sha1').update(word).digest('hex')
    writeFileSync(join(this.dir, file), bytes)
    this.upsert(word, file, mime, credit)
    this.evict()
  }

  clear(): void {
    this.db.prepare('DELETE FROM word_image').run()
    rmSync(this.dir, { recursive: true, force: true })
  }

  private upsert(word: string, file: string | null, mime: string | null, c: ImageCredit | null) {
    const t = this.now()
    this.db
      .prepare(
        `INSERT INTO word_image (word, file, mime, author, license, license_url, page_url, fetched_at, last_used)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(word) DO UPDATE SET file = excluded.file, mime = excluded.mime,
           author = excluded.author, license = excluded.license, license_url = excluded.license_url,
           page_url = excluded.page_url, fetched_at = excluded.fetched_at, last_used = excluded.last_used`,
      )
      .run(
        word,
        file,
        mime,
        c?.author ?? null,
        c?.license ?? null,
        c?.licenseUrl ?? null,
        c?.pageUrl ?? null,
        t,
        t,
      )
  }

  private evict(): void {
    const rows = this.db
      .prepare('SELECT word, file FROM word_image WHERE file IS NOT NULL ORDER BY last_used ASC')
      .all() as { word: string; file: string }[]
    const sizes = new Map<string, number>()
    let total = 0
    for (const r of rows) {
      try {
        const size = statSync(join(this.dir, r.file)).size
        sizes.set(r.word, size)
        total += size
      } catch {
        this.db.prepare('DELETE FROM word_image WHERE word = ?').run(r.word)
      }
    }
    for (const r of rows) {
      if (total <= this.maxBytes) break
      const size = sizes.get(r.word)
      if (size === undefined) continue
      rmSync(join(this.dir, r.file), { force: true })
      this.db.prepare('DELETE FROM word_image WHERE word = ?').run(r.word)
      total -= size
    }
    // Files with no row (e.g. a crash mid-write) would otherwise count against the disk forever.
    const known = new Set(rows.map((r) => r.file))
    for (const f of readdirSync(this.dir))
      if (!known.has(f)) rmSync(join(this.dir, f), { force: true })
  }
}
