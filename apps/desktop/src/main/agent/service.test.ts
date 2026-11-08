import Database from 'better-sqlite3'
import { APICallError, type LanguageModel } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { describe, expect, it } from 'vitest'
import type { AgentEvent, SpeechSummary } from '@engclaw/ipc-contract'
import { migrate } from '../store/migrations'
import { AgentStore } from '../store/agent'
import { AgentService } from './service'
import { SYSTEM_PROMPT } from './persona'
import { scriptedModel, text, toolCalls } from './test-model'

const cfg = { baseUrl: 'https://api.example.com/v1', model: 'm', apiKey: 'k', headers: [] }

function setup(model: LanguageModel, config: typeof cfg | null = cfg) {
  const db = new Database(':memory:')
  migrate(db)
  const store = new AgentStore(db)
  const events: AgentEvent[] = []
  let n = 0
  const service = new AgentService({
    store,
    config: () => config,
    fetchFn: () => Promise.reject(new Error('unused')),
    emit: (e) => events.push(e),
    modelFor: () => model,
    newId: () => `id${++n}`,
  })
  return { service, store, events }
}
const replying = (reply: string) => scriptedModel([text(...reply.split(/(?<= )/))])

/** `[role, text]` for every non-tool message the model was sent. */
const sent = (call: { prompt: { role: string; content: unknown }[] }): [string, string][] =>
  call.prompt.map((m) => [
    m.role,
    typeof m.content === 'string'
      ? m.content
      : (m.content as { type: string; text?: string }[]).map((p) => p.text ?? '').join(''),
  ])

