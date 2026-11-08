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

const CONNECT_TIMEOUT_MS = 20_000

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
      })),
    }
  return { role: m.role, content: m.content }
}

function statusError(status: number): AgentError {
  if (status === 401 || status === 403) return new AgentError('AUTH_EXPIRED')
  if (status === 429) return new AgentError('RATE_LIMIT')
  if (status >= 500) return new AgentError('SERVER')
  return new AgentError('BAD_RESPONSE')
}

interface Delta {
  content?: string | null
  tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[]
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
      const connect = new AbortController()
      const timer = setTimeout(() => connect.abort(), CONNECT_TIMEOUT_MS)
      let res: Response
      try {
        res = await fetchFn(endpoint(parsed.url, '/chat/completions'), {
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
      if (!res.ok) throw statusError(res.status)
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
            const i = tc.index ?? 0
            const cur = pending.get(i) ?? { id: '', name: '', arguments: '' }
            if (tc.id) cur.id = tc.id
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
