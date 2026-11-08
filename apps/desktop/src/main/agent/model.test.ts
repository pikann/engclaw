import { describe, expect, it, vi } from 'vitest'
import type { FetchLike } from '../llm/provider'
import { createModel } from './model'
import { runAgentTurn } from './turn'
import { defineTool } from './tools'
import { z } from '@engclaw/ipc-contract'
import { AgentError } from './types'

const cfg = { baseUrl: 'https://api.example.com/v1', model: 'm', apiKey: 'sk-1', headers: [] }
const sse = (...events: string[]): Response =>
  new Response(events.map((e) => `data: ${e}\n\n`).join(''), { status: 200 })
const chunk = (delta: object): string => JSON.stringify({ choices: [{ delta }] })
const finish = (reason: string): string =>
  JSON.stringify({ choices: [{ delta: {}, finish_reason: reason }] })

const look = defineTool({
  description: 'look',
  schema: z.object({ w: z.string() }),
  run: async () => ({ ok: true }),
})

/** Runs one turn against the faked network and returns the reply text. */
async function turn(
  fetchFn: FetchLike,
  signal = new AbortController().signal,
  messages: Parameters<typeof runAgentTurn>[0]['messages'] = [{ role: 'user', content: 'hi' }],
): Promise<string> {
  const { model, timedOut } = createModel(cfg, fetchFn)
  return runAgentTurn({ model, timedOut, system: 'sys', messages, tools: { look }, signal })
}

describe('createModel + runAgentTurn', () => {
  it('posts a streaming request with the key and returns the streamed text', async () => {
    const fetchFn = vi.fn<FetchLike>(() =>
      Promise.resolve(
        sse(chunk({ content: 'Hel' }), chunk({ content: 'lo' }), finish('stop'), '[DONE]'),
      ),
    )
    expect(await turn(fetchFn)).toBe('Hello')
    const [url, init] = fetchFn.mock.calls[0]!
    expect(url).toBe('https://api.example.com/v1/chat/completions')
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer sk-1')
    expect(JSON.parse(init.body as string)).toMatchObject({ model: 'm', stream: true })
  })

  it('assembles tool calls split across chunks and sends the result back', async () => {
    const fetchFn = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(
        sse(
          chunk({
            tool_calls: [{ index: 0, id: 'c1', function: { name: 'look', arguments: '{"w":' } }],
          }),
          chunk({ tool_calls: [{ index: 0, function: { arguments: '"hi"}' } }] }),
          finish('tool_calls'),
          '[DONE]',
        ),
      )
      .mockResolvedValueOnce(sse(chunk({ content: 'ok' }), finish('stop'), '[DONE]'))
    expect(await turn(fetchFn)).toBe('ok')
    const body = JSON.parse(fetchFn.mock.calls[1]![1].body as string)
    expect(body.messages.at(-2).tool_calls[0].function).toEqual({
      name: 'look',
      arguments: '{"w":"hi"}',
    })
    expect(body.messages.at(-1)).toMatchObject({ role: 'tool', tool_call_id: 'c1' })
  })

  it('keeps Gemini extra_content on tool calls and echoes it back', async () => {
    const extra = { google: { thought_signature: 'sig' } }
    const fetchFn = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(
        sse(
          chunk({
            tool_calls: [
              {
                id: 'c1',
                extra_content: extra,
                function: { name: 'look', arguments: '{"w":"x"}' },
              },
            ],
          }),
          finish('tool_calls'),
          '[DONE]',
        ),
      )
      .mockResolvedValueOnce(sse(chunk({ content: 'ok' }), finish('stop'), '[DONE]'))
    await turn(fetchFn)
    const body = JSON.parse(fetchFn.mock.calls[1]![1].body as string)
    expect(body.messages.at(-2).tool_calls[0].extra_content).toEqual(extra)
  })

  it.each([
    [401, 'AUTH_EXPIRED'],
    [429, 'RATE_LIMIT'],
    [503, 'SERVER'],
    [400, 'BAD_RESPONSE'],
  ])('maps HTTP %i to %s', async (status, code) => {
    const fetchFn: FetchLike = () => Promise.resolve(new Response('secret body', { status }))
    await expect(turn(fetchFn)).rejects.toMatchObject({ code })
  })

  it('maps a failed connection to NETWORK and malformed events to BAD_RESPONSE', async () => {
    await expect(turn(() => Promise.reject(new TypeError('fetch failed')))).rejects.toMatchObject({
      code: 'NETWORK',
    })
    await expect(turn(() => Promise.resolve(sse('{oops')))).rejects.toMatchObject({
      code: 'BAD_RESPONSE',
    })
  })

  it('keeps the provider error message as detail', async () => {
    const body = JSON.stringify([{ error: { message: 'Quota exceeded' } }])
    await expect(
      turn(() => Promise.resolve(new Response(body, { status: 429 }))),
    ).rejects.toMatchObject({ code: 'RATE_LIMIT', detail: 'Quota exceeded' })
  })

  it('propagates a caller abort instead of mapping it to a network error', async () => {
    const ctrl = new AbortController()
    const fetchFn: FetchLike = (_url, init) =>
      new Promise((_, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        )
        ctrl.abort()
      })
    const err = await turn(fetchFn, ctrl.signal).catch((e: unknown) => e)
    expect(err).not.toBeInstanceOf(AgentError)
  })

  it('refuses an insecure base url before any request', async () => {
    const fetchFn = vi.fn<FetchLike>()
    expect(() => createModel({ ...cfg, baseUrl: 'http://example.com/v1' }, fetchFn)).toThrow(
      expect.objectContaining({ code: 'NO_PROVIDER' }),
    )
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
