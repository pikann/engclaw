import type Database from 'better-sqlite3'
import { SentenceSettings } from '@engclaw/ipc-contract'

export interface CachedVideo {
  videoId: string
  title: string
  durationSec: number
  captionTracks: { lang: string; auto: boolean }[]
}
export interface Cue {
  start: number
  dur: number
  text: string
}
export interface IpaWord {
  word: string
  ipa: string
}
export interface RecentVideo {
  videoId: string
  title: string
  durationSec: number
  lastOpenedAt: number
}

/** Local cache of YouTube video info and transcripts so a reopened video needs no network. */
export class VideoStore {
  constructor(
    private readonly db: Database.Database,
    private readonly now: () => number = Date.now,
  ) {}

  putMeta(meta: CachedVideo): void {
    this.db
      .prepare(
        `INSERT INTO videos (video_id, title, duration_sec, caption_tracks, fetched_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(video_id) DO UPDATE SET title = excluded.title,
           duration_sec = excluded.duration_sec, caption_tracks = excluded.caption_tracks,
           fetched_at = excluded.fetched_at`,
      )
      .run(
        meta.videoId,
        meta.title,
        meta.durationSec,
        JSON.stringify(meta.captionTracks),
        this.now(),
      )
  }

  getMeta(videoId: string): CachedVideo | null {
    const row = this.db
      .prepare('SELECT title, duration_sec, caption_tracks FROM videos WHERE video_id = ?')
      .get(videoId) as { title: string; duration_sec: number; caption_tracks: string } | undefined
    if (!row) return null
    const tracks = parse(row.caption_tracks, isTrack)
    if (!tracks) return null
    return { videoId, title: row.title, durationSec: row.duration_sec, captionTracks: tracks }
  }

  putTranscript(videoId: string, lang: string, cues: readonly Cue[]): void {
    this.db
      .prepare(
        `INSERT INTO transcripts (video_id, lang, cues, fetched_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(video_id, lang) DO UPDATE SET cues = excluded.cues,
           fetched_at = excluded.fetched_at`,
      )
      .run(videoId, lang, JSON.stringify(cues), this.now())
  }

  getTranscript(videoId: string, lang: string): Cue[] | null {
    const row = this.db
      .prepare('SELECT cues FROM transcripts WHERE video_id = ? AND lang = ?')
      .get(videoId, lang) as { cues: string } | undefined
    return row ? parse(row.cues, isCue) : null
  }

  /** Marks the video as opened now, so it shows up in (and moves to the top of) recent videos. */
  touch(videoId: string): void {
    this.db
      .prepare('UPDATE videos SET last_opened_at = ? WHERE video_id = ?')
      .run(this.now(), videoId)
  }

  recent(limit = 20): RecentVideo[] {
    const rows = this.db
      .prepare(
        `SELECT v.video_id, v.title, v.duration_sec, v.last_opened_at FROM videos v
         WHERE v.last_opened_at IS NOT NULL
           AND EXISTS (SELECT 1 FROM transcripts t WHERE t.video_id = v.video_id)
         ORDER BY v.last_opened_at DESC, v.rowid DESC LIMIT ?`,
      )
      .all(limit) as {
      video_id: string
      title: string
      duration_sec: number
      last_opened_at: number
    }[]
    return rows.map((r) => ({
      videoId: r.video_id,
      title: r.title,
      durationSec: r.duration_sec,
      lastOpenedAt: r.last_opened_at,
    }))
  }

  getSettings(videoId: string): SentenceSettings | null {
    const row = this.db
      .prepare('SELECT sentence_settings FROM videos WHERE video_id = ?')
      .get(videoId) as { sentence_settings: string | null } | undefined
    if (!row?.sentence_settings) return null
    const parsed = SentenceSettings.safeParse(safeJson(row.sentence_settings))
    return parsed.success ? parsed.data : null
  }

  saveSettings(videoId: string, settings: SentenceSettings): void {
    this.db
      .prepare('UPDATE videos SET sentence_settings = ? WHERE video_id = ?')
      .run(JSON.stringify(settings), videoId)
  }

  /** IPA words of one transcript sentence, or null when it was not phonemized yet. */
  getIpa(videoId: string, text: string): IpaWord[] | null {
    const row = this.db
      .prepare('SELECT words FROM transcript_ipa WHERE video_id = ? AND text = ?')
      .get(videoId, text) as { words: string } | undefined
    return row ? parse(row.words, isIpaWord) : null
  }

  putIpa(videoId: string, text: string, words: readonly IpaWord[]): void {
    this.db
      .prepare(
        `INSERT INTO transcript_ipa (video_id, text, words) VALUES (?, ?, ?)
         ON CONFLICT(video_id, text) DO UPDATE SET words = excluded.words`,
      )
      .run(videoId, text, JSON.stringify(words))
  }

  remove(videoId: string): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM transcript_ipa WHERE video_id = ?').run(videoId)
      this.db.prepare('DELETE FROM transcripts WHERE video_id = ?').run(videoId)
      this.db.prepare('DELETE FROM videos WHERE video_id = ?').run(videoId)
    })()
  }

  clear(): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM transcript_ipa').run()
      this.db.prepare('DELETE FROM transcripts').run()
      this.db.prepare('DELETE FROM videos').run()
    })()
  }
}

const isTrack = (v: unknown): v is CachedVideo['captionTracks'][number] =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as { lang?: unknown }).lang === 'string' &&
  typeof (v as { auto?: unknown }).auto === 'boolean'

const isIpaWord = (v: unknown): v is IpaWord =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as { word?: unknown }).word === 'string' &&
  typeof (v as { ipa?: unknown }).ipa === 'string'

const isCue = (v: unknown): v is Cue =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as { start?: unknown }).start === 'number' &&
  typeof (v as { dur?: unknown }).dur === 'number' &&
  typeof (v as { text?: unknown }).text === 'string'

/** A corrupt cache row is treated as a miss so the caller refetches. */
function parse<T>(raw: string, guard: (v: unknown) => v is T): T[] | null {
  try {
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value) && value.every(guard) ? value : null
  } catch {
    return null
  }
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
