import { describe, expect, it, vi } from 'vitest'
import type { FetchLike } from '../llm/provider'
import { openAiChatProvider } from './openai'
import type { StreamChunk } from './types'

const cfg = { baseUrl: 'https://api.example.com/v1', model: 'm', apiKey: 'sk-1', headers: [] }
const sse = (...events: string[]): Response =>
  new Response(events.map((e) => `data: ${e}\n\n`).join(''), { status: 200 })
const chunk = (delta: object): string => JSON.stringify({ choices: [{ delta }] })

async function collect(
  fetchFn: FetchLike,
  signal = new AbortController().signal,
): Promise<StreamChunk[]> {
  const out: StreamChunk[] = []
  for await (const c of openAiChatProvider(cfg, fetchFn).stream({
    messages: [{ role: 'user', content: 'hi' }],
    tools: [],
    signal,
  }))
    out.push(c)
  return out
}

describe('openAiChatProvider', () => {
  it('posts a streaming request with the key and yields text deltas', async () => {
    const fetchFn = vi.fn<FetchLike>(() =>
      Promise.resolve(sse(chunk({ content: 'Hel' }), chunk({ content: 'lo' }), '[DONE]')),
    )
    expect(await collect(fetchFn)).toEqual([
      { type: 'text', text: 'Hel' },
      { type: 'text', text: 'lo' },
    ])
    const [url, init] = fetchFn.mock.calls[0]!
    expect(url).toBe('https://api.example.com/v1/chat/completions')
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer sk-1')
    expect(JSON.parse(init.body as string)).toMatchObject({ model: 'm', stream: true })
  })

  it('assembles tool calls split across chunks', async () => {
    const fetchFn: FetchLike = () =>
      Promise.resolve(
        sse(
          chunk({
            tool_calls: [{ index: 0, id: 'c1', function: { name: 'look', arguments: '{"w":' } }],
          }),
          chunk({ tool_calls: [{ index: 0, function: { arguments: '"hi"}' } }] }),
          '[DONE]',
        ),
      )
    expect(await collect(fetchFn)).toEqual([
      { type: 'toolCalls', calls: [{ id: 'c1', name: 'look', arguments: '{"w":"hi"}' }] },
    ])
  })

  it('keeps Gemini extra_content on tool calls and echoes it back', async () => {
    const extra = { google: { thought_signature: 'sig' } }
    const fetchFn = vi.fn<FetchLike>(() =>
      Promise.resolve(
        sse(
          chunk({
            tool_calls: [
              { id: 'c1', extra_content: extra, function: { name: 'look', arguments: '{}' } },
            ],
          }),
          '[DONE]',
        ),
      ),
    )
    const out = await collect(fetchFn)
    expect(out).toEqual([
      {
        type: 'toolCalls',
        calls: [{ id: 'c1', name: 'look', arguments: '{}', extraContent: extra }],
      },
    ])
    const provider = openAiChatProvider(cfg, fetchFn)
    for await (const _ of provider.stream({
      messages: [
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'c1', name: 'look', arguments: '{}', extraContent: extra }],
        },
      ],
      tools: [],
      signal: new AbortController().signal,
    }))
      void _
    const body = JSON.parse(fetchFn.mock.calls[1]![1].body as string)
    expect(body.messages[0].tool_calls[0].extra_content).toEqual(extra)
  })

  it.each([
    [401, 'AUTH_EXPIRED'],
    [429, 'RATE_LIMIT'],
    [503, 'SERVER'],
    [400, 'BAD_RESPONSE'],
  ])('maps HTTP %i to %s', async (status, code) => {
    const fetchFn: FetchLike = () => Promise.resolve(new Response('secret body', { status }))
    await expect(collect(fetchFn)).rejects.toMatchObject({ code })
  })

  it('maps a failed connection to NETWORK and malformed events to BAD_RESPONSE', async () => {
    await expect(
      collect(() => Promise.reject(new TypeError('fetch failed'))),
    ).rejects.toMatchObject({ code: 'NETWORK' })
    await expect(collect(() => Promise.resolve(sse('{oops')))).rejects.toMatchObject({
      code: 'BAD_RESPONSE',
    })
  })

  it('refuses an insecure base url before any request', async () => {
    const fetchFn = vi.fn<FetchLike>()
    const p = openAiChatProvider({ ...cfg, baseUrl: 'http://example.com/v1' }, fetchFn)
    const it = p.stream({ messages: [], tools: [], signal: new AbortController().signal })
    await expect(it[Symbol.asyncIterator]().next()).rejects.toMatchObject({ code: 'NO_PROVIDER' })
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
