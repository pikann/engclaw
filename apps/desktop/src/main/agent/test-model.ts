import { MockLanguageModelV4 } from 'ai/test'

type LanguageModelV4StreamPart = typeof MockLanguageModelV4.prototype.doStream extends (
  ...a: never[]
) => Promise<infer R>
  ? R extends { stream: ReadableStream<infer P> }
    ? P
    : never
  : never
type LanguageModelV4CallOptions = MockLanguageModelV4['doStreamCalls'][number]

export type Step = LanguageModelV4StreamPart[]

export const text = (...deltas: string[]): Step => [
  { type: 'text-start', id: 't' },
  ...deltas.map((delta): LanguageModelV4StreamPart => ({ type: 'text-delta', id: 't', delta })),
  { type: 'text-end', id: 't' },
]

export const toolCalls = (...calls: { id: string; name: string; input: unknown }[]): Step =>
  calls.map((c) => ({
    type: 'tool-call',
    toolCallId: c.id,
    toolName: c.name,
    input: typeof c.input === 'string' ? c.input : JSON.stringify(c.input),
  }))

const usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
}

/** One entry per model step; the last entry repeats if the loop asks for more. `calls` records each request. */
export function scriptedModel(steps: Step[]): {
  model: MockLanguageModelV4
  calls: LanguageModelV4CallOptions[]
} {
  const calls: LanguageModelV4CallOptions[] = []
  let i = 0
  const model = new MockLanguageModelV4({
    doStream: async (options) => {
      calls.push(options)
      const parts = steps[Math.min(i++, steps.length - 1)]!
      const finish = parts.some((p) => p.type === 'tool-call') ? 'tool-calls' : 'stop'
      return {
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(c) {
            c.enqueue({ type: 'stream-start', warnings: [] })
            for (const p of parts) c.enqueue(p)
            c.enqueue({ type: 'finish', finishReason: { unified: finish, raw: undefined }, usage })
            c.close()
          },
        }),
      }
    },
  })
  return { model, calls }
}
