import type { DictionaryWord } from '@engclaw/ipc-contract'

export interface RecentWord {
  id: number
  word: string
}

const RECENT_KEY = 'engclaw.recentWords'

export function pushRecent(list: RecentWord[], entry: RecentWord, max = 10): RecentWord[] {
  return [entry, ...list.filter((w) => w.id !== entry.id)].slice(0, max)
}

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>

export function loadRecent(storage: Storage): RecentWord[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(RECENT_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (w): w is RecentWord =>
        typeof w === 'object' &&
        w !== null &&
        typeof (w as RecentWord).id === 'number' &&
        typeof (w as RecentWord).word === 'string',
    )
  } catch {
    return []
  }
}

export function saveRecent(storage: Storage, list: RecentWord[]): void {
  storage.setItem(RECENT_KEY, JSON.stringify(list))
}

export const formatIpa = (ipa: string): string => `/${ipa}/`

/** Groups senses by part of speech, in order of first appearance. */
export function groupSenses(senses: DictionaryWord['senses']) {
  const groups: { pos: string; senses: DictionaryWord['senses'] }[] = []
  for (const sense of senses) {
    const group = groups.find((g) => g.pos === sense.pos)
    if (group) group.senses.push(sense)
    else groups.push({ pos: sense.pos, senses: [sense] })
  }
  return groups
}
