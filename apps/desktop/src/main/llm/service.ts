import type {
  LlmProviderSaveRequest,
  LlmProviderStatus,
  LlmProviderTestRequest,
  LlmSaveResult,
  LlmTestResult,
} from '@engclaw/ipc-contract'
import type { LlmConfigStore } from './config-store'
import { parseBaseUrl, testConnection, type FetchLike, type ProviderConfig } from './provider'

/**
 * Secrets stay in here. A stored key or header is only reused when the draft points at the same
 * origin, so a request that merely edits the URL cannot send the key to another host.
 */
export class LlmService {
  constructor(
    private readonly store: LlmConfigStore,
    private readonly fetchFn: FetchLike,
  ) {}

  status(): LlmProviderStatus {
    return this.store.status()
  }

  private resolve(draft: LlmProviderTestRequest): Omit<ProviderConfig, 'model'> {
    const stored = this.store.load()
    const next = parseBaseUrl(draft.baseUrl)
    const sameHost =
      stored !== null &&
      next.ok &&
      (() => {
        const prev = parseBaseUrl(stored.baseUrl)
        return prev.ok && prev.url.origin === next.url.origin
      })()
    return {
      baseUrl: draft.baseUrl,
      apiKey: draft.apiKey ?? (sameHost ? stored.apiKey : ''),
      headers: draft.headers ?? (sameHost ? stored.headers : []),
    }
  }

  test(draft: LlmProviderTestRequest): Promise<LlmTestResult> {
    return testConnection({ ...this.resolve(draft), model: draft.model }, this.fetchFn)
  }

  save(draft: LlmProviderSaveRequest): LlmSaveResult {
    const parsed = parseBaseUrl(draft.baseUrl)
    if (!parsed.ok) return { ok: false, code: parsed.code }
    const cfg = this.resolve(draft)
    const hasSecret = cfg.apiKey !== '' || cfg.headers.length > 0
    if (hasSecret && !this.store.secureStorage)
      return { ok: false, code: 'SECURE_STORAGE_UNAVAILABLE' }
    this.store.save({ ...cfg, baseUrl: parsed.url.href.replace(/\/+$/, ''), model: draft.model })
    return { ok: true, status: this.store.status() }
  }

  remove(): LlmProviderStatus {
    this.store.clear()
    return this.store.status()
  }
}
