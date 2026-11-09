import { describe, expect, it } from 'vitest'
import {
  buildAskMessage,
  buildChapterAskMessage,
  visibleUserText,
  sentenceAround,
  summarizeAttempt,
  type ChapterAttemptSummary,
} from '@/lib/ask-agent'

describe('buildAskMessage', () => {
  it('asks the quick question about the word', () => {
    expect(buildAskMessage('explain', 'inspect')).toBe('Explain "inspect" simply.')
  })

  it('includes the context sentence when known', () => {
    const m = buildAskMessage('mistakes', 'inspect', 'She  inspected\nthe engine.')
    expect(m).toContain('common mistakes with "inspect"')
    expect(m).toContain('"She inspected the engine."')
  })

  it('ignores blank context', () => {
    expect(buildAskMessage('pronounce', 'inspect', '  ')).toBe('How do I pronounce "inspect"?')
  })
})

describe('sentenceAround', () => {
  const text = 'Hello there. She inspected the engine! Then left.'
  it('returns the sentence holding the offset', () => {
    expect(sentenceAround(text, text.indexOf('inspected'))).toBe('She inspected the engine!')
    expect(sentenceAround(text, 0)).toBe('Hello there.')
    expect(sentenceAround(text, text.indexOf('left'))).toBe('Then left.')
  })
})

describe('buildChapterAskMessage', () => {
  const base = {
    text: 'break the ice',
    type: 'idiom' as const,
    ipa: 'breɪk ðə aɪs',
    meaning: 'start a conversation',
    examples: ['He told a joke to break the ice.'],
    attempts: [] as ChapterAttemptSummary[],
  }

  it('asks about the whole idiom, not word by word', () => {
    const m = buildChapterAskMessage('meaning', base)
    expect(m).toContain('"break the ice"')
    expect(m).toContain('idiom')
    expect(m).toContain('whole expression')
  })

  it('seeds the target, IPA, meaning and examples', () => {
    const m = buildChapterAskMessage('usage', base)
    expect(m).toContain('/breɪk ðə aɪs/')
    expect(m).toContain('start a conversation')
    expect(m).toContain('He told a joke to break the ice.')
    expect(m).toContain('Answer briefly')
  })

  it('says there are no attempts yet', () => {
    expect(buildChapterAskMessage('pronounce', base)).toContain('no attempts yet')
  })

  it('lists only the latest attempts with flagged words and sounds', () => {
    const attempts = [1, 2, 3, 4].map((n) => ({
      score: 40 + n,
      correct: false,
      flaggedWords: n === 4 ? ['ice'] : [],
      sounds: n === 4 ? ['/aɪ/ heard as /ɪ/'] : [],
    }))
    const m = buildChapterAskMessage('mistakes', { ...base, attempts })
    expect(m).not.toContain('score 41')
    expect(m).toContain('score 44')
    expect(m).toContain('flagged: ice')
    expect(m).toContain('/aɪ/ heard as /ɪ/')
  })

  it('sends a free-text question as is, with the context', () => {
    const m = buildChapterAskMessage('free', base, '  Is it rude? ')
    expect(m.startsWith('Is it rude?')).toBe(true)
    expect(m).toContain('/breɪk ðə aɪs/')
  })
})

describe('summarizeAttempt', () => {
  it('lists flagged words and mismatched sounds only', () => {
    const s = summarizeAttempt(
      { score: 61.4, correct: false },
      {
        differences: {
          errors: [
            {
              word: 'ice',
              phones: [
                { expected: 'aɪ', heard: 'ɪ', confidence: 0.2 },
                { expected: 's', heard: 's', confidence: 0.9 },
              ],
            },
          ],
        },
      },
    )
    expect(s).toEqual({
      score: 61,
      correct: false,
      flaggedWords: ['ice'],
      sounds: ['/aɪ/ heard as /ɪ/'],
    })
  })
})

describe('visibleUserText', () => {
  it('hides the chapter context from the chat bubble', () => {
    const msg = buildChapterAskMessage('meaning', {
      text: 'the',
      type: 'word',
      ipa: 'ðə',
      meaning: 'article',
      examples: [],
      attempts: [],
    })
    expect(visibleUserText(msg)).toBe('Explain "the" simply.')
  })
  it('leaves ordinary messages alone', () => {
    expect(visibleUserText('hello there')).toBe('hello there')
  })
})
