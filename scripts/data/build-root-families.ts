/**
 * Build-time pipeline: kaikki.org English dump (Wiktextract, CC BY-SA 4.0) + word-roots.json
 * -> root-families.json: every dictionary word that shares a Latin/Greek source with a root's examples.
 * The dump (~3.4 GB) is downloaded once to .cache/kaikki (git-ignored); nothing there is committed.
 *
 *   bun scripts/data/build-root-families.ts [--refresh] [--out <file>]
 */
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createWriteStream } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { parseWordnet } from './dictionary-sources'
import type { RootEntry } from './morphemes'
import {
  addEntry,
  addTermEntry,
  buildFamilies,
  type Lineage,
  type TermParents,
} from './root-families'
import { LICENSE_HEADER, type WiktextractEntry } from './wiktextract-etymology'

const USER_AGENT =
  'engclaw-data-pipeline/0.1 (+https://github.com/pikann/engclaw; open-source build-time script)'
const ROOT = resolve(import.meta.dirname, '../..')
const dumpUrl = (lang: string) =>
  `https://kaikki.org/dictionary/${lang.replace(' ', '%20')}/kaikki.org-dictionary-${lang.replace(' ', '')}.jsonl`
const dumpFile = (lang: string) =>
  resolve(ROOT, `.cache/kaikki/kaikki.org-dictionary-${lang.replace(' ', '')}.jsonl`)
const WORDNET_FILE = resolve(ROOT, '.cache/dictionary/oewn-2024.xml.gz')
const ROOTS_FILE = resolve(ROOT, '.cache/data/word-roots.json')
const DEFAULT_OUT = resolve(ROOT, '.cache/data/root-families.json')

const args = process.argv.slice(2)
const outIdx = args.indexOf('--out')
const out = outIdx >= 0 ? resolve(args[outIdx + 1]!) : DEFAULT_OUT

async function ensureDump(lang: string, refresh: boolean) {
  const file = dumpFile(lang)
  if (!refresh && existsSync(file)) return
  const res = await fetch(dumpUrl(lang), { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok || !res.body) throw new Error(`GET ${dumpUrl(lang)} -> ${res.status}`)
  await mkdir(dirname(file), { recursive: true })
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(`${file}.part`))
  await rename(`${file}.part`, file)
}

async function* entriesOf(lang: string): AsyncGenerator<WiktextractEntry> {
  await ensureDump(lang, args.includes('--refresh'))
  for await (const line of createInterface({ input: createReadStream(dumpFile(lang)) })) {
    // Cheap pre-filter: only entries that carry etymology templates matter.
    if (!line.includes('"etymology_templates"')) continue
    yield JSON.parse(line) as WiktextractEntry
  }
}

const lineages = new Map<string, Lineage>()
const termParents: TermParents = new Map()
const affixTerms = new Set<string>()
let count = 0
for await (const entry of entriesOf('English')) {
  if (++count % 100_000 === 0) console.log(`English: ${count} entries, ${lineages.size} words`)
  addEntry(lineages, entry, affixTerms)
}
// Latin and Ancient Greek entries link derived forms (percipio) to their root lemma (capio).
for (const lang of ['Latin', 'Ancient Greek']) {
  for await (const entry of entriesOf(lang)) addTermEntry(termParents, entry, affixTerms)
  console.log(`${lang}: ${termParents.size} terms with ancestors`)
}

const wordnet = parseWordnet(gunzipSync(await readFile(WORDNET_FILE)).toString('utf8'))
const allowed = new Set(wordnet.entries.map((e) => e.word).filter((w) => /^[a-z]+$/.test(w)))
const { roots } = JSON.parse(await readFile(ROOTS_FILE, 'utf8')) as { roots: RootEntry[] }

const families = buildFamilies(roots, lineages, { allowed, affixTerms, termParents })
const total = new Set(families.flatMap((f) => f.words)).size
await mkdir(dirname(out), { recursive: true })
await writeFile(
  out,
  JSON.stringify({ ...LICENSE_HEADER, source: dumpUrl('English'), families }, null, 2) + '\n',
)
console.log(
  `wrote ${families.length} families (${families.filter((f) => f.seeds.length).length} with seeds, ${total} distinct words) -> ${out}`,
)
