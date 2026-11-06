/**
 * Build-time pipeline: learnthat.org root-word table -> structured facts.
 * Raw HTML is cached under .cache/ (git-ignored) and never committed.
 *
 *   bun scripts/data/fetch-learnthat-roots.ts [--refresh] [--out <file>]
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { SOURCE_URL, isAllowed, parseRobots, parseRoots, validateRoots } from './learnthat-roots'

const USER_AGENT =
  'engclaw-data-pipeline/0.1 (+https://github.com/pikann/engclaw; open-source build-time script)'
const REQUEST_DELAY_MS = 2000
const ROOT = resolve(import.meta.dirname, '../..')
const CACHE_HTML = resolve(ROOT, '.cache/learnthat/roots.html')
const DEFAULT_OUT = resolve(ROOT, '.cache/data/word-roots.json')

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function get(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' })
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`)
  return res.text()
}

async function loadHtml(refresh: boolean): Promise<string> {
  if (!refresh) {
    try {
      return await readFile(CACHE_HTML, 'utf8')
    } catch {
      // not cached yet
    }
  }
  const url = new URL(SOURCE_URL)
  const rules = parseRobots(await get(`${url.origin}/robots.txt`))
  if (!isAllowed(rules, url.pathname)) throw new Error(`robots.txt disallows ${url.pathname}`)
  await sleep(REQUEST_DELAY_MS)
  const html = await get(SOURCE_URL)
  await mkdir(dirname(CACHE_HTML), { recursive: true })
  await writeFile(CACHE_HTML, html)
  return html
}

const args = process.argv.slice(2)
const outIdx = args.indexOf('--out')
const out = outIdx >= 0 ? resolve(args[outIdx + 1]) : DEFAULT_OUT

const facts = parseRoots(await loadHtml(args.includes('--refresh')))
const errors = validateRoots(facts)
if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
await mkdir(dirname(out), { recursive: true })
await writeFile(out, JSON.stringify({ source: SOURCE_URL, roots: facts }, null, 2) + '\n')
console.log(`wrote ${facts.length} roots -> ${out}`)
