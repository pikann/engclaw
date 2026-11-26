// Complete syllables with the target final, paired with a character for the Mandarin voice.
const examples = {
  a: ['ā', '阿', ['a']],
  o: ['ō', '噢', ['o']],
  e: ['ē', '婀', ['ɤ']],
  // The open e vowel also occurs inside ian, where the sample voice reads it reliably.
  ê: ['yān', '烟', ['j', 'ɛ', 'n']],
  ai: ['āi', '哀', ['a', 'i']],
  ei: ['ēi', '诶', ['e', 'i']],
  ao: ['āo', '凹', ['a', 'u']],
  ou: ['ōu', '欧', ['o', 'u']],
  an: ['ān', '安', ['a', 'n']],
  en: ['ēn', '恩', ['ə', 'n']],
  ang: ['āng', '肮', ['a', 'ŋ']],
  eng: ['dēng', '灯', ['t', 'ə', 'ŋ']],
  ong: ['dōng', '东', ['t', 'ʊ', 'ŋ']],
  er: ['ér', '儿', ['ɚ']],
  i: ['yī', '衣', ['i']],
  ia: ['yā', '鸭', ['j', 'a']],
  ie: ['yē', '椰', ['j', 'e']],
  iao: ['yāo', '腰', ['j', 'a', 'u']],
  iu: ['yōu', '优', ['j', 'o', 'u']],
  ian: ['yān', '烟', ['j', 'ɛ', 'n']],
  in: ['yīn', '音', ['i', 'n']],
  iang: ['yāng', '央', ['j', 'a', 'ŋ']],
  ing: ['yīng', '英', ['i', 'ŋ']],
  iong: ['xiōng', '兄', ['ɕ', 'j', 'ʊ', 'ŋ']],
  u: ['wū', '屋', ['u']],
  ua: ['wā', '蛙', ['w', 'a']],
  uo: ['wō', '窝', ['w', 'o']],
  uai: ['wāi', '歪', ['w', 'a', 'i']],
  ui: ['wēi', '威', ['w', 'e', 'i']],
  uan: ['wān', '弯', ['w', 'a', 'n']],
  un: ['wēn', '温', ['w', 'ə', 'n']],
  uang: ['wāng', '汪', ['w', 'a', 'ŋ']],
  ueng: ['wēng', '翁', ['w', 'ə', 'ŋ']],
  ü: ['yū', '迂', ['y']],
  üe: ['yuē', '约', ['y', 'e']],
  üan: ['yuān', '渊', ['y', 'ɛ', 'n']],
  ün: ['yūn', '晕', ['y', 'n']],
} as const

export const MANDARIN_FINALS = Object.keys(examples)

const aliases: ReadonlyMap<string, string> = new Map([
  ['iou', 'iu'],
  ['uei', 'ui'],
  ['uen', 'un'],
])

export function mandarinFinal(text: string) {
  const spelling = text.normalize('NFKC').trim().toLowerCase().replace(/u:|v/gu, 'ü')
  const final = aliases.get(spelling) ?? spelling
  if (!Object.hasOwn(examples, final)) return null
  const [reading, han, phones] = examples[final as keyof typeof examples]
  return { final, spelling, reading, han, phones }
}

export type MandarinFinal = NonNullable<ReturnType<typeof mandarinFinal>>
