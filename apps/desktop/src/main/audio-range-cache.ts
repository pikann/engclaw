import { mkdir, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AudioRange } from '@engclaw/youtube'

interface Sidecar {
  mime: string
  offsetSec: number
}

/** Size-capped LRU of audio ranges on disk; recency is the files' mtime. Never leaves the machine. */
export class AudioRangeCache {
  constructor(
    private readonly dir: string,
    private readonly maxBytes: number,
  ) {}

  private key(videoId: string, start: number, end: number): string {
    return `${videoId}_${Math.round(start * 1000)}_${Math.round(end * 1000)}`
  }

  async get(videoId: string, start: number, end: number): Promise<AudioRange | null> {
    const base = join(this.dir, this.key(videoId, start, end))
    try {
      const [bytes, side] = await Promise.all([
        readFile(`${base}.audio`),
        readFile(`${base}.json`, 'utf8'),
      ])
      const { mime, offsetSec } = JSON.parse(side) as Sidecar
      const now = new Date()
      await utimes(`${base}.audio`, now, now)
      return { bytes: new Uint8Array(bytes), mime, offsetSec }
    } catch {
      return null
    }
  }

  async put(videoId: string, start: number, end: number, range: AudioRange): Promise<void> {
    if (range.bytes.length > this.maxBytes) return
    await mkdir(this.dir, { recursive: true })
    const base = join(this.dir, this.key(videoId, start, end))
    const side: Sidecar = { mime: range.mime, offsetSec: range.offsetSec }
    await writeFile(`${base}.json`, JSON.stringify(side))
    await writeFile(`${base}.audio`, range.bytes)
    await this.evict()
  }

  private async evict(): Promise<void> {
    const entries: { base: string; size: number; mtime: number }[] = []
    for (const name of await readdir(this.dir)) {
      if (!name.endsWith('.audio')) continue
      const s = await stat(join(this.dir, name))
      entries.push({ base: name.slice(0, -'.audio'.length), size: s.size, mtime: s.mtimeMs })
    }
    let total = entries.reduce((n, e) => n + e.size, 0)
    entries.sort((a, b) => a.mtime - b.mtime)
    for (const e of entries) {
      if (total <= this.maxBytes) break
      await rm(join(this.dir, `${e.base}.audio`), { force: true })
      await rm(join(this.dir, `${e.base}.json`), { force: true })
      total -= e.size
    }
  }
}
