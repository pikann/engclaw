import type { MandarinSyllable } from '../../../shared/mandarin-pronunciation'

export * from '../../../shared/mandarin-pronunciation'

export const initialTips: Record<string, string> = {
  '': 'Vào thẳng vần.',
  b: 'Khép hai môi như khi nói “p”, rồi mở môi với rất ít hơi.',
  p: 'Giống “p”, nhưng bật hơi rõ. Đặt tay trước miệng để cảm nhận.',
  m: 'Gần “m” tiếng Việt. Khép môi, cho hơi qua mũi rồi mở sang vần.',
  f: 'Gần “ph”. Chạm nhẹ môi dưới vào răng trên.',
  d: 'Đầu lưỡi chạm lợi trên như “t”, bật ra với rất ít hơi.',
  t: 'Gần “th” trong “tha”. Đầu lưỡi chạm lợi trên rồi bật hơi rõ.',
  n: 'Gần “n” trong “na”. Đầu lưỡi chạm lợi trên, hơi qua mũi.',
  l: 'Gần “l” trong “la”. Cho hơi thoát qua hai bên lưỡi.',
  g: 'Gần “c/k”, với rất ít hơi.',
  k: 'Bắt đầu như “c/k” rồi bật hơi rõ.',
  h: 'Thử “kh” nhẹ, để hơi cọ ở phía sau miệng.',
  j: 'Thử “ch” nhẹ, đưa mặt lưỡi lên gần vòm cứng, ít hơi.',
  q: 'Đặt lưỡi như j rồi bật hơi rõ.',
  x: 'Thử “x” với mặt lưỡi nâng gần vòm cứng, để hơi thoát liên tục.',
  zh: 'Thử “ch” với đầu lưỡi nhấc và hơi lùi, ít hơi.',
  ch: 'Đặt lưỡi như zh rồi bật hơi rõ.',
  sh: 'Đầu lưỡi nhấc và hơi lùi như zh, để hơi thoát liên tục.',
  r: 'Nhấc đầu lưỡi như sh, thêm rung dây thanh trong khi để hơi thoát.',
  z: 'Đầu lưỡi gần lợi trên, thử lướt từ “t” sang “x”, ít hơi.',
  c: 'Đặt lưỡi như z rồi bật hơi rõ.',
  s: 'Gần “x” trong “xa”. Đầu lưỡi gần răng trên, hơi thoát liên tục.',
  y: 'Chữ y giúp viết âm đầu vần. Lướt từ i, hoặc từ ü tròn môi trong yu.',
  w: 'Chữ w giúp viết âm đầu vần. Lướt nhanh từ u tròn môi sang nguyên âm sau.',
}

export const finalTips: Record<string, string> = {
  a: 'Mở miệng như “a”.',
  o: 'Tròn môi như “ô”.',
  e: 'Giữ môi thả lỏng, kéo lưỡi về sau. Thử từ “ơ” rồi nghe mẫu.',
  ê: 'Gần “e” tiếng Việt.',
  i: 'Kéo nhẹ hai khóe môi như “i”.',
  u: 'Tròn môi như “u”.',
  ü: 'Đặt lưỡi như khi nói “i”, đồng thời tròn môi như “u”.',
  ai: 'Lướt liền từ a sang i, gần “ai”.',
  ei: 'Lướt từ ê sang i trong một nhịp.',
  ao: 'Lướt từ a sang u, gần “ao”.',
  ou: 'Lướt từ ô sang u trong một nhịp.',
  an: 'Khép bằng n ở lợi trên, gần “an”.',
  en: 'Thử “ân” nhẹ rồi khép bằng n.',
  ang: 'Gần “ang”, kết thúc bằng ng ở phía sau miệng.',
  eng: 'Thử “âng” nhẹ rồi khép bằng ng.',
  ong: 'Tròn môi rồi khép bằng ng, gần “ung”.',
  er: 'Thử “ơ” rồi nhấc nhẹ đầu lưỡi về sau trong cùng một nhịp.',
  ia: 'Lướt nhanh từ i sang a trong một nhịp.',
  ie: 'Lướt từ i sang ê trong một nhịp.',
  iao: 'Lướt nhanh qua i → a → u trong một nhịp. Mở miệng ở a rồi thu môi ở cuối.',
  ian: 'Lướt nhanh qua i → e → n, gần “iên”, nhưng phần e mở hơn.',
  iang: 'Lướt từ i sang ang rồi khép bằng ng.',
  in: 'Giữ i rồi khép bằng n ở lợi trên.',
  ing: 'Giữ i rồi khép bằng ng ở phía sau miệng.',
  iong: 'Lướt từ i sang phần tròn môi gần “ung”.',
  iu: 'Viết gọn của iou. Lướt i → ô → u trong một nhịp.',
  ua: 'Lướt từ u sang a, gần “oa”.',
  uo: 'Lướt từ u sang ô trong một nhịp.',
  uai: 'Lướt u → a → i, gần “oai”.',
  uan: 'Lướt u → a → n, gần “oan”.',
  uang: 'Lướt u → a → ng, gần “oang”.',
  ui: 'Viết gọn của uei. Lướt u → ê → i.',
  ueng: 'Lướt u → ơ → ng trong một nhịp, khép ng ở phía sau miệng.',
  un: 'Viết gọn của uen. Lướt từ u rồi khép bằng n.',
  üe: 'Bắt đầu bằng ü tròn môi rồi lướt sang ê.',
  üan: 'Bắt đầu bằng ü tròn môi, lướt sang e rồi khép bằng n.',
  ün: 'Giữ ü tròn môi rồi khép bằng n.',
}

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

export function finalTip(item: MandarinSyllable): string {
  if (item.final === 'i' && /^(?:[zcs]h?|r)$/u.test(item.initial))
    return 'Giữ lưỡi gần vị trí của phụ âm đầu và kéo tiếng ra. Nghe mẫu để phân biệt với i tiếng Việt.'
  return finalTips[spokenFinal(item)] ?? 'Nghe mẫu và bắt chước trong một nhịp.'
}

export const toneTips = [
  ['?', 'Chưa ghi thanh nên mẫu đọc dùng thanh nhẹ. Thêm dấu hoặc số 1–5 để luyện đúng cao độ.'],
  ['→', 'Thanh 1. Giữ giọng cao và ngang.'],
  ['↗', 'Thanh 2. Nâng từ giữa lên cao, hơi giống chiều đi lên của dấu sắc.'],
  ['↘↗', 'Thanh 3. Hạ xuống thấp, có thể nhấc lên khi đọc riêng. Trong cụm thường giữ thấp.'],
  ['↘', 'Thanh 4. Bắt đầu cao rồi hạ nhanh và dứt khoát.'],
  ['·', 'Thanh nhẹ. Đọc ngắn, nhẹ và theo nhịp của âm trước.'],
] as const

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
