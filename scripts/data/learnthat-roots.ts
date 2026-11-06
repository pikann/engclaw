export interface RootFact {
  root: string
  forms: string[]
  meaning: string
  origins: string[]
  examples: string[]
  sourceUrl: string
}

export const SOURCE_URL = 'https://www.learnthat.org/pages/view/roots.html'

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#8217;': '’',
  '&#039;': "'",
  '&#39;': "'",
  '&nbsp;': ' ',
}

function text(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&#?\w+;/g, (e) => ENTITIES[e] ?? e)
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .trim()
}

// Only the word itself is kept from "word - definition" entries; definitions are copyrighted prose.
function exampleWords(cell: string): string[] {
  const body = text(cell)
  // A few rows use "word gloss, word gloss" with no dash; fall back to comma-separated first tokens.
  const parts = /\s[-–—]\s|:/.test(body) ? body.split(/[;\n]/) : body.split(/[,;\n]/)
  const words = parts
    .map((part) =>
      part
        .split(/\s+[-–—]\s+|:/)[0]
        .trim()
        .toLowerCase(),
    )
    .map((w) => (/\s[-–—]\s|:/.test(body) ? w : w.split(/\s+/)[0]))
    .filter((w) => /^[a-z][a-z' -]*$/.test(w))
  return [...new Set(words)]
}

export function parseRoots(html: string, sourceUrl = SOURCE_URL): RootFact[] {
  const table = /<table[^>]*class="root_meanings"[^>]*>([\s\S]*?)<\/table>/i.exec(html)
  if (!table) throw new Error('root_meanings table not found — page layout changed?')

  const facts: RootFact[] = []
  for (const [, row] of table[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1])
    if (cells.length < 5) continue
    const root = text(cells[1]).replace(/\s+/g, ' ')
    if (!root || /^root word$/i.test(root)) continue
    facts.push({
      root,
      forms: root
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean),
      meaning: text(cells[2]).replace(/\s+/g, ' '),
      origins: text(cells[3])
        .split('\n')
        .map((o) => o.trim())
        .filter(Boolean),
      examples: exampleWords(cells[4]),
      sourceUrl,
    })
  }
  return facts
}

export function validateRoots(facts: RootFact[]): string[] {
  const errors: string[] = []
  if (facts.length < 100) errors.push(`only ${facts.length} roots parsed (expected >= 100)`)
  facts.forEach((f, i) => {
    const at = `#${i} "${f.root}"`
    if (!f.meaning) errors.push(`${at}: empty meaning`)
    if (f.examples.length === 0) errors.push(`${at}: no example words`)
    if (f.forms.length === 0) errors.push(`${at}: no forms`)
  })
  return errors
}

export interface RobotsRules {
  disallow: string[]
}

export function parseRobots(body: string): RobotsRules {
  const disallow: string[] = []
  let applies = false
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim()
    const m = /^([\w-]+)\s*:\s*(.*)$/.exec(line)
    if (!m) continue
    const key = m[1].toLowerCase()
    if (key === 'user-agent') applies = m[2] === '*'
    else if (key === 'disallow' && applies && m[2]) disallow.push(m[2])
  }
  return { disallow }
}

export function isAllowed(rules: RobotsRules, path: string): boolean {
  return !rules.disallow.some((prefix) => path.startsWith(prefix))
}
