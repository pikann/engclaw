import { isStepCount, streamText, type LanguageModel, type ModelMessage, type ToolSet } from 'ai'
import { toAgentError } from './model'
import { AgentError } from './types'

export interface TurnOptions {
  model: LanguageModel
  /** Whether the model's connect timeout fired; lets a failure map to TIMEOUT instead of NETWORK. */
  timedOut?: () => boolean
  system: string
  messages: ModelMessage[]
  tools: ToolSet
  signal: AbortSignal
  /** Steps in which the model may call tools; one more step is always allowed for the final answer. */
  maxToolRounds?: number
  toolTimeoutMs?: number
  onDelta?: (text: string) => void
  onTool?: (name: string, ok: boolean) => void
}

/** Streams the model through the SDK's tool loop and returns the final reply text. */
export async function runAgentTurn(opts: TurnOptions): Promise<string> {
  const { signal } = opts
  const maxToolRounds = opts.maxToolRounds ?? 3
  const hasTools = Object.keys(opts.tools).length > 0

  const result = streamText({
    model: opts.model,
    instructions: opts.system,
    messages: opts.messages,
    ...(hasTools && { tools: opts.tools }),
    stopWhen: isStepCount(maxToolRounds + 1),
    prepareStep: ({ stepNumber }) => (stepNumber >= maxToolRounds ? { activeTools: [] } : {}),
    timeout: { toolMs: opts.toolTimeoutMs ?? 5000 },
    abortSignal: signal,
    maxRetries: 0,
  })

  // Only the final step's text is the reply; earlier steps may speak before calling tools.
  let text = ''
  try {
    for await (const part of result.fullStream) {
      if (signal.aborted) throw new DOMException('aborted', 'AbortError')
      if (part.type === 'start-step') text = ''
      else if (part.type === 'text-delta') {
        text += part.text
        if (part.text !== '') opts.onDelta?.(part.text)
      } else if (part.type === 'tool-result') opts.onTool?.(part.toolName, true)
      else if (part.type === 'tool-error') opts.onTool?.(part.toolName, false)
      else if (part.type === 'error') throw part.error
    }
    if (signal.aborted) throw new DOMException('aborted', 'AbortError')
    if ((await result.finishReason) === 'tool-calls') throw new AgentError('TOOL_ROUND_LIMIT')
  } catch (e) {
    if (signal.aborted) throw e
    throw toAgentError(e, opts.timedOut?.() ?? false)
  }
  return text
}
