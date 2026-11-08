import Database from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import type { AgentEvent, HistoryAttempt } from '@engclaw/ipc-contract'
import { migrate } from '../store/migrations'
import { AgentStore } from '../store/agent'
import { AgentService } from './service'
import { lookupDictionaryTool, practiceHistoryTool, type DictionarySource } from './info-tools'
import { scriptedModel, text, toolCalls } from './test-model'

const attempt = (over: Partial<HistoryAttempt> = {}): HistoryAttempt => ({
  id: 'a',
  createdAt: Date.UTC(2026, 10, 8),
  mode: 'sentence',
  text: 'I thought it through',
  language: 'en',
  score: 71.6,
  errors: [{ word: 'thorough', expected: 'θɝoʊ', actual: 'tɔrəf', confidence: 0.9 }],
  hasAudio: false,
  ...over,
})

const dictionary: DictionarySource = {
  lookup: (w) =>
    w === 'thorough'
      ? {
          word: 'thorough',
          ipa: ['ˈθɜːrə'],
          senses: Array.from({ length: 9 }, (_, i) => ({
            pos: 'adj',
            definition: `sense ${i}`,
            example: null,
          })),
          morphemes: [],
        }
      : null,
}

function setup(model: ReturnType<typeof scriptedModel>['model'], history: HistoryAttempt[]) {
  const db = new Database(':memory:')
  migrate(db)
  const events: AgentEvent[] = []
  const recent = vi.fn((n: number) => history.slice(0, n))
  const service = new AgentService({
    store: new AgentStore(db),
    config: () => ({ baseUrl: 'https://x.test/v1', model: 'm', apiKey: 'k', headers: [] }),
    fetchFn: () => Promise.reject(new Error('unused')),
    emit: (e) => events.push(e),
    modelFor: () => model,
    tools: {
      lookup_dictionary: lookupDictionaryTool(dictionary),
      get_practice_history: practiceHistoryTool({ recent }),
    },
  })
  return { service, events, recent }
}

const toolOutputs = (prompt: { role: string; content: unknown }[]): string[] =>
  prompt
    .filter((m) => m.role === 'tool')
    .flatMap((m) => m.content as { output: { value: unknown } }[])
    .map((p) => String(p.output.value))

describe('agent info tools', () => {
  it('lets the model read practice history and adapt its next reply', async () => {
    const { model, calls } = scriptedModel([
      toolCalls({ id: 'h', name: 'get_practice_history', input: {} }),
      text('Let us work on "thorough" again. Can you say it?'),
    ])
    const { service, events, recent } = setup(model, [attempt()])
    service.send({ text: 'What should I practice?' })
    await service.idle

    expect(recent).toHaveBeenCalled()
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'tool', name: 'get_practice_history', ok: true }),
    )
    const result = JSON.parse(toolOutputs(calls[1]!.prompt)[0]!)
    expect(result).toMatchObject({
      empty: false,
      averageScore: 72,
      problemWords: [{ word: 'thorough', times: 1, heardAs: ['tɔrəf'] }],
    })
    expect(events.at(-1)).toMatchObject({ type: 'done', text: expect.stringContaining('thorough') })
  })

  it('reports empty history and unknown words as clear not-found results', async () => {
    const { model, calls } = scriptedModel([
      toolCalls(
        { id: 'h', name: 'get_practice_history', input: { limit: 5 } },
        { id: 'd', name: 'lookup_dictionary', input: { word: 'zzzxq' } },
      ),
      text('Ok.'),
    ])
    const { service } = setup(model, [])
    service.send({ text: 'hi' })
    await service.idle
    expect(toolOutputs(calls[1]!.prompt).map((s) => JSON.parse(s))).toEqual([
      { empty: true },
      { found: false, word: 'zzzxq' },
    ])
  })

  it('caps senses and rejects invalid arguments', async () => {
    const { model, calls } = scriptedModel([
      toolCalls(
        { id: 'd', name: 'lookup_dictionary', input: { word: 'thorough' } },
        { id: 'e', name: 'lookup_dictionary', input: { word: '' } },
        { id: 'f', name: 'get_practice_history', input: { limit: 500 } },
      ),
      text('Ok.'),
    ])
    const { service } = setup(model, [])
    service.send({ text: 'hi' })
    await service.idle
    const [found, bad1, bad2] = toolOutputs(calls[1]!.prompt)
    expect(JSON.parse(found!).senses).toHaveLength(4)
    expect(bad1).toContain('invalid arguments')
    expect(bad2).toContain('invalid arguments')
  })

  it('exposes only read-only sources', () => {
    const history = practiceHistoryTool({ recent: () => [] })
    expect(Object.keys(history)).not.toContain('save')
  })
})
