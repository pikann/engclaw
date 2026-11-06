/**
 * Build-time pipeline: Open English WordNet + CMUdict + word-roots.json + word-etymology.json
 * -> dictionary.sqlite (read-only, FTS5) + dictionary.manifest.json (version + sha256).
 * Source archives go to .cache/dictionary and word-roots/word-etymology are read from .cache/data (git-ignored).
 * The sqlite + manifest are written to apps/desktop/resources/data and committed, to seed the app.
 *
 *   bun scripts/data/build-dictionary.ts [--refresh] [--out <dir>]
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { parseCmudict, parseWordnet } from './dictionary-sources'
import { buildDictionary } from './dictionary-db'
import type { RootEntry } from './morphemes'
import type { WordEtymology } from './wiktextract-etymology'

const USER_AGENT =
  'engclaw-data-pipeline/0.1 (+https://github.com/pikann/engclaw; open-source build-time script)'
const ROOT = resolve(import.meta.dirname, '../..')
const DATA_DIR = resolve(ROOT, '.cache/data')
const OUT_DIR = resolve(ROOT, 'apps/desktop/resources/data')
const CACHE_DIR = resolve(ROOT, '.cache/dictionary')
const WORDNET_URL = 'https://en-word.net/static/english-wordnet-2024.xml.gz'
const CMUDICT_URL = 'https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict'

const args = process.argv.slice(2)
const refresh = args.includes('--refresh')
const outIdx = args.indexOf('--out')
const outDir = outIdx >= 0 ? resolve(args[outIdx + 1]!) : OUT_DIR

async function cached(name: string, url: string): Promise<Buffer> {
  const file = resolve(CACHE_DIR, name)
  if (!refresh && existsSync(file)) return readFile(file)
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`)
  const body = Buffer.from(await res.arrayBuffer())
  await mkdir(CACHE_DIR, { recursive: true })
  await writeFile(file, body)
  return body
}

const wordnet = parseWordnet(
  gunzipSync(await cached('oewn-2024.xml.gz', WORDNET_URL)).toString('utf8'),
)
const pronunciations = parseCmudict((await cached('cmudict.dict', CMUDICT_URL)).toString('utf8'))
const { roots } = JSON.parse(await readFile(resolve(DATA_DIR, 'word-roots.json'), 'utf8')) as {
  roots: RootEntry[]
}
const { words: etymology } = JSON.parse(
  await readFile(resolve(DATA_DIR, 'word-etymology.json'), 'utf8'),
) as { words: WordEtymology[] }

await mkdir(outDir, { recursive: true })
const manifest = buildDictionary(resolve(outDir, 'dictionary.sqlite'), {
  wordnet,
  pronunciations,
  roots,
  etymology,
})
await writeFile(
  resolve(outDir, 'dictionary.manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
)
console.log(JSON.stringify(manifest, null, 2))
