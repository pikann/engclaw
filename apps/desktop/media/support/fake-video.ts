import type { ElectronApplication, Page } from '@playwright/test'

/** A made-up video (not a real recording or channel) used only to fill the player area. */
export const DEMO_VIDEO_ID = 'Hk3mT9xLq2A'
export const DEMO_URL = `https://www.youtube.com/watch?v=${DEMO_VIDEO_ID}`
export const DEMO_TITLE = 'Ordering coffee in English: real conversations'
export const DEMO_CUES = [
  { start: 10, dur: 3, text: 'Hello, I am a developer.' },
  { start: 14, dur: 3, text: 'Could I get a large latte, please?' },
  { start: 19, dur: 3, text: 'What did you build today?' },
]

/**
 * Makes the app believe the video link resolves: the metadata and transcript calls answer
 * instantly, so the shadowing flow can start from pasting a URL and needs no network. (The
 * YouTube player itself is replaced separately: see stubPlayer and installFakeVideo.)
 */
export async function stubYouTube(app: ElectronApplication): Promise<void> {
  await app.evaluate(
    ({ ipcMain }, demo) => {
      ipcMain.removeHandler('youtube:meta')
      ipcMain.handle('youtube:meta', () => ({
        ok: true,
        value: {
          videoId: demo.id,
          title: demo.title,
          durationSec: 225,
          captionTracks: [{ lang: 'en', auto: false }],
        },
      }))
      ipcMain.removeHandler('youtube:transcript')
      ipcMain.handle('youtube:transcript', () => ({ ok: true, value: demo.cues }))
    },
    { id: DEMO_VIDEO_ID, title: DEMO_TITLE, cues: DEMO_CUES },
  )
}

/**
 * The real player is a native view layered over the window, which a page screenshot cannot see
 * (offline it is just a black box). Draw a video-player look-alike in its place: a scene, a title,
 * a caption, a progress bar and controls, so the GIF reads as "a YouTube video".
 */
