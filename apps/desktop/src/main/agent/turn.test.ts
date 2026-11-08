import { describe, expect, it, vi } from 'vitest'
import { z } from '@engclaw/ipc-contract'
import { runAgentTurn } from './turn'
import { defineTool } from './tools'
import { scriptedModel, text, toolCalls } from './test-model'

const base = { system: 'sys', messages: [{ role: 'user' as const, content: 'hi' }] }
const signal = () => new AbortController().signal
const call = (input: unknown, id = 'c1', name = 'echo') => toolCalls({ id, name, input })

const echo = (run = vi.fn((a: { word: string }) => Promise.resolve({ got: a.word }))) => ({
  spy: run,
  tools: {
    echo: defineTool({ description: 'echo', schema: z.object({ word: z.string() }), run }),
  },
})

/** Text of every tool result the model was shown in a given request. */
const toolResults = (prompt: { role: string; content: unknown }[]): string[] =>
  prompt
    .filter((m) => m.role === 'tool')
    .flatMap((m) => m.content as { output: { value: unknown } }[])
    .map((p) => String(p.output.value))

describe('runAgentTurn', () => {
  it('returns streamed text and forwards deltas', async () => {
    const { model, calls } = scriptedModel([text('Nice ', 'to meet you.')])
    const deltas: string[] = []
    const out = await runAgentTurn({
      ...base,
      model,
      tools: {},
      signal: signal(),
      onDelta: (t) => deltas.push(t),
    })
    expect(out).toBe('Nice to meet you.')
    expect(deltas).toEqual(['Nice ', 'to meet you.'])
    expect(calls[0]!.prompt[0]).toMatchObject({ role: 'system', content: 'sys' })
  })

  it('runs a valid tool call and feeds the result back', async () => {
    const { spy, tools } = echo()
    const { model, calls } = scriptedModel([call({ word: 'hello' }), text('Done.')])
    const onTool = vi.fn()
    const out = await runAgentTurn({ ...base, model, tools, signal: signal(), onTool })
    expect(out).toBe('Done.')
    expect(spy).toHaveBeenCalledWith({ word: 'hello' }, expect.any(AbortSignal))
    expect(onTool).toHaveBeenCalledWith('echo', true)
    expect(toolResults(calls[1]!.prompt)).toEqual(['{"got":"hello"}'])
  })

  it('only keeps the final step as the reply', async () => {
    const { tools } = echo()
    const { model } = scriptedModel([
      [...text('Let me check. '), ...call({ word: 'x' })],
      text('Here.'),
    ])
    const out = await runAgentTurn({ ...base, model, tools, signal: signal() })
    expect(out).toBe('Here.')
  })

  it('reports invalid arguments to the model without running the tool', async () => {
    const { spy, tools } = echo()
    const { model, calls } = scriptedModel([call({ word: 5 }), call('not json', 'c2'), text('ok')])
    const onTool = vi.fn()
    await runAgentTurn({ ...base, model, tools, signal: signal(), onTool })
    expect(spy).not.toHaveBeenCalled()
    expect(onTool).toHaveBeenCalledWith('echo', false)
    expect(toolResults(calls[2]!.prompt)).toHaveLength(2)
  })

  it('turns a throwing tool into an error result', async () => {
    const { tools } = echo(vi.fn(() => Promise.reject(new Error('db down'))))
    const { model, calls } = scriptedModel([call({ word: 'x' }), text('sorry')])
    const out = await runAgentTurn({ ...base, model, tools, signal: signal() })
    expect(out).toBe('sorry')
    expect(toolResults(calls[1]!.prompt).join()).toContain('db down')
  })

  it('times out a slow tool and tells the model', async () => {
    const { tools } = echo(
      vi.fn(
        (_a: { word: string }, signal?: AbortSignal) =>
          new Promise<never>((_, reject) =>
            signal?.addEventListener('abort', () => reject(new Error('aborted'))),
          ),
      ) as never,
    )
    const { model, calls } = scriptedModel([call({ word: 'x' }), text('ok')])
    await runAgentTurn({ ...base, model, tools, signal: signal(), toolTimeoutMs: 10 })
    expect(toolResults(calls[1]!.prompt).join()).toContain('aborted')
  })

  it('stops after the round limit and withholds tools on the last round', async () => {
    const { tools } = echo()
    const { model, calls } = scriptedModel([call({ word: 'x' })])
    const run = runAgentTurn({ ...base, model, tools, signal: signal(), maxToolRounds: 2 })
    await expect(run).rejects.toMatchObject({ code: 'TOOL_ROUND_LIMIT' })
    expect(calls.map((c) => c.tools?.length ?? 0)).toEqual([1, 1, 0])
  })

  it('rejects with an abort error when cancelled mid-stream', async () => {
    const ctrl = new AbortController()
    const { model } = scriptedModel([text('a', 'b')])
    const run = runAgentTurn({
      ...base,
      model,
      tools: {},
      signal: ctrl.signal,
      onDelta: () => ctrl.abort(),
    })
    await expect(run).rejects.toMatchObject({ name: 'AbortError' })
  })
})
