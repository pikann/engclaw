const examples = {
  b: ['bā', '八', ['p', 'a']],
  p: ['pā', '趴', ['p', 'h', 'a']],
  m: ['mā', '妈', ['m', 'a']],
  f: ['fā', '发', ['f', 'a']],
  d: ['dā', '搭', ['t', 'a']],
  t: ['tā', '他', ['t', 'h', 'a']],
  n: ['ná', '拿', ['n', 'a']],
  l: ['lā', '拉', ['l', 'a']],
  g: ['gē', '哥', ['k', 'ɤ']],
  k: ['kē', '科', ['k', 'h', 'ɤ']],
  h: ['hē', '喝', ['x', 'ɤ']],
  j: ['jī', '鸡', ['tɕ', 'ɕ', 'i']],
  q: ['qī', '七', ['tɕ', 'ɕ', 'h', 'i']],
  x: ['xī', '西', ['ɕ', 'i']],
  zh: ['zhī', '知', ['ʈʂ', 'ʂ', 'ɻ']],
  ch: ['chī', '吃', ['ʈʂ', 'ʂ', 'h', 'ɻ']],
  sh: ['shī', '诗', ['ʂ', 'ɻ']],
  r: ['rì', '日', ['ɻ']],
  z: ['zī', '资', ['ts', 's', 'ɹ']],
  c: ['cī', '疵', ['ts', 's', 'h', 'ɹ']],
  s: ['sī', '丝', ['s', 'ɹ']],
} as const

export function mandarinInitial(text: string) {
  const initial = text.normalize('NFKC').trim().toLowerCase()
  if (!Object.hasOwn(examples, initial)) return null
  const [reading, han, phones] = examples[initial as keyof typeof examples]
  return { initial, reading, han, phones }
}

export type MandarinInitial = NonNullable<ReturnType<typeof mandarinInitial>>
