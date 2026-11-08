import { randomUUID } from 'node:crypto'
import type {
  AgentEvent,
  AgentMessage,
  AgentSendRequest,
  AgentSendResult,
} from '@engclaw/ipc-contract'
import type { AgentStore } from '../store/agent'
import type { FetchLike, ProviderConfig } from '../llm/provider'
import { runAgentTurn } from './loop'
import { openAiChatProvider } from './openai'
import { SYSTEM_PROMPT } from './persona'
import type { AgentTool } from './tools'
import { AgentError, type ChatMessage, type ChatProvider } from './types'

const HISTORY_LIMIT = 40

export interface AgentDeps {
  store: AgentStore
  config: () => ProviderConfig | null
  fetchFn: FetchLike
  emit: (e: AgentEvent) => void
  tools?: readonly AgentTool[]
  /** Overrides the network adapter (tests). */
  providerFor?: (cfg: ProviderConfig) => ChatProvider
  now?: () => number
  newId?: () => string
}

/** Runs one streamed reply at a time and keeps the conversation in SQLite. */
export class AgentService {
  private active: { requestId: string; ctrl: AbortController } | null = null
  /** Resolves when the in-flight reply has fully finished (tests await this). */
  idle: Promise<void> = Promise.resolve()

  constructor(private readonly deps: AgentDeps) {}

  send(req: AgentSendRequest): AgentSendResult {
    const { store } = this.deps
    if (this.active) return { ok: false, code: 'BUSY' }
    const cfg = this.deps.config()
    if (!cfg) return { ok: false, code: 'NO_PROVIDER' }
    if (req.conversationId !== undefined && !store.exists(req.conversationId))
      return { ok: false, code: 'NOT_FOUND' }

    const now = this.deps.now ?? Date.now
    const newId = this.deps.newId ?? randomUUID
    const conversationId = req.conversationId ?? newId()
    if (req.conversationId === undefined) store.create(conversationId, now())
    store.append(conversationId, 'user', req.text, now())

    const requestId = newId()
    const ctrl = new AbortController()
    this.active = { requestId, ctrl }
    this.idle = this.run(cfg, conversationId, requestId, ctrl)
    return { ok: true, conversationId, requestId }
  }

  cancel(requestId: string): void {
    if (this.active?.requestId === requestId) this.active.ctrl.abort()
  }

  messages(conversationId: string): AgentMessage[] {
    return this.deps.store.messages(conversationId)
  }

  private async run(
    cfg: ProviderConfig,
    conversationId: string,
    requestId: string,
    ctrl: AbortController,
  ): Promise<void> {
    const { store, emit } = this.deps
    const history: ChatMessage[] = store
      .messages(conversationId)
      .slice(-HISTORY_LIMIT)
      .map((m) => ({ role: m.role, content: m.text }))
    const provider = this.deps.providerFor?.(cfg) ?? openAiChatProvider(cfg, this.deps.fetchFn)
    try {
      const text = await runAgentTurn({
        provider,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...history],
        tools: this.deps.tools ?? [],
        signal: ctrl.signal,
        onDelta: (t) => emit({ type: 'delta', requestId, text: t }),
        onTool: (name, ok) => emit({ type: 'tool', requestId, name, ok }),
      })
      if (text.trim() === '') throw new AgentError('BAD_RESPONSE')
      store.append(conversationId, 'assistant', text, (this.deps.now ?? Date.now)())
      emit({ type: 'done', requestId, conversationId, text })
    } catch (e) {
      if (ctrl.signal.aborted) emit({ type: 'cancelled', requestId })
      else emit({ type: 'error', requestId, code: e instanceof AgentError ? e.code : 'NETWORK' })
    } finally {
      this.active = null
    }
  }
}
