import { describe, expect, it, vi } from 'vitest'
import { z } from '@engclaw/ipc-contract'
import { runAgentTurn } from './loop'
import { defineTool } from './tools'
import { AgentError, type ChatMessage, type ChatProvider, type StreamChunk } from './types'

/** Each entry is one model round. */
function scripted(
  rounds: StreamChunk[][],
): ChatProvider & { seen: ChatMessage[][]; toolCounts: number[] } {
  const seen: ChatMessage[][] = []
  const toolCounts: number[] = []
  let i = 0
  return {
    seen,
    toolCounts,
    async *stream(req) {
      seen.push([...req.messages])
      toolCounts.push(req.tools.length)
      for (const c of rounds[Math.min(i++, rounds.length - 1)]!) yield c
    },
  }
}
const call = (args: string, id = 'c1'): StreamChunk => ({
  type: 'toolCalls',
  calls: [{ id, name: 'echo', arguments: args }],
})
const base = { messages: [{ role: 'user', content: 'hi' }] satisfies ChatMessage[] }
const signal = () => new AbortController().signal

const echo = (run = vi.fn((a: { word: string }) => Promise.resolve({ got: a.word }))) =>
  Object.assign(
    defineTool({ name: 'echo', description: 'echo', schema: z.object({ word: z.string() }), run }),
    { spy: run },
  )

describe('runAgentTurn', () => {
  it('returns streamed text and forwards deltas', async () => {
    const provider = scripted([
      [
        { type: 'text', text: 'Nice ' },
        { type: 'text', text: 'to meet you.' },
      ],
    ])
    const deltas: string[] = []
    const out = await runAgentTurn({
      ...base,
      provider,
      tools: [],
      signal: signal(),
      onDelta: (t) => deltas.push(t),
    })
    expect(out).toBe('Nice to meet you.')
    expect(deltas).toEqual(['Nice ', 'to meet you.'])
  })

  it('runs a valid tool call and feeds the result back', async () => {
    const tool = echo()
    const provider = scripted([[call('{"word":"hello"}')], [{ type: 'text', text: 'Done.' }]])
    const onTool = vi.fn()
    const out = await runAgentTurn({ ...base, provider, tools: [tool], signal: signal(), onTool })
    expect(out).toBe('Done.')
    expect(tool.spy).toHaveBeenCalledWith({ word: 'hello' }, expect.any(AbortSignal))
    expect(onTool).toHaveBeenCalledWith('echo', true)
    expect(provider.seen[1]!.at(-1)).toEqual({
      role: 'tool',
      toolCallId: 'c1',
      content: '{"got":"hello"}',
    })
  })

  it('reports invalid arguments to the model without running the tool', async () => {
    const tool = echo()
    const provider = scripted([
      [call('{"word":5}')],
      [call('not json', 'c2')],
      [{ type: 'text', text: 'ok' }],
    ])
    const onTool = vi.fn()
    await runAgentTurn({ ...base, provider, tools: [tool], signal: signal(), onTool })
    expect(tool.spy).not.toHaveBeenCalled()
    expect(onTool).toHaveBeenCalledTimes(2)
    expect(onTool).toHaveBeenCalledWith('echo', false)
    const results = provider.seen[2]!.filter((m) => m.role === 'tool').map(
      (m) => (m as { content: string }).content,
    )
    expect(results[0]).toContain('invalid arguments')
    expect(results[1]).toContain('not valid JSON')
  })

  it('turns an unknown tool and a throwing tool into error results', async () => {
    const boom = echo(vi.fn(() => Promise.reject(new Error('db down'))))
    const provider = scripted([
      [{ type: 'toolCalls', calls: [{ id: 'a', name: 'nope', arguments: '{}' }] }],
      [call('{"word":"x"}', 'b')],
      [{ type: 'text', text: 'sorry' }],
    ])
    const out = await runAgentTurn({ ...base, provider, tools: [boom], signal: signal() })
    expect(out).toBe('sorry')
    const last = provider.seen[2]!.filter((m) => m.role === 'tool').map(
      (m) => (m as { content: string }).content,
    )
    expect(last[0]).toContain('unknown tool')
    expect(last[1]).toContain('db down')
  })

  it('times out a slow tool and tells the model', async () => {
    const slow = echo(vi.fn(() => new Promise<never>(() => {})))
    const provider = scripted([[call('{"word":"x"}')], [{ type: 'text', text: 'ok' }]])
    await runAgentTurn({ ...base, provider, tools: [slow], signal: signal(), toolTimeoutMs: 10 })
    expect((provider.seen[1]!.at(-1) as { content: string }).content).toContain('timed out')
  })

  it('stops after the round limit and withholds tools on the last round', async () => {
    const provider = scripted([[call('{"word":"x"}')]])
    const run = runAgentTurn({
      ...base,
      provider,
      tools: [echo()],
      signal: signal(),
      maxToolRounds: 2,
    })
    await expect(run).rejects.toMatchObject({ code: 'TOOL_ROUND_LIMIT' })
    expect(provider.toolCounts).toEqual([1, 1, 0])
  })

  it('rejects with an abort error when cancelled mid-stream', async () => {
    const ctrl = new AbortController()
    const provider: ChatProvider = {
      async *stream() {
        yield { type: 'text', text: 'a' }
        ctrl.abort()
        yield { type: 'text', text: 'b' }
      },
    }
    const run = runAgentTurn({ ...base, provider, tools: [], signal: ctrl.signal })
    await expect(run).rejects.not.toBeInstanceOf(AgentError)
    await expect(run).rejects.toMatchObject({ name: 'AbortError' })
  })
})
