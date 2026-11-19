import { describe, expect, it } from 'vitest'
import { arpabetToIpa, parseCmudict, parseWordnet } from './dictionary-sources'

describe('arpabetToIpa', () => {
  it('maps vowels, consonants and a stressed syllable onset', () => {
    expect(arpabetToIpa('B AH0 N AE1 N AH0'.split(' '))).toBe('bəˈnænə')
    expect(arpabetToIpa('W AO1 T ER0'.split(' '))).toBe('ˈwɔtɚ')
  })

  it('keeps consonant clusters together in the stressed onset', () => {
    expect(arpabetToIpa('IH0 N S T R AH1 K T'.split(' '))).toBe('ɪnˈstɹʌkt')
  })

  it('marks secondary stress and uses ʌ for stressed AH', () => {
    expect(arpabetToIpa('AE2 K S AH1 N T'.split(' '))).toBe('ˌækˈsʌnt')
  })
})

describe('parseCmudict', () => {
  it('collects alternative pronunciations and skips comments', () => {
    const map = parseCmudict(
      ['# comment', 'read R EH1 D', 'read(2) R IY1 D', 'cat K AE1 T', ''].join('\n'),
    )
    expect(map.get('read')).toEqual(['ˈɹɛd', 'ˈɹid'])
    expect(map.get('cat')).toEqual(['ˈkæt'])
  })

  it('strips trailing inline comments', () => {
    expect(parseCmudict('dog D AO1 G # canine\n').get('dog')).toEqual(['ˈdɔɡ'])
  })
})

const WORDNET_XML = `<?xml version="1.0"?>
<LexicalResource>
  <Lexicon id="oewn" version="2024">
    <LexicalEntry id="oewn-bank-n">
      <Lemma writtenForm="bank" partOfSpeech="n"/>
      <Sense id="s1" synset="oewn-1-n"/>
      <Sense id="s2" synset="oewn-2-n">
        <SenseRelation relType="other" target="x"/>
      </Sense>
    </LexicalEntry>
    <LexicalEntry id="oewn-bank-v">
      <Lemma writtenForm="bank" partOfSpeech="v"/>
      <Sense id="s3" synset="oewn-3-v"/>
    </LexicalEntry>
    <LexicalEntry id="oewn-it-s-n">
      <Lemma writtenForm="Tom &amp; Jerry" partOfSpeech="n"/>
      <Sense id="s4" synset="oewn-4-n"/>
    </LexicalEntry>
    <Synset id="oewn-1-n" partOfSpeech="n"><Definition>sloping land</Definition><Example>the river bank</Example><Example>second</Example></Synset>
    <Synset id="oewn-2-n" partOfSpeech="n"><Definition>a financial institution</Definition></Synset>
    <Synset id="oewn-3-v" partOfSpeech="v"><Definition>tip laterally</Definition></Synset>
    <Synset id="oewn-4-n" partOfSpeech="n"><Definition>cartoon duo</Definition></Synset>
  </Lexicon>
</LexicalResource>`

describe('parseWordnet', () => {
  const { version, entries } = parseWordnet(WORDNET_XML)

  it('reads the lexicon version', () => {
    expect(version).toBe('2024')
  })

  it('groups senses per word in source order with the first example only', () => {
    const bank = entries.find((e) => e.word === 'bank')!
    expect(bank.senses).toEqual([
      { synset: 'oewn-1-n', pos: 'n', definition: 'sloping land', example: 'the river bank' },
      { synset: 'oewn-2-n', pos: 'n', definition: 'a financial institution' },
      { synset: 'oewn-3-v', pos: 'v', definition: 'tip laterally' },
    ])
  })

  it('decodes XML entities', () => {
    expect(entries.map((e) => e.word)).toContain('Tom & Jerry')
  })
})

const RELATIONS_XML = `<?xml version="1.0"?>
<LexicalResource>
  <Lexicon id="oewn" version="2024">
    <LexicalEntry id="oewn-happy-a">
      <Lemma writtenForm="happy" partOfSpeech="a"/>
      <Sense id="happy-1" synset="syn-happy-a">
        <SenseRelation relType="antonym" target="unhappy-1"/>
        <SenseRelation relType="derivation" target="happiness-1"/>
      </Sense>
      <Sense id="happy-2" synset="syn-fortunate-s"/>
    </LexicalEntry>
    <LexicalEntry id="oewn-glad-a">
      <Lemma writtenForm="glad" partOfSpeech="a"/>
      <Sense id="glad-1" synset="syn-happy-a"/>
    </LexicalEntry>
    <LexicalEntry id="oewn-felicitous-a">
      <Lemma writtenForm="felicitous" partOfSpeech="a"/>
      <Sense id="felicitous-1" synset="syn-fortunate-s"/>
    </LexicalEntry>
    <LexicalEntry id="oewn-unhappy-a">
      <Lemma writtenForm="unhappy" partOfSpeech="a"/>
      <Sense id="unhappy-1" synset="syn-unhappy-a">
        <SenseRelation relType="antonym" target="happy-1"/>
      </Sense>
    </LexicalEntry>
    <LexicalEntry id="oewn-well-off-a">
      <Lemma writtenForm="well &amp; off" partOfSpeech="a"/>
      <Sense id="wo-1" synset="syn-happy-a"/>
      <Sense id="wo-2" synset="syn-happy-a"/>
    </LexicalEntry>
    <Synset id="syn-happy-a" partOfSpeech="a"><Definition>joyful</Definition></Synset>
    <Synset id="syn-fortunate-s" partOfSpeech="s"><Definition>lucky</Definition><SynsetRelation relType="similar" target="syn-happy-a"/></Synset>
    <Synset id="syn-unhappy-a" partOfSpeech="a"><Definition>sad</Definition></Synset>
  </Lexicon>
</LexicalResource>`

describe('parseWordnet relations', () => {
  const { entries } = parseWordnet(RELATIONS_XML)
  const senses = (word: string) => entries.find((e) => e.word === word)!.senses

  it('lists the other lemmas of the synset as synonyms, never the word itself', () => {
    expect(senses('happy')[0]!.synonyms).toEqual(['glad', 'well & off'])
    expect(senses('glad')[0]!.synonyms).toEqual(['happy', 'well & off'])
  })

  it('keeps synonyms per sense', () => {
    expect(senses('happy')[1]!.synonyms).toEqual(['felicitous'])
  })

  it('omits relation keys when a sense has none', () => {
    expect(senses('unhappy')[0]!.synonyms).toBeUndefined()
    expect(senses('glad')[0]!.antonyms).toBeUndefined()
  })

  it('reads direct antonyms from sense relations only', () => {
    expect(senses('happy')[0]!.antonyms).toEqual([{ word: 'unhappy', synset: 'syn-unhappy-a' }])
    expect(senses('unhappy')[0]!.antonyms).toEqual([{ word: 'happy', synset: 'syn-happy-a' }])
  })

  it('gives satellite senses the head antonym, marked indirect', () => {
    expect(senses('happy')[1]!.antonyms).toEqual([{ word: 'unhappy', synset: 'syn-unhappy-a', indirect: true }])
    expect(senses('felicitous')[0]!.antonyms).toEqual([{ word: 'unhappy', synset: 'syn-unhappy-a', indirect: true }])
  })

  it('keeps multi-word lemmas, decoded, once per synset', () => {
    expect(senses('well & off')[0]!.synonyms).toEqual(['happy', 'glad'])
  })

  it('keeps the synset id on each sense', () => {
    expect(senses('happy').map((s) => s.synset)).toEqual(['syn-happy-a', 'syn-fortunate-s'])
  })
})
