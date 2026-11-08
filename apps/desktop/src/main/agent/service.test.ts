import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import type { AgentEvent, SpeechSummary } from '@engclaw/ipc-contract'
import { migrate } from '../store/migrations'
import { AgentStore } from '../store/agent'
import { AgentService } from './service'
import { SYSTEM_PROMPT } from './persona'
import { AgentError, type ChatMessage, type ChatProvider, type StreamChunk } from './types'

const cfg = { baseUrl: 'https://api.example.com/v1', model: 'm', apiKey: 'k', headers: [] }

function setup(provider: ChatProvider, config: typeof cfg | null = cfg) {
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
    providerFor: () => provider,
    newId: () => `id${++n}`,
  })
  return { service, store, events }
}
const replying = (text: string, seen: ChatMessage[][] = []): ChatProvider => ({
  async *stream(req) {
    seen.push(req.messages)
    for (const w of text.split(/(?<= )/)) yield { type: 'text', text: w }
  },
})

describe('AgentService', () => {
  it('streams deltas, then persists the exchange and emits done', async () => {
    const seen: ChatMessage[][] = []
    const { service, events } = setup(replying('Sounds fun. What did you eat?', seen))
    const res = service.send({ text: 'I went out' })
    expect(res).toEqual({ ok: true, conversationId: 'id1', requestId: 'id2' })
    await service.idle
    expect(events.filter((e) => e.type === 'delta').length).toBeGreaterThan(1)
    expect(events.at(-1)).toEqual({
      type: 'done',
      requestId: 'id2',
      conversationId: 'id1',
      text: 'Sounds fun. What did you eat?',
    })
    expect(service.messages('id1').map((m) => [m.role, m.text])).toEqual([
      ['user', 'I went out'],
      ['assistant', 'Sounds fun. What did you eat?'],
    ])
    expect(seen[0]![0]).toEqual({ role: 'system', content: SYSTEM_PROMPT })
  })

  it('sends earlier turns of the same conversation to the model', async () => {
    const seen: ChatMessage[][] = []
    const { service } = setup(replying('Okay.', seen))
    service.send({ text: 'one' })
    await service.idle
    service.send({ conversationId: 'id1', text: 'two' })
    await service.idle
    expect(seen[1]!.map((m) => (m as { content: string }).content)).toEqual([
      SYSTEM_PROMPT,
      'one',
      'Okay.',
      'two',
    ])
  })

  it('lists conversations newest first, titled by the first thing the learner said', async () => {
    const { service, store } = setup(replying('Nice.'))
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

  it('refuses without a provider, for unknown conversations, and while busy', async () => {
    expect(setup(replying('x'), null).service.send({ text: 'hi' })).toEqual({
      ok: false,
      code: 'NO_PROVIDER',
    })
    const { service } = setup(replying('x'))
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
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const provider: ChatProvider = {
      async *stream(req) {
        yield { type: 'text', text: 'Hello ' } as StreamChunk
        await gate
        if (req.signal.aborted) return
        yield { type: 'text', text: 'late' } as StreamChunk
      },
    }
    const { service, events } = setup(provider)
    const res = service.send({ text: 'hi' })
    if (!res.ok) throw new Error('send failed')
    await new Promise((r) => setTimeout(r, 0))
    service.cancel(res.requestId)
    release()
    await service.idle
    expect(events.map((e) => e.type)).toEqual(['delta', 'cancelled'])
    expect(service.messages(res.conversationId).map((m) => m.role)).toEqual(['user'])
    expect(service.send({ conversationId: res.conversationId, text: 'again' }).ok).toBe(true)
  })

  it('reports provider errors by code', async () => {
    const provider: ChatProvider = {
      // eslint-disable-next-line require-yield
      async *stream() {
        throw new AgentError('RATE_LIMIT')
      },
    }
    const { service, events } = setup(provider)
    service.send({ text: 'hi' })
    await service.idle
    expect(events).toEqual([{ type: 'error', requestId: 'id2', code: 'RATE_LIMIT' }])
  })

  it('shows the model the latest turn speech analysis and a scripted reply can use a real flagged word', async () => {
    const seen: ChatMessage[][] = []
    const provider: ChatProvider = {
      async *stream(req) {
        seen.push(req.messages)
        const last = req.messages.at(-1) as { content: string }
        const word = /mispronounced \([^)]*\): (\w+)/.exec(last.content)?.[1]
        yield { type: 'text', text: word ? `Say ${word} once more. Ready?` : 'Nice. What next?' }
      },
    }
    const { service, store } = setup(provider)
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
    const last = seen[0]!.at(-1) as { content: string }
    expect(last.content).toContain('I go to the market\n\n[speech analysis v1')
    expect(store.messages('id1')[0]!.text).toBe('I go to the market')
    expect(service.messages('id1')[1]!.text).toBe('Say market once more. Ready?')

    service.send({ conversationId: 'id1', text: 'typed message' })
    await service.idle
    const prior = seen[1]!.find((m) => m.role === 'user') as { content: string }
    expect(prior.content).toBe('I go to the market')
    expect(JSON.stringify(seen[1]!.at(-1))).not.toContain('speech analysis')
  })
})
