import { describe, expect, it } from 'vitest'
import { median, wordCount } from './reply-length'
import { EVAL_USER_TURNS, PERSONA_VERSION, SYSTEM_PROMPT } from './persona'
import { runAgentTurn } from './loop'
import { openAiChatProvider } from './openai'
import type { ChatMessage } from './types'

describe('reply length helpers', () => {
  it('counts words and takes the median', () => {
    expect(wordCount('  Nice to  meet you. ')).toBe(4)
    expect(median([3, 1, 2])).toBe(2)
    expect(median([1, 2, 3, 10])).toBe(2.5)
    expect(median([])).toBe(0)
  })
})

describe('persona', () => {
  it('is versioned and states the short-reply contract', () => {
    expect(PERSONA_VERSION).toBeGreaterThanOrEqual(1)
    expect(SYSTEM_PROMPT).toMatch(/Keep replies short: 1-2 sentences/)
    expect(SYSTEM_PROMPT).toMatch(/follow-up question/)
    expect(EVAL_USER_TURNS.length).toBeGreaterThanOrEqual(8)
  })
})

// Live eval: ENGCLAW_EVAL_BASE_URL=https://api.openai.com/v1 ENGCLAW_EVAL_MODEL=gpt-4o-mini ENGCLAW_EVAL_KEY=sk-... bun run test reply-length
const live = process.env['ENGCLAW_EVAL_BASE_URL'] && process.env['ENGCLAW_EVAL_MODEL']
describe.skipIf(!live)(`scripted conversation eval (persona v${PERSONA_VERSION})`, () => {
  it('keeps the median reply under 30 words', { timeout: 120_000 }, async () => {
    const provider = openAiChatProvider(
      {
        baseUrl: process.env['ENGCLAW_EVAL_BASE_URL']!,
        model: process.env['ENGCLAW_EVAL_MODEL']!,
        apiKey: process.env['ENGCLAW_EVAL_KEY'] ?? '',
        headers: [],
      },
      (url, init) => fetch(url, init),
    )
    const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }]
    const counts: number[] = []
    for (const turn of EVAL_USER_TURNS) {
      messages.push({ role: 'user', content: turn })
      const reply = await runAgentTurn({
        provider,
        messages,
        tools: [],
        signal: new AbortController().signal,
      })
      messages.push({ role: 'assistant', content: reply })
      counts.push(wordCount(reply))
    }
    console.info('reply word counts', counts)
    expect(median(counts)).toBeLessThan(30)
  })
})
