import { randomUUID } from 'node:crypto'
import type {
  AgentCard,
  AgentConversation,
  AgentEvent,
  AgentMessage,
  AgentSendRequest,
  AgentSendResult,
} from '@engclaw/ipc-contract'
import type { AgentStore } from '../store/agent'
import type { FetchLike, ProviderConfig } from '../llm/provider'
import type { LanguageModel, ModelMessage, ToolSet } from 'ai'
import { createModel } from './model'
import { runAgentTurn } from './turn'
import { SYSTEM_PROMPT } from './persona'
import { formatSpeechContext } from './speech-context'
import { showCardTool } from './show-card'
import { AgentError } from './types'

const HISTORY_LIMIT = 40

export interface AgentDeps {
  store: AgentStore
  config: () => ProviderConfig | null
  fetchFn: FetchLike
  emit: (e: AgentEvent) => void
  systemPrompt?: () => string
  tools?: ToolSet
  /** Overrides the network model (tests). */
  modelFor?: (cfg: ProviderConfig) => LanguageModel
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
    this.idle = this.run(
      cfg,
      conversationId,
      requestId,
      ctrl,
      req.speech ? formatSpeechContext(req.speech) : undefined,
    )
    return { ok: true, conversationId, requestId }
  }

  cancel(requestId: string): void {
    if (this.active?.requestId === requestId) this.active.ctrl.abort()
  }

  messages(conversationId: string): AgentMessage[] {
    return this.deps.store.messages(conversationId)
  }

  conversations(): AgentConversation[] {
    return this.deps.store.list()
  }

  private async run(
    cfg: ProviderConfig,
    conversationId: string,
    requestId: string,
    ctrl: AbortController,
    speechContext?: string,
  ): Promise<void> {
    const { store, emit } = this.deps
    const history: ModelMessage[] = store
      .messages(conversationId)
      .slice(-HISTORY_LIMIT)
      .map((m) => ({ role: m.role, content: m.text }))
    // Only the latest turn carries its analysis; it is not stored, so older turns stay plain text.
    const last = history.at(-1)
    if (speechContext && last?.role === 'user') last.content += `\n\n${speechContext}`
    const cards: AgentCard[] = []
    try {
      const { model, timedOut } = this.deps.modelFor
        ? { model: this.deps.modelFor(cfg), timedOut: () => false }
        : createModel(cfg, this.deps.fetchFn)
      const text = await runAgentTurn({
        model,
        timedOut,
        system: this.deps.systemPrompt?.() ?? SYSTEM_PROMPT,
        messages: history,
        tools: { ...this.deps.tools, show_card: showCardTool(cards) },
        signal: ctrl.signal,
        onDelta: (t) => emit({ type: 'delta', requestId, text: t }),
        onTool: (name, ok) => emit({ type: 'tool', requestId, name, ok }),
      })
      if (text.trim() === '') throw new AgentError('BAD_RESPONSE')
      store.append(conversationId, 'assistant', text, (this.deps.now ?? Date.now)(), cards)
      emit({ type: 'done', requestId, conversationId, text, cards })
    } catch (e) {
      if (ctrl.signal.aborted) emit({ type: 'cancelled', requestId })
      else
        emit({
          type: 'error',
          requestId,
          code: e instanceof AgentError ? e.code : 'NETWORK',
          detail: e instanceof AgentError ? e.detail : undefined,
        })
    } finally {
      this.active = null
    }
  }
}
