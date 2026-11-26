import { Converter } from 'opencc-js/t2cn'
import { pinyin } from 'pinyin-pro'

const toSimplified = Converter({ from: 'tw', to: 'cn' })

// Standard spellings grouped by initial. Keeping the combinations explicit avoids
// treating an arbitrary Latin word as a Mandarin syllable.
const spellings: Record<string, string> = {
  '': 'a ai an ang ao e ei en eng er o ou ê m n ng hm hng',
  b: 'a ai an ang ao ei en eng i ian iao ie in ing o u',
  p: 'a ai an ang ao ei en eng i ian iao ie in ing o ou u',
  m: 'a ai an ang ao e ei en eng i ian iao ie in ing iu o ou u',
  f: 'a an ang ei en eng o ou u',
  d: 'a ai an ang ao e ei eng i ia ian iao ie ing iu ong ou u uan ui un uo',
  t: 'a ai an ang ao e eng i ian iao ie ing ong ou u uan ui un uo',
  n: 'a ai an ang ao e ei en eng i ian iang iao ie in ing iu ong ou u uan uo ü üe',
  l: 'a ai an ang ao e ei eng i ia ian iang iao ie in ing iu o ong ou u uan un uo ü üe',
  g: 'a ai an ang ao e ei en eng ong ou u ua uai uan uang ui un uo',
  k: 'a ai an ang ao e en eng ong ou u ua uai uan uang ui un uo',
  h: 'a ai an ang ao e ei en eng ong ou u ua uai uan uang ui un uo',
  j: 'i ia ian iang iao ie in ing iong iu u uan ue un',
  q: 'i ia ian iang iao ie in ing iong iu u uan ue un',
  x: 'i ia ian iang iao ie in ing iong iu u uan ue un',
  zh: 'a ai an ang ao e ei en eng i ong ou u ua uai uan uang ui un uo',
  ch: 'a ai an ang ao e en eng i ong ou u ua uai uan uang ui un uo',
  sh: 'a ai an ang ao e ei en eng i ou u ua uai uan uang ui un uo',
  r: 'an ang ao e en eng i ong ou u ua uan ui un uo',
  z: 'a ai an ang ao e ei en eng i ong ou u uan ui un uo',
  c: 'a ai an ang ao e en eng i ong ou u uan ui un uo',
  s: 'a ai an ang ao e en eng i ong ou u uan ui un uo',
  y: 'a an ang ao e i in ing o ong ou u uan ue un',
  w: 'a ai an ang ei en eng o u',
}

const syllableParts = new Map(
  Object.entries(spellings).flatMap(([initial, finals]) =>
    finals.split(' ').map((final) => [initial + final, { initial, final }] as const),
  ),
)
const toneMarks = ['\u0304', '\u0301', '\u030c', '\u0300']
const tonePattern = /[\u0304\u0301\u030c\u0300]/gu
type Tone = 0 | 1 | 2 | 3 | 4 | 5

export interface MandarinSyllable {
  han: string
  marked: string
  plain: string
  initial: string
  final: string
  tone: Tone
  pauseBefore: boolean
}

function syllable(raw: string, han = '', pauseBefore = false): MandarinSyllable | null {
  const letters = raw.normalize('NFD')
  const marks = [...letters.matchAll(tonePattern)]
  const number = /[0-5]$/u.exec(letters)?.[0]
  if (marks.length > 1 || (marks.length && number)) return null
  const plain = letters
    .replace(tonePattern, '')
    .replace(/[0-5]$/u, '')
    .normalize('NFC')
  const parts = syllableParts.get(plain)
  if (!parts) return null
  let tone = Number(number ?? (han ? 5 : 0)) as Tone
  if (number === '0') tone = 5
  if (marks[0]) tone = (toneMarks.indexOf(marks[0][0]) + 1) as Tone
  // Tone marks go on a, then e/ê, then o in ou, otherwise the last vowel.
  const carrier =
    ['a', 'e', 'ê', 'ou'].map((key) => plain.indexOf(key)).find((index) => index >= 0) ??
    [...plain.matchAll(/[aeêiouü]/gu)].at(-1)?.index ??
    Math.max(0, plain.search(/[mn]/u))
  const marked =
    tone >= 1 && tone <= 4
      ? (plain.slice(0, carrier + 1) + toneMarks[tone - 1] + plain.slice(carrier + 1)).normalize(
          'NFC',
        )
      : plain
  if (marks.length && marked.normalize('NFD') !== letters) return null
  return { han, marked, plain, ...parts, tone, pauseBefore }
}

/** Split joined input using the fewest valid syllables, preferring longer matches at the start. */
function splitPinyin(word: string): MandarinSyllable[] | null {
  const paths = new Map<number, { item: MandarinSyllable; end: number; count: number }>()
  for (let start = word.length - 1; start >= 0; start--) {
    for (let end = Math.min(start + 10, word.length); end > start; end--) {
      const suffix = paths.get(end)
      if (end !== word.length && !suffix) continue
      if (/[\p{Mark}0-5]/u.test(word[end] ?? '')) continue
      const count = 1 + (suffix?.count ?? 0)
      if (count >= (paths.get(start)?.count ?? Infinity)) continue
      const item = syllable(word.slice(start, end))
      if (item) paths.set(start, { item, end, count })
    }
  }
  if (!paths.has(0)) return null
  const result: MandarinSyllable[] = []
  for (let index = 0; index < word.length;) {
    const path = paths.get(index)!
    result.push(path.item)
    index = path.end
  }
  return result
}

export const hasHanzi = (text: string) => /\p{Script=Han}/u.test(text)

export function mandarinGuide(text: string): MandarinSyllable[] {
  if (hasHanzi(text)) {
    let paused = false
    const original = Array.from(text)
    const simplified = toSimplified(text)
    const aligned = Array.from(simplified).length === original.length
    return pinyin(aligned ? simplified : text, { type: 'all', traditional: true }).flatMap(
      ({ origin, pinyin: reading, isZh }, index) => {
        const item = isZh
          ? syllable(reading, aligned ? (original[index] ?? origin) : origin, paused)
          : null
        paused = item === null
        return item ? [item] : []
      },
    )
  }

  const normalized = text.normalize('NFKC').toLowerCase().replace(/u:|v/gu, 'ü').normalize('NFD')
  const result: MandarinSyllable[] = []
  let paused = false
  for (const chunk of normalized.split(/([\s'’·-]+|[,.!?;，。！？；、]+)/u).filter(Boolean)) {
    if (/^[,.!?;，。！？；、]+$/u.test(chunk)) {
      paused = true
    } else if (!/^[\s'’·-]+$/u.test(chunk)) {
      const items = splitPinyin(chunk)
      if (!items) return []
      items[0]!.pauseBefore = paused
      paused = false
      result.push(...items)
    }
  }
  return result
}

export function pinyinSpeech(items: MandarinSyllable[]): string {
  return items
    .map(
      (item, index) =>
        `${index && item.pauseBefore ? ', ' : ''}${item.plain.replaceAll('ü', 'v')}${item.tone || 5}`,
    )
    .join('')
}
