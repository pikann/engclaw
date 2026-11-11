import type { Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/** Where the finished GIFs are written (committed, and referenced from the README). */
export const MEDIA_DIR = resolve(__dirname, '../../../../docs/media')

const INTERVAL_MS = 70
/** The bottom status bar ("Models missing", "No AI provider") is cropped out of every GIF. */
const STATUS_BAR_PX = 28
const WINDOW_HEIGHT = 760 // CSS px; screenshots may be 2x, so crop proportionally

/**
 * Records a page as timestamped screenshots (the app window is hidden in headless runs, so a screen
 * recorder would see nothing) and turns them into an optimised GIF with ffmpeg.
 */
export class Recorder {
  private dir = mkdtempSync(join(tmpdir(), 'engclaw-gif-'))
  private frames: { file: string; at: number }[] = []
  private running = false
  private loop?: Promise<void>

  constructor(private page: Page) {}

  start(): void {
    this.running = true
    const t0 = Date.now()
    this.loop = (async () => {
      while (this.running) {
        const began = Date.now()
        const file = join(this.dir, `f${String(this.frames.length).padStart(5, '0')}.jpg`)
        try {
          writeFileSync(file, await this.page.screenshot({ type: 'jpeg', quality: 92 }))
          this.frames.push({ file, at: began - t0 })
        } catch {
          // the page navigated or closed mid-frame: skip it
        }
        const wait = INTERVAL_MS - (Date.now() - began)
        if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      }
    })()
  }

  async stop(): Promise<void> {
    this.running = false
    await this.loop
  }

  /** `holdMs` keeps the last frame on screen before the loop restarts. */
  async save(name: string, opts: { width?: number; fps?: number; holdMs?: number } = {}) {
    const { width = 880, fps = 12, holdMs = 2000 } = opts
    await this.stop()
    if (this.frames.length < 2) throw new Error(`no frames recorded for ${name}`)
    const list = this.frames.map((f, i) => {
      const next = this.frames[i + 1]
      const ms = next ? next.at - f.at : holdMs
      return `file '${f.file}'\nduration ${(ms / 1000).toFixed(3)}`
    })
    list.push(`file '${this.frames.at(-1)!.file}'`) // concat demuxer quirk: repeat the last file
    const listFile = join(this.dir, 'frames.txt')
    writeFileSync(listFile, list.join('\n'))
    mkdirSync(MEDIA_DIR, { recursive: true })
    const out = join(MEDIA_DIR, `${name}.gif`)
    const filter =
      `crop=iw:ih-ih*${STATUS_BAR_PX}/${WINDOW_HEIGHT}:0:0,fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b];` +
      `[a]palettegen=max_colors=128:stats_mode=diff[p];` +
      `[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`
    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-loglevel',
        'error',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listFile,
        '-vf',
        filter,
        out,
      ],
      { stdio: 'inherit' },
    )
    rmSync(this.dir, { recursive: true, force: true })
    return out
  }
}

/**
 * Screenshots have no mouse pointer, so draw one in the page: it follows the real (Playwright)
 * mouse events and pulses on click. Call again after a reload.
 */
export async function installCursor(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.getElementById('gif-cursor')) return
    const el = document.createElement('div')
    el.id = 'gif-cursor'
    el.style.cssText =
      'position:fixed;left:0;top:0;width:18px;height:18px;margin:-3px 0 0 -3px;z-index:2147483647;' +
      'pointer-events:none;transition:transform 220ms cubic-bezier(.22,.8,.3,1);transform:translate(560px,420px)'
    el.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 7z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>'
    document.body.appendChild(el)
    addEventListener(
      'mousemove',
      (e) => (el.style.transform = `translate(${e.clientX}px,${e.clientY}px)`),
      true,
    )
    addEventListener(
      'mousedown',
      (e) => {
        const r = document.createElement('div')
        r.style.cssText =
          `position:fixed;left:${e.clientX - 16}px;top:${e.clientY - 16}px;width:32px;height:32px;border-radius:50%;` +
          'border:3px solid #007A7B;pointer-events:none;z-index:2147483646;opacity:.9;' +
          'transition:transform 450ms ease-out,opacity 450ms ease-out'
        document.body.appendChild(r)
        requestAnimationFrame(() => {
          r.style.transform = 'scale(1.8)'
          r.style.opacity = '0'
        })
        setTimeout(() => r.remove(), 500)
      },
      true,
    )
  })
}

export const pause = (page: Page, ms: number) => page.waitForTimeout(ms)