export async function installFakeVideo(page: Page): Promise<void> {
  await page.evaluate(
    ({ title, cues }) => {
      const host = document.querySelector<HTMLElement>('[data-testid="shadowing-player"]')
      if (!host) throw new Error('player area not found')
      host.style.cssText +=
        ';position:relative;overflow:hidden;background:#000;container-type:inline-size'
      host.innerHTML = `
<svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%">
  <defs>
    <linearGradient id="fv-wall" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6e7d3"/><stop offset="1" stop-color="#cfa982"/></linearGradient>
    <linearGradient id="fv-bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a4f33"/><stop offset="1" stop-color="#4b2e1d"/></linearGradient>
    <filter id="fv-blur"><feGaussianBlur stdDeviation="2.2"/></filter>
  </defs>
  <rect width="160" height="90" fill="url(#fv-wall)"/>
  <g filter="url(#fv-blur)" opacity=".75">
    <circle cx="18" cy="16" r="7" fill="#fff6d6"/><circle cx="34" cy="26" r="5" fill="#ffd9a0"/>
    <circle cx="132" cy="14" r="8" fill="#fff1c9"/><circle cx="148" cy="30" r="5" fill="#ffe0b3"/>
    <circle cx="120" cy="34" r="4" fill="#ffffff"/>
  </g>
  <rect x="0" y="62" width="160" height="28" fill="url(#fv-bar)"/>
  <rect x="0" y="61" width="160" height="2" fill="#a77b55"/>
  <path d="M52 90 C52 66 64 58 80 58 C96 58 108 66 108 90 Z" fill="#2f5d62"/>
  <rect x="73" y="46" width="14" height="14" rx="5" fill="#d9a67f"/>
  <ellipse cx="80" cy="36" rx="15" ry="17" fill="#e6b992"/>
  <path d="M64 34 C63 18 76 15 83 17 C94 18 98 26 96 36 C93 29 88 26 80 26 C72 26 67 29 64 34 Z" fill="#3a2a22"/>
  <circle cx="74.5" cy="37" r="1.3" fill="#2b2118"/><circle cx="85.5" cy="37" r="1.3" fill="#2b2118"/>
  <path d="M74 44 Q80 48 86 44" stroke="#a5503f" stroke-width="1.4" fill="none" stroke-linecap="round"/>
  <rect x="112" y="64" width="14" height="12" rx="2" fill="#f4f0ea"/><path d="M126 67 q5 2 0 6" stroke="#f4f0ea" stroke-width="1.6" fill="none"/>
  <rect x="113" y="66" width="12" height="3" fill="#6b3f26"/>
</svg>
<div style="position:absolute;inset:0 0 auto 0;padding:2.4cqw 3cqw 9cqw;color:#fff;font:600 3.6cqw/1.2 Inter,system-ui,sans-serif;background:linear-gradient(#000a,#0000);text-shadow:0 1px 2px #0008">${title}</div>
<div id="fv-cap" style="position:absolute;left:50%;bottom:15cqw;transform:translateX(-50%);max-width:88%;padding:.6cqw 2cqw;border-radius:.8cqw;background:#000c;color:#fff;font:500 3.6cqw/1.3 Inter,system-ui,sans-serif;text-align:center;white-space:nowrap">${cues[0]!.text}</div>
<div style="position:absolute;inset:auto 0 0 0;padding:7cqw 2.4cqw 1.8cqw;background:linear-gradient(#0000,#000b);color:#fff;font:500 3cqw Inter,system-ui,sans-serif">
  <div style="position:relative;height:.9cqw;border-radius:1cqw;background:#fff4;margin-bottom:1.6cqw">
    <div id="fv-buf" style="position:absolute;inset:0 auto 0 0;width:38%;border-radius:1cqw;background:#fff6"></div>
    <div id="fv-prog" style="position:absolute;inset:0 auto 0 0;width:4%;border-radius:1cqw;background:#f03"></div>
    <div id="fv-dot" style="position:absolute;top:50%;left:4%;width:2.4cqw;height:2.4cqw;margin:-1.2cqw 0 0 -1.2cqw;border-radius:50%;background:#f03"></div>
  </div>
  <div style="display:flex;align-items:center;gap:2.6cqw">
    <svg width="3.6%" viewBox="0 0 24 24" fill="#fff"><path d="M7 4l13 8-13 8z"/></svg>
    <svg width="3.6%" viewBox="0 0 24 24" fill="#fff"><path d="M4 9v6h4l5 4V5L8 9zm11 .5v5a3.5 3.5 0 000-5z"/></svg>
    <span id="fv-time">0:10 / 3:45</span>
    <span style="flex:1"></span>
    <span style="border:.35cqw solid #fff;border-radius:.6cqw;padding:0 1cqw;font-weight:700;font-size:2.4cqw">CC</span>
    <svg width="3.6%" viewBox="0 0 24 24" fill="#fff"><path d="M19.4 13a7.7 7.7 0 000-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 00-1.7-1L15 3.3h-4L10.7 6a7.4 7.4 0 00-1.7 1l-2.5-1-2 3.5L6.6 11a7.7 7.7 0 000 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 001.7 1l.3 2.7h4l.3-2.7a7.4 7.4 0 001.7-1l2.5 1 2-3.5zM12 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z"/></svg>
    <svg width="3.6%" viewBox="0 0 24 24" fill="#fff"><path d="M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z"/></svg>
  </div>
</div>`
      const cap = host.querySelector<HTMLElement>('#fv-cap')!
      const prog = host.querySelector<HTMLElement>('#fv-prog')!
      const dot = host.querySelector<HTMLElement>('#fv-dot')!
      const time = host.querySelector<HTMLElement>('#fv-time')!
      const w = window as unknown as { __fvTimer?: number }
      clearInterval(w.__fvTimer)
      let t = cues[0]!.start
      w.__fvTimer = window.setInterval(() => {
        t += 0.1
        const pct = Math.min(100, (t / 225) * 100)
        prog.style.width = dot.style.left = `${pct}%`
        const s = Math.floor(t)
        time.textContent = `0:${String(s).padStart(2, '0')} / 3:45`
        const cue = cues.find((c) => t >= c.start && t < c.start + c.dur)
        cap.style.visibility = cue ? 'visible' : 'hidden'
        if (cue) cap.textContent = cue.text
      }, 100)
    },
    { title: DEMO_TITLE, cues: DEMO_CUES },
  )
}
