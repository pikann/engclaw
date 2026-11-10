import type { AppEnvironment } from '@engclaw/ipc-contract'

export const ISSUES_URL = 'https://github.com/pikann/engclaw/issues'
const NEW_BUG_URL = `${ISSUES_URL}/new?template=bug_report.yml`
/** GitHub rejects very long URLs (~8k); stay well under. */
export const MAX_URL_LENGTH = 6000
const TRUNCATED = '[truncated]'

export interface FeedbackInput {
  /** Error message, optionally followed by a stack. */
  error: string
  /** Route/screen, e.g. the hash path. */
  route: string
  locale: string
  env: AppEnvironment
}

/** Replaces home-directory prefixes with `~` and masks anything that looks like a secret or a YouTube link. */
export function sanitize(text: string): string {
  return text
    .replace(/\/(?:Users|home)\/[^/\s'"`:)]+/g, '~')
    .replace(/[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s'"`:)]+/gi, '~')
    .replace(
      /https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com)\S*/gi,
      '[youtube-url]',
    )
    .replace(/\b(?:sk|pk|ghp|gho|xox[bap])[-_][A-Za-z0-9_-]{16,}/g, '[token]')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [token]')
    .replace(
      /((?:api[_-]?key|token|secret|password|authorization)["']?\s*[:=]\s*["']?)[^\s"',;&]+/gi,
      '$1[redacted]',
    )
}

/** Route without query/params that could carry ids (the hash path only). */
export function routeOf(hash: string): string {
  const path = hash.replace(/^#/, '').split('?')[0] || '/'
  return path.replace(/\/chapter\/\d+/, '/chapter/:order')
}

const osName = (p: string): string =>
  p === 'darwin' ? 'macOS' : p === 'win32' ? 'Windows' : p === 'linux' ? 'Linux' : p

function firstLine(text: string): string {
  const line = text.split('\n')[0]?.trim() ?? ''
  return line.length > 100 ? `${line.slice(0, 97)}...` : line
}

const osOption = (p: string): string | undefined =>
  p === 'darwin' ? 'macOS' : p === 'win32' ? 'Windows' : p === 'linux' ? 'Linux' : undefined

/** "What happened?": a short, human-readable line (the stack goes into the logs field). */
function whatOf(i: FeedbackInput, error: string): string {
  return `${firstLine(error) || 'Unexpected error'}\n\n(Screen: ${i.route})`
}

/** "Logs or screenshots": the error/stack plus environment details the template has no field for. */
function logsOf(i: FeedbackInput, error: string): string {
  const e = i.env
  return [
    '```',
    error,
    '```',
    '',
    `- Screen: ${i.route}`,
    `- OS: ${osName(e.platform)} ${e.osVersion} (${e.arch})`,
    `- Electron: ${e.electronVersion}`,
    `- Execution providers: ${e.executionProviders.join(' > ')}`,
    `- Locale: ${i.locale}`,
  ].join('\n')
}

export interface FeedbackLink {
  url: string
  truncated: boolean
  /** Full sanitized report text, for the clipboard when truncated. */
  fullText: string
}

/** GitHub issue forms ignore `body`; they are prefilled by field id (see bug_report.yml). */
function urlFor(i: FeedbackInput, title: string, error: string, logs: string): string {
  const q = new URLSearchParams({ title, what: whatOf(i, error), version: i.env.appVersion })
  const os = osOption(i.env.platform)
  if (os) q.set('os', os)
  q.set('logs', logs)
  return `${NEW_BUG_URL}&${q.toString().replace(/\+/g, '%20')}`
}

/** Builds the prefilled bug-report URL; trims the error until the whole URL fits MAX_URL_LENGTH. */
export function buildFeedbackLink(i: FeedbackInput): FeedbackLink {
  const error = sanitize(i.error)
  const title = `Bug: ${firstLine(error) || 'Unexpected error'}`
  const fullText = logsOf(i, error)
  const full = urlFor(i, title, error, fullText)
  if (full.length <= MAX_URL_LENGTH) return { url: full, truncated: false, fullText }
  let keep = Math.min(error.length, MAX_URL_LENGTH)
  for (;;) {
    keep = Math.max(0, Math.floor(keep * 0.85) - 1)
    const url = urlFor(i, title, error, logsOf(i, `${error.slice(0, keep)}\n${TRUNCATED}`))
    if (url.length <= MAX_URL_LENGTH || keep === 0) return { url, truncated: true, fullText }
  }
}
