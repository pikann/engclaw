export interface RootEntry {
  root: string
  forms: string[]
  meaning: string
  origins: string[]
  examples: string[]
  sourceUrl: string
}

export type MorphemeKind = 'prefix' | 'root' | 'suffix'

export interface MorphemeLink {
  position: number
  kind: MorphemeKind
  form: string
  rootIndex: number
}

const PREFIXES = new Set(
  (
    'a ab abs ac ad ambi amphi ana ante anti apo auto bene bi cata circum co col com con contra ' +
    'de di dia dis dys e en ex extra hyper hypo il im in inter intra ir mal meta mis mono multi ' +
    'neo non ob pan para per peri poly post pre pro re retro semi sub super syn trans tri ultra ' +
    'un uni'
  ).split(' '),
)

const SUFFIXES = new Set(
  (
    'able ible age al ance ence ary cide cracy ectomy ful fy graphy ia ic ical ify ism ist ite ity ' +
    'ive ize ise less logy ment ness oid ology ous phobia ship sion tion tude ward'
  ).split(' '),
)

export function expandForms(rootField: string): string[] {
  const forms: string[] = []
  for (const alt of rootField.split(/[,\s]+/).filter(Boolean)) {
    const [base, ...parts] = alt.split('/')
    if (!base) continue
    forms.push(base)
    for (const part of parts) forms.push(part.length > 1 ? part : base + part)
  }
  return [...new Set(forms)]
}

interface Candidate {
  start: number
  end: number
  form: string
  rootIndex: number
}

export function linkMorphemes(
  word: string,
  roots: { index: number; entry: RootEntry }[],
): MorphemeLink[] {
  const lower = word.toLowerCase()
  const candidates: Candidate[] = []
  for (const { index, entry } of roots) {
    for (const form of expandForms(entry.root)) {
      const at = form.length < 3 ? (lower.startsWith(form) ? 0 : -1) : lower.indexOf(form)
      if (at >= 0) {
        candidates.push({ start: at, end: at + form.length, form, rootIndex: index })
      }
    }
  }

  candidates.sort((a, b) => b.form.length - a.form.length || a.start - b.start)
  const kept: Candidate[] = []
  for (const c of candidates) {
    if (kept.some((k) => c.start < k.end && k.start < c.end)) continue
    if (kept.some((k) => k.rootIndex === c.rootIndex)) continue
    kept.push(c)
  }
  kept.sort((a, b) => a.start - b.start)

  return kept.map((c, position) => ({
    position,
    kind: classify(c, lower),
    form: c.form,
    rootIndex: c.rootIndex,
  }))
}

function classify(c: Candidate, word: string): MorphemeKind {
  if (c.start === 0 && c.end < word.length && PREFIXES.has(c.form)) return 'prefix'
  if (c.end === word.length && c.start > 0 && SUFFIXES.has(c.form)) return 'suffix'
  return 'root'
}
