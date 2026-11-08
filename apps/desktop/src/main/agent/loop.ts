import { z } from '@engclaw/ipc-contract'
import type { AgentTool } from './tools'
import { toolSpecs } from './tools'
import { AgentError, type ChatMessage, type ChatProvider, type ToolCall } from './types'

export interface LoopOptions {
  provider: ChatProvider
  messages: ChatMessage[]
  tools: readonly AgentTool[]
  signal: AbortSignal
  /** Rounds in which the model may call tools; one more round is always allowed for the final answer. */
  maxToolRounds?: number
  toolTimeoutMs?: number
  onDelta?: (text: string) => void
  onTool?: (name: string, ok: boolean) => void
}

const MAX_TOOL_RESULT_CHARS = 8000

const asContent = (value: unknown): string => {
  const text = typeof value === 'string' ? value : (JSON.stringify(value) ?? 'null')
  return text.length > MAX_TOOL_RESULT_CHARS ? `${text.slice(0, MAX_TOOL_RESULT_CHARS)}…` : text
}

async function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  ms: number,
  parent: AbortSignal,
): Promise<T> {
  const ctrl = new AbortController()
  const abort = (): void => ctrl.abort()
  parent.addEventListener('abort', abort, { once: true })
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort()
      reject(new Error('tool timed out'))
    }, ms)
  })
  try {
    return await Promise.race([run(ctrl.signal), timeout])
  } finally {
    clearTimeout(timer)
    parent.removeEventListener('abort', abort)
  }
}

/** Runs one call; every failure becomes a result the model can read, never a thrown error. */
async function execute(
  call: ToolCall,
  tools: readonly AgentTool[],
  timeoutMs: number,
  signal: AbortSignal,
): Promise<{ ok: boolean; content: string }> {
  const tool = tools.find((t) => t.name === call.name)
  if (!tool) return { ok: false, content: asContent({ error: `unknown tool "${call.name}"` }) }
  let raw: unknown
  try {
    raw = call.arguments.trim() === '' ? {} : JSON.parse(call.arguments)
  } catch {
    return { ok: false, content: asContent({ error: 'arguments are not valid JSON' }) }
  }
  const parsed = tool.schema.safeParse(raw)
  if (!parsed.success)
    return {
      ok: false,
      content: asContent({ error: `invalid arguments: ${z.prettifyError(parsed.error)}` }),
    }
  try {
    const result = await withTimeout((s) => tool.run(parsed.data, s), timeoutMs, signal)
    return { ok: true, content: asContent(result) }
  } catch (e) {
    if (signal.aborted) throw e
    return {
      ok: false,
      content: asContent({ error: e instanceof Error ? e.message : 'tool failed' }),
    }
  }
}

/** Streams the model, runs requested tools, feeds results back, and returns the final reply text. */
export async function runAgentTurn(opts: LoopOptions): Promise<string> {
  const { provider, tools, signal } = opts
  const maxToolRounds = opts.maxToolRounds ?? 3
  const timeoutMs = opts.toolTimeoutMs ?? 5000
  const messages = [...opts.messages]
  const specs = toolSpecs(tools)

  for (let round = 0; round <= maxToolRounds; round++) {
    let text = ''
    let calls: ToolCall[] = []
    for await (const chunk of provider.stream({
      messages,
      tools: round < maxToolRounds ? specs : [],
      signal,
    })) {
      if (signal.aborted) throw new DOMException('aborted', 'AbortError')
      if (chunk.type === 'text') {
        text += chunk.text
        opts.onDelta?.(chunk.text)
      } else calls = chunk.calls
    }
    if (signal.aborted) throw new DOMException('aborted', 'AbortError')
    if (calls.length === 0) return text
    if (round === maxToolRounds) throw new AgentError('TOOL_ROUND_LIMIT')

    messages.push({ role: 'assistant', content: text, toolCalls: calls })
    for (const call of calls) {
      const res = await execute(call, tools, timeoutMs, signal)
      opts.onTool?.(call.name, res.ok)
      messages.push({ role: 'tool', toolCallId: call.id, content: res.content })
    }
  }
  throw new AgentError('TOOL_ROUND_LIMIT')
}
