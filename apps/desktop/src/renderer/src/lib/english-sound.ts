const consonants = [
  ['p', 'pen'],
  ['b', 'bed'],
  ['t', 'ten'],
  ['d', 'dog'],
  ['k', 'cat'],
  ['ɡ', 'go'],
  ['m', 'map'],
  ['n', 'net'],
  ['ŋ', 'sing'],
  ['f', 'fan'],
  ['v', 'van'],
  ['θ', 'think'],
  ['ð', 'this'],
  ['s', 'see'],
  ['z', 'zoo'],
  ['ʃ', 'ship'],
  ['ʒ', 'measure'],
  ['h', 'hat'],
  ['tʃ', 'chair'],
  ['dʒ', 'judge'],
  ['l', 'leaf'],
  ['ɹ', 'red'],
  ['j', 'yes'],
  ['w', 'wet'],
] as const

const vowels = [
  ['i', 'see'],
  ['ɪ', 'sit'],
  ['ɛ', 'bed'],
  ['æ', 'cat'],
  ['ɑ', 'father'],
  ['ɒ', 'hot'],
  ['ɔ', 'law'],
  ['ʊ', 'book'],
  ['u', 'food'],
  ['ʌ', 'cup'],
  ['ə', 'about'],
  ['ɜ', 'bird'],
  ['ɝ', 'bird'],
  ['ɚ', 'teacher'],
] as const

const diphthongs = [
  ['eɪ', 'day'],
  ['aɪ', 'my'],
  ['ɔɪ', 'boy'],
  ['oʊ', 'go'],
  ['əʊ', 'go'],
  ['aʊ', 'now'],
  ['ɪə', 'near'],
  ['eə', 'hair'],
  ['ʊə', 'tour'],
] as const

export interface EnglishSound {
  ipa: string
  example: string
}

export const englishSoundGroups = [
  { key: 'consonants', sounds: consonants },
  { key: 'vowels', sounds: vowels },
  { key: 'diphthongs', sounds: diphthongs },
].map(({ key, sounds }) => ({ key, sounds: sounds.map(([ipa, example]) => ({ ipa, example })) }))

export function englishSound(text: string): EnglishSound | null {
  const input = text.trim().toLowerCase()
  return ['d3', 'dʒ', '/dʒ/', 'd͡ʒ', '/d͡ʒ/'].includes(input) ? { ipa: 'dʒ', example: 'judge' } : null
}
