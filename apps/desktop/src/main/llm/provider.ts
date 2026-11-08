import type { LlmErrorCode, LlmHeader, LlmTestResult } from '@engclaw/ipc-contract'

export interface ProviderConfig {
  baseUrl: string
  model: string
  apiKey: string
  headers: LlmHeader[]
}

const MAX_MODELS = 200
const TIMEOUT_MS = 10_000

const isLoopbackHost = (host: string): boolean =>
  host === 'localhost' || host === '[::1]' || /^127(\.\d{1,3}){3}$/.test(host)

/**
 * Providers must be reached over HTTPS; plain HTTP is only for a server on this machine
 * (Ollama, LM Studio). Credentials in the URL are refused so they cannot leak into logs.
 */
export function parseBaseUrl(
  raw: string,
): { ok: true; url: URL } | { ok: false; code: LlmErrorCode } {
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return { ok: false, code: 'INVALID_URL' }
  }
  if (u.username !== '' || u.password !== '' || u.search !== '' || u.hash !== '')
    return { ok: false, code: 'INVALID_URL' }
  if (u.protocol === 'https:') return { ok: true, url: u }
  if (u.protocol === 'http:') {
    return isLoopbackHost(u.hostname) ? { ok: true, url: u } : { ok: false, code: 'INSECURE_URL' }
  }
  return { ok: false, code: 'INVALID_URL' }
}

/** `https://api.openai.com/v1/` → `https://api.openai.com/v1` + path. */
export function endpoint(base: URL, path: string): string {
  return `${base.origin}${base.pathname.replace(/\/+$/, '')}${path}`
}

export function requestHeaders(
  cfg: Pick<ProviderConfig, 'apiKey' | 'headers'>,
): Record<string, string> {
  const out: Record<string, string> = { Accept: 'application/json' }
  for (const { name, value } of cfg.headers) out[name] = value
  if (cfg.apiKey !== '') out['Authorization'] = `Bearer ${cfg.apiKey}`
  return out
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

/** Parses an OpenAI-style `{ data: [{ id }] }` list; tolerates servers that return extra fields. */
function modelIds(body: unknown): string[] | null {
  if (typeof body !== 'object' || body === null) return null
  const data = (body as { data?: unknown }).data
  if (!Array.isArray(data)) return null
  const ids = data.flatMap((m: unknown) =>
    typeof m === 'object' && m !== null && typeof (m as { id?: unknown }).id === 'string'
      ? [(m as { id: string }).id]
      : [],
  )
  return [...new Set(ids)].sort().slice(0, MAX_MODELS)
}

/**
 * Calls `GET {base}/models`. Redirects are refused so the key is never forwarded to another host,
 * and only a status/error code is returned: server bodies can echo credentials.
 */
export async function testConnection(
  cfg: Omit<ProviderConfig, 'model'> & { model?: string },
  fetchFn: FetchLike,
): Promise<LlmTestResult> {
  const parsed = parseBaseUrl(cfg.baseUrl)
  if (!parsed.ok) return { ok: false, code: parsed.code }
  let res: Response
  try {
    res = await fetchFn(endpoint(parsed.url, '/models'), {
      method: 'GET',
      headers: requestHeaders(cfg),
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
    return { ok: false, code: timedOut ? 'TIMEOUT' : 'NETWORK' }
  }
  if (res.status === 401 || res.status === 403)
    return { ok: false, code: 'UNAUTHORIZED', status: res.status }
  if (res.status === 404 || res.status === 405)
    return { ok: false, code: 'NOT_FOUND', status: res.status }
  if (!res.ok) return { ok: false, code: 'SERVER', status: res.status }
  let body: unknown
  try {
    body = await res.json()
  } catch {
    return { ok: false, code: 'BAD_RESPONSE' }
  }
  const models = modelIds(body)
  if (models === null) return { ok: false, code: 'BAD_RESPONSE' }
  const wanted = cfg.model?.trim()
  return {
    ok: true,
    models,
    modelFound: wanted && models.length > 0 ? models.includes(wanted) : null,
  }
}
