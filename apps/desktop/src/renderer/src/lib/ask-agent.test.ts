import { describe, expect, it } from 'vitest'
import { buildAskMessage, sentenceAround } from '@/lib/ask-agent'

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
