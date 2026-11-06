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
      { pos: 'n', definition: 'sloping land', example: 'the river bank' },
      { pos: 'n', definition: 'a financial institution' },
      { pos: 'v', definition: 'tip laterally' },
    ])
  })

  it('decodes XML entities', () => {
    expect(entries.map((e) => e.word)).toContain('Tom & Jerry')
  })
})
