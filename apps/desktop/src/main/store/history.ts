import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  HistoryExport,
  type HistoryAttempt,
  type HistoryExportFile,
  type HistorySaveRequest,
} from '@engclaw/ipc-contract'
import { decodeWav, encodeWav } from './wav'

const AUDIO_RATE = 16000

interface Row {
  id: string
  created_at: number
  mode: 'sentence' | 'free'
  text: string
  language: string
  score: number
  errors: string
  has_audio: number
  video_id: string | null
  segment_index: number | null
}

const toAttempt = (r: Row): HistoryAttempt => ({
  id: r.id,
  createdAt: r.created_at,
  mode: r.mode,
  text: r.text,
  language: r.language,
  score: r.score,
  errors: JSON.parse(r.errors) as HistoryAttempt['errors'],
  hasAudio: r.has_audio === 1,
  ...(r.video_id !== null && { videoId: r.video_id, segmentIndex: r.segment_index }),
})

/** Practice attempts: rows in SQLite, optional recordings as `audio/<id>.wav` beside the DB. */
export class HistoryStore {
  constructor(
    private readonly db: Database.Database,
    private readonly audioDir: string,
    private readonly now: () => number = Date.now,
  ) {}

  private audioPath(id: string): string {
    return join(this.audioDir, `${id}.wav`)
  }

  private insert(a: HistoryAttempt, wav: Buffer | null): boolean {
    const res = this.db
      .prepare(
        `INSERT OR IGNORE INTO attempts (id, created_at, mode, text, language, score, errors, has_audio, video_id, segment_index)
         VALUES (@id, @createdAt, @mode, @text, @language, @score, @errors, @hasAudio, @videoId, @segmentIndex)`,
      )
      .run({
        ...a,
        errors: JSON.stringify(a.errors),
        hasAudio: wav ? 1 : 0,
        videoId: a.videoId ?? null,
        segmentIndex: a.videoId ? (a.segmentIndex ?? null) : null,
      })
    if (res.changes === 0) return false
    if (wav) {
      mkdirSync(this.audioDir, { recursive: true })
      writeFileSync(this.audioPath(a.id), wav)
    }
    return true
  }

  save(req: HistorySaveRequest): HistoryAttempt {
    const { audio, ...rest } = req
    const attempt: HistoryAttempt = {
      ...rest,
      id: randomUUID(),
      createdAt: this.now(),
      hasAudio: Boolean(audio),
    }
    this.insert(attempt, audio ? encodeWav(audio, AUDIO_RATE) : null)
    return attempt
  }

  list(limit = 100, offset = 0, videoId?: string, language?: string): HistoryAttempt[] {
    const filters = [
      videoId === undefined ? null : 'video_id = @videoId',
      language === undefined ? null : 'language = @language',
    ].filter(Boolean)
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
    return (
      this.db
        .prepare(
          `SELECT * FROM attempts ${where} ORDER BY created_at DESC, id LIMIT @limit OFFSET @offset`,
        )
        .all({
          limit,
          offset,
          ...(videoId === undefined ? {} : { videoId }),
          ...(language === undefined ? {} : { language }),
        }) as Row[]
    ).map(toAttempt)
  }

  count(videoId?: string, language?: string): number {
    const filters = [
      videoId === undefined ? null : 'video_id = @videoId',
      language === undefined ? null : 'language = @language',
    ].filter(Boolean)
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
    return (
      this.db
        .prepare(`SELECT COUNT(*) AS n FROM attempts ${where}`)
        .get({
          ...(videoId === undefined ? {} : { videoId }),
          ...(language === undefined ? {} : { language }),
        }) as { n: number }
    ).n
  }

  audio(id: string): Float32Array | null {
    const path = this.audioPath(id)
    if (!existsSync(path)) return null
    return decodeWav(readFileSync(path)).samples
  }

  remove(id: string): boolean {
    const res = this.db.prepare('DELETE FROM attempts WHERE id = ?').run(id)
    rmSync(this.audioPath(id), { force: true })
    return res.changes > 0
  }

  clear(): void {
    this.db.prepare('DELETE FROM attempts').run()
    rmSync(this.audioDir, { recursive: true, force: true })
  }

  export(): HistoryExportFile {
    const rows = this.db.prepare('SELECT * FROM attempts ORDER BY created_at, id').all() as Row[]
    return {
      format: 'engclaw-history',
      version: 1,
      exportedAt: this.now(),
      attempts: rows.map((r) => {
        const path = this.audioPath(r.id)
        return {
          ...toAttempt(r),
          audio: r.has_audio && existsSync(path) ? readFileSync(path).toString('base64') : null,
        }
      }),
    }
  }

  /** Validates `raw`, then adds every attempt whose id is new, atomically. Throws on bad input. */
  import(raw: unknown): { imported: number; skipped: number } {
    const file = HistoryExport.parse(raw)
    let imported = 0
    this.db.transaction(() => {
      for (const { audio, ...a } of file.attempts) {
        const wav = audio ? Buffer.from(audio, 'base64') : null
        if (wav) decodeWav(wav) // reject non-WAV payloads before anything is written
        if (this.insert({ ...a, hasAudio: Boolean(wav) }, wav)) imported++
      }
    })()
    return { imported, skipped: file.attempts.length - imported }
  }
}
