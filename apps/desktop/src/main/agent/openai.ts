import {
  endpoint,
  parseBaseUrl,
  requestHeaders,
  type FetchLike,
  type ProviderConfig,
} from '../llm/provider'
import {
  AgentError,
  type ChatMessage,
  type ChatProvider,
  type ChatRequest,
  type StreamChunk,
  type ToolCall,
} from './types'

/** Time to first response headers; reasoning models can think for a long while before streaming. */
const CONNECT_TIMEOUT_MS = 120_000

const wireMessage = (m: ChatMessage): Record<string, unknown> => {
  if (m.role === 'tool') return { role: 'tool', tool_call_id: m.toolCallId, content: m.content }
  if (m.role === 'assistant' && m.toolCalls?.length)
    return {
      role: 'assistant',
      content: m.content === '' ? null : m.content,
      tool_calls: m.toolCalls.map((c) => ({
        id: c.id,
        type: 'function',
        function: { name: c.name, arguments: c.arguments },
        ...(c.extraContent !== undefined && { extra_content: c.extraContent }),
      })),
    }
  return { role: m.role, content: m.content }
}

/** Pulls `error.message` out of an OpenAI- or Gemini-style error body (Gemini wraps it in an array). */
export function providerMessage(body: string): string | undefined {
  let text = body.trim()
  try {
    const json = JSON.parse(body) as unknown
    const first = Array.isArray(json) ? json[0] : json
    const msg = (first as { error?: { message?: unknown } } | null)?.error?.message
    if (typeof msg === 'string') text = msg
  } catch {
    // not JSON: fall back to the raw text
  }
  return text === '' ? undefined : text.slice(0, 300)
}

function statusError(status: number, detail?: string): AgentError {
  if (status === 401 || status === 403) return new AgentError('AUTH_EXPIRED', detail)
  if (status === 429) return new AgentError('RATE_LIMIT', detail)
  if (status >= 500) return new AgentError('SERVER', detail)
  return new AgentError('BAD_RESPONSE', detail)
}

interface Delta {
  content?: string | null
  tool_calls?: {
    index?: number
    id?: string
    extra_content?: unknown
    function?: { name?: string; arguments?: string }
  }[]
}

/** Yields the `data:` payloads of a server-sent-event stream. */
async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
      let sep: number
      while ((sep = buf.indexOf('\n\n')) >= 0) {
        const event = buf.slice(0, sep)
        buf = buf.slice(sep + 2)
        const data = event
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trimStart())
          .join('\n')
        if (data !== '') yield data
      }
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
}

/** OpenAI Chat Completions (and compatible servers) with `stream: true`. */
export function openAiChatProvider(cfg: ProviderConfig, fetchFn: FetchLike): ChatProvider {
  return {
    async *stream(req: ChatRequest): AsyncGenerator<StreamChunk> {
      const parsed = parseBaseUrl(cfg.baseUrl)
      if (!parsed.ok) throw new AgentError('NO_PROVIDER')
      const url = endpoint(parsed.url, '/chat/completions')
      const connect = new AbortController()
      const timer = setTimeout(() => connect.abort(), CONNECT_TIMEOUT_MS)
      let res: Response
      try {
        res = await fetchFn(url, {
          method: 'POST',
          headers: {
            ...requestHeaders(cfg),
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({
            model: cfg.model,
            stream: true,
            messages: req.messages.map(wireMessage),
            ...(req.tools.length > 0 && {
              tools: req.tools.map((t) => ({
                type: 'function',
                function: { name: t.name, description: t.description, parameters: t.parameters },
              })),
            }),
          }),
          redirect: 'error',
          signal: AbortSignal.any([req.signal, connect.signal]),
        })
      } catch (e) {
        if (req.signal.aborted) throw e
        throw new AgentError(connect.signal.aborted ? 'TIMEOUT' : 'NETWORK')
      } finally {
        clearTimeout(timer)
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw statusError(res.status, providerMessage(detail))
      }
      if (!res.body) throw new AgentError('BAD_RESPONSE')

      const pending = new Map<number, ToolCall>()
      try {
        for await (const data of sseData(res.body)) {
          if (data === '[DONE]') break
          let json: { choices?: { delta?: Delta }[] }
          try {
            json = JSON.parse(data) as typeof json
          } catch {
            throw new AgentError('BAD_RESPONSE')
          }
          const delta = json.choices?.[0]?.delta
          if (!delta) continue
          if (delta.content) yield { type: 'text', text: delta.content }
          for (const tc of delta.tool_calls ?? []) {
            // Gemini omits `index`: a fresh id starts a new call, otherwise continue the last one.
            const i = tc.index ?? (tc.id || pending.size === 0 ? pending.size : pending.size - 1)
            const cur = pending.get(i) ?? { id: '', name: '', arguments: '' }
            if (tc.id) cur.id = tc.id
            if (tc.extra_content !== undefined) cur.extraContent = tc.extra_content
            if (tc.function?.name) cur.name += tc.function.name
            if (tc.function?.arguments) cur.arguments += tc.function.arguments
            pending.set(i, cur)
          }
        }
      } catch (e) {
        if (e instanceof AgentError || req.signal.aborted) throw e
        throw new AgentError('NETWORK')
      }
      if (pending.size > 0) {
        const calls = [...pending.entries()]
          .sort(([a], [b]) => a - b)
          .map(([i, c]) => ({ ...c, id: c.id || `call_${i}` }))
        yield { type: 'toolCalls', calls }
      }
    },
  }
}
