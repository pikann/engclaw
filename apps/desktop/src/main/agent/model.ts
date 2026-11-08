import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { APICallError, type LanguageModel } from 'ai'
import { parseBaseUrl, requestHeaders, type FetchLike, type ProviderConfig } from '../llm/provider'
import { AgentError } from './types'

/** Time to first response headers; reasoning models can think for a long while before streaming. */
const CONNECT_TIMEOUT_MS = 120_000

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

/** Maps an SDK failure onto an `AgentError`; the provider's own message is kept as detail. */
export function toAgentError(e: unknown, timedOut: boolean): AgentError {
  if (e instanceof AgentError) return e
  if (APICallError.isInstance(e)) {
    if (e.statusCode !== undefined)
      return statusError(e.statusCode, providerMessage(e.responseBody ?? '') ?? undefined)
    return new AgentError(timedOut ? 'TIMEOUT' : 'NETWORK')
  }
  if (e instanceof Error && /JSON|parse|invalid/i.test(`${e.name} ${e.message}`))
    return new AgentError('BAD_RESPONSE')
  return new AgentError(timedOut ? 'TIMEOUT' : 'NETWORK')
}

/**
 * Chat Completions (OpenAI and compatible servers, Gemini's compatibility endpoint) via the Vercel AI SDK.
 * `timedOut()` reports whether the connect timeout fired, so a failure can be mapped to TIMEOUT.
 */
export function createModel(
  cfg: ProviderConfig,
  fetchFn: FetchLike,
): { model: LanguageModel; timedOut: () => boolean } {
  const parsed = parseBaseUrl(cfg.baseUrl)
  if (!parsed.ok) throw new AgentError('NO_PROVIDER')

  let timedOut = false
  const guardedFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const connect = new AbortController()
    const timer = setTimeout(() => {
      timedOut = true
      connect.abort()
    }, CONNECT_TIMEOUT_MS)
    try {
      return await fetchFn(String(input), {
        ...init,
        redirect: 'error',
        signal: init?.signal ? AbortSignal.any([init.signal, connect.signal]) : connect.signal,
      })
    } finally {
      clearTimeout(timer)
    }
  }

  const provider = createOpenAICompatible({
    name: 'engclaw',
    baseURL: parsed.url.href.replace(/\/+$/, ''),
    headers: requestHeaders(cfg),
    fetch: guardedFetch as typeof fetch,
  })
  return { model: provider.chatModel(cfg.model), timedOut: () => timedOut }
}