describe('AgentService', () => {
  it('streams deltas, then persists the exchange and emits done', async () => {
    const { model, calls } = replying('Sounds fun. What did you eat?')
    const { service, events } = setup(model)
    const res = service.send({ text: 'I went out' })
    expect(res).toEqual({ ok: true, conversationId: 'id1', requestId: 'id2' })
    await service.idle
    expect(events.filter((e) => e.type === 'delta').length).toBeGreaterThan(1)
    expect(events.at(-1)).toEqual({
      type: 'done',
      requestId: 'id2',
      conversationId: 'id1',
      text: 'Sounds fun. What did you eat?',
      cards: [],
    })
    expect(service.messages('id1').map((m) => [m.role, m.text])).toEqual([
      ['user', 'I went out'],
      ['assistant', 'Sounds fun. What did you eat?'],
    ])
    expect(sent(calls[0]!)[0]).toEqual(['system', SYSTEM_PROMPT])
  })

  it('sends earlier turns of the same conversation to the model', async () => {
    const { model, calls } = replying('Okay.')
    const { service } = setup(model)
    service.send({ text: 'one' })
    await service.idle
    service.send({ conversationId: 'id1', text: 'two' })
    await service.idle
    expect(sent(calls[1]!)).toEqual([
      ['system', SYSTEM_PROMPT],
      ['user', 'one'],
      ['assistant', 'Okay.'],
      ['user', 'two'],
    ])
  })

  it('lists conversations newest first, titled by the first thing the learner said', async () => {
    const { service, store } = setup(replying('Nice.').model)
    store.create('empty', 1)
    store.create('a', 2)
    store.append('a', 'user', '  Hello   there, how are you today?  ', 3)
    store.create('b', 4)
    store.append('b', 'user', 'I like mangoes', 5)
    expect(service.conversations()).toEqual([
      { id: 'b', title: 'I like mangoes', updatedAt: 5 },
      { id: 'a', title: 'Hello there, how are you today?', updatedAt: 3 },
    ])
  })

  it('collects show_card calls, persists the cards with the reply, and returns bad ones to the model', async () => {
    const { model, calls } = scriptedModel([
      toolCalls(
        {
          id: 'a',
          name: 'show_card',
          input: { type: 'vocabulary', word: 'market', meaning: 'a place to buy food' },
        },
        {
          id: 'b',
          name: 'show_card',
          input: { type: 'vocabulary', word: '<b>x</b>', meaning: 'bad' },
        },
        { id: 'c', name: 'show_card', input: { type: 'bogus' } },
      ),
      text('A market is a place to shop.'),
    ])
    const { service, events } = setup(model)
    service.send({ text: 'what is a market' })
    await service.idle
    const card = { type: 'vocabulary', word: 'market', meaning: 'a place to buy food' }
    expect(events.at(-1)).toMatchObject({ type: 'done', cards: [card] })
    expect(service.messages('id1').at(-1)).toMatchObject({ role: 'assistant', cards: [card] })
    const results = calls[1]!.prompt
      .filter((m) => m.role === 'tool')
      .flatMap((m) => m.content as { output: { value: unknown } }[])
      .map((p) => String(p.output.value))
    expect(results).toHaveLength(3)
    expect(results[0]).toContain('shown')
    expect(results[1]).toContain('invalid arguments')
    expect(results[2]).toContain('invalid arguments')
  })

  it('refuses without a provider, for unknown conversations, and while busy', async () => {
    expect(setup(replying('x').model, null).service.send({ text: 'hi' })).toEqual({
      ok: false,
      code: 'NO_PROVIDER',
    })
    const { service } = setup(replying('x').model)
    expect(service.send({ conversationId: 'nope', text: 'hi' })).toEqual({
      ok: false,
      code: 'NOT_FOUND',
    })
    service.send({ text: 'a' })
    expect(service.send({ text: 'b' })).toEqual({ ok: false, code: 'BUSY' })
    await service.idle
    expect(service.send({ text: 'c' }).ok).toBe(true)
  })

  it('cancels mid-stream: stops deltas, emits cancelled, keeps no partial reply', async () => {
    const { model } = replying('Hello there friend')
    const { service, events } = setup(model)
    const res = service.send({ text: 'hi' })
    if (!res.ok) throw new Error('send failed')
    service.cancel(res.requestId)
    await service.idle
    expect(events.map((e) => e.type)).toEqual(['cancelled'])
    expect(service.messages(res.conversationId).map((m) => m.role)).toEqual(['user'])
    expect(service.send({ conversationId: res.conversationId, text: 'again' }).ok).toBe(true)
  })

  it('reports provider errors by code', async () => {
    const model = new MockLanguageModelV4({
      doStream: () =>
        Promise.reject(
          new APICallError({
            message: 'slow down',
            url: 'u',
            requestBodyValues: {},
            statusCode: 429,
          }),
        ),
    })
    const { service, events } = setup(model)
    service.send({ text: 'hi' })
    await service.idle
    expect(events).toEqual([{ type: 'error', requestId: 'id2', code: 'RATE_LIMIT' }])
  })

  it('shows the model the latest turn speech analysis and keeps it out of stored history', async () => {
    const { model, calls } = replying('Say market once more. Ready?')
    const { service, store } = setup(model)
    const speech: SpeechSummary = {
      v: 1,
      score: 70,
      wer: 0.1,
      per: 0.2,
      flaggedWords: 1,
      words: [{ word: 'market', expected: 'mɑːkɪt', heard: 'mækɪt', confidence: 0.9 }],
      pace: { wpm: 120, pauses: 1, longestPauseSec: 0.5 },
      intonation: { ending: 'falling', rangeSemitones: 5 },
    }
    service.send({ text: 'I go to the market', speech })
    await service.idle
    expect(sent(calls[0]!).at(-1)![1]).toContain('I go to the market\n\n[speech analysis v1')
    expect(store.messages('id1')[0]!.text).toBe('I go to the market')

    service.send({ conversationId: 'id1', text: 'typed message' })
    await service.idle
    const second = sent(calls[1]!)
    expect(second.find(([r]) => r === 'user')![1]).toBe('I go to the market')
    expect(second.at(-1)![1]).not.toContain('speech analysis')
  })
})
