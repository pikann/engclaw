/**
 * Build-time pipeline: example words from word-roots.json -> etymology facts from Wiktextract
 * (kaikki.org, CC BY-SA 4.0). Nothing is requested from etymonline; only a link-back URL is emitted.
 * Raw responses are cached under .cache/ (git-ignored) and never committed.
 *
 *   bun scripts/data/fetch-wiktextract-etymology.ts [--refresh] [--limit <n>] [--out <file>]
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { isAllowed, parseRobots } from './learnthat-roots'
import {
  LICENSE_HEADER,
  buildEtymology,
  kaikkiUrl,
  parseJsonl,
  validateEtymology,
  type WordEtymology,
} from './wiktextract-etymology'

const USER_AGENT =
  'engclaw-data-pipeline/0.1 (+https://github.com/pikann/engclaw; open-source build-time script)'
const REQUEST_DELAY_MS = 1100
const ROOT = resolve(import.meta.dirname, '../..')
const ROOTS_FILE = resolve(ROOT, 'apps/desktop/resources/data/word-roots.json')
const CACHE_DIR = resolve(ROOT, '.cache/wiktextract')
const DEFAULT_OUT = resolve(ROOT, '.cache/data/word-etymology.json')
const ORIGIN = 'https://kaikki.org'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const args = process.argv.slice(2)
const flag = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const refresh = args.includes('--refresh')
const limit = flag('--limit') ? Number(flag('--limit')) : Infinity
const out = flag('--out') ? resolve(flag('--out')!) : DEFAULT_OUT

const rootsData = JSON.parse(await readFile(ROOTS_FILE, 'utf8')) as {
  roots: { examples: string[] }[]
}
const words = [...new Set(rootsData.roots.flatMap((r) => r.examples))].sort().slice(0, limit)

const rules = parseRobots(
  await fetch(`${ORIGIN}/robots.txt`, { headers: { 'User-Agent': USER_AGENT } }).then((r) =>
    r.text(),
  ),
)

// Empty cache file = the word has no Wiktextract page (404), so it is not requested again.
async function loadWord(word: string): Promise<string> {
  const file = resolve(CACHE_DIR, `${encodeURIComponent(word)}.jsonl`)
  if (!refresh) {
    try {
      return await readFile(file, 'utf8')
    } catch {
      // not cached yet
    }
  }
  const url = kaikkiUrl(word)
  if (!isAllowed(rules, new URL(url).pathname)) throw new Error(`robots.txt disallows ${url}`)
  await sleep(REQUEST_DELAY_MS)
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (res.status !== 404 && !res.ok) throw new Error(`GET ${url} -> ${res.status}`)
  const body = res.status === 404 ? '' : await res.text()
  await mkdir(CACHE_DIR, { recursive: true })
  await writeFile(file, body)
  return body
}

const entries: WordEtymology[] = []
const missing: string[] = []
for (const [i, word] of words.entries()) {
  const result = buildEtymology(word, parseJsonl(await loadWord(word)))
  if (result) entries.push(result)
  else missing.push(word)
  if ((i + 1) % 50 === 0) console.log(`${i + 1}/${words.length}`)
}

const errors = validateEtymology(entries)
if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
await mkdir(dirname(out), { recursive: true })
await writeFile(
  out,
  JSON.stringify(
    { ...LICENSE_HEADER, source: 'https://kaikki.org/', words: entries, missing },
    null,
    2,
  ) + '\n',
)
console.log(`wrote ${entries.length} words (${missing.length} without etymology) -> ${out}`)
