import type { MandarinSyllable } from '../../../shared/mandarin-pronunciation'

export * from '../../../shared/mandarin-pronunciation'

const writtenGlides: Record<string, string> = {
  yi: 'i',
  ya: 'ia',
  ye: 'ie',
  yao: 'iao',
  you: 'iu',
  yan: 'ian',
  yang: 'iang',
  yin: 'in',
  ying: 'ing',
  yong: 'iong',
  yu: 'ü',
  yue: 'üe',
  yuan: 'üan',
  yun: 'ün',
  wu: 'u',
  wa: 'ua',
  wo: 'uo',
  wai: 'uai',
  wei: 'ui',
  wan: 'uan',
  wang: 'uang',
  wen: 'un',
  weng: 'ueng',
}

function spokenFinal(item: MandarinSyllable): string {
  return (
    writtenGlides[item.plain] ??
    (/^[jqx]$/u.test(item.initial) ? item.final.replace(/^u/u, 'ü') : item.final)
  )
}

export function finalTipKey(item: MandarinSyllable): string {
  if (item.final === 'i' && /^(?:[zcs]h?|r)$/u.test(item.initial)) return 'pronunciation.apical'
  return `pronunciation.finals.${spokenFinal(item)}`
}

export const toneArrows = ['?', '→', '↗', '↘↗', '↘', '·'] as const

const vietnameseInitials: Record<string, string> = {
  b: 'p',
  p: 'p bật hơi',
  m: 'm',
  f: 'ph',
  d: 't',
  t: 'th',
  n: 'n',
  l: 'l',
  g: 'c/k',
  k: 'c/k bật hơi',
  h: 'kh',
  j: 'ch nhẹ',
  q: 'ch bật hơi',
  x: 'x nhẹ',
  zh: 'ch uốn lưỡi',
  ch: 'ch uốn lưỡi, bật hơi',
  sh: 's uốn lưỡi',
  r: 'r uốn lưỡi',
  z: 't-x',
  c: 't-x bật hơi',
  s: 'x',
}

export const vietnameseFinals: Record<string, string> = {
  a: 'a',
  o: 'ô',
  e: 'ơ',
  ê: 'e',
  i: 'i',
  u: 'u',
  ü: 'i tròn môi',
  ai: 'ai',
  ei: 'ây',
  ao: 'ao',
  ou: 'ô-u',
  an: 'an',
  en: 'ân',
  ang: 'ang',
  eng: 'âng',
  ong: 'ung',
  er: 'ơ uốn lưỡi',
  ia: 'i-a',
  ie: 'i-ê',
  iao: 'i-ao',
  ian: 'iên',
  iang: 'i-ang',
  in: 'in',
  ing: 'ing',
  iong: 'i-ung',
  iu: 'i-ô-u',
  ua: 'oa',
  uo: 'u-ô',
  uai: 'oai',
  uan: 'oan',
  uang: 'oang',
  ui: 'u-ây',
  un: 'u-ân',
  ueng: 'u-âng',
  üe: 'i tròn môi → ê',
  üan: 'i tròn môi → en',
  ün: 'i tròn môi → n',
}

function vietnameseToneHint(rhyme: string, tone: MandarinSyllable['tone']): string {
  // Rising and falling are approximate cues. Leave multi-part tongue and lip instructions intact.
  const mark = tone === 2 ? '\u0301' : tone === 4 ? '\u0300' : ''
  if (!mark || !/^\p{L}+$/u.test(rhyme)) return rhyme
  const nucleus = /^(?:i(?=ê)|o(?=a))?[aeêioôơuâ]/u.exec(rhyme)?.[0]
  if (!nucleus) return rhyme
  return (nucleus + mark + rhyme.slice(nucleus.length)).normalize('NFC')
}

export function vietnameseApproximation(item: MandarinSyllable): string {
  const onset = vietnameseInitials[item.initial]
  if (item.final === 'i' && /^(?:[zcs]h?|r)$/u.test(item.initial)) return `${onset} kéo tiếng`
  const final = vietnameseFinals[spokenFinal(item)]
  if (!final) return item.marked
  const rhyme = vietnameseToneHint(final, item.tone)
  if (!onset) return rhyme
  if (onset === 'c/k') return `${/^[eêi]/u.test(final) ? 'k' : 'c'}${rhyme}`
  return onset.includes(' ') ? `${onset} + ${rhyme}` : onset + rhyme
}
