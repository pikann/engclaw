import { visibleUserText } from './ask-agent'
import type { AgentCard, AgentErrorCode, AgentMessage } from '@engclaw/ipc-contract'

export type ConverseError = AgentErrorCode | 'FAILED'

export type ConverseTurn = 'idle' | 'listening' | 'thinking' | 'speaking'

export interface ConverseMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  cards?: AgentCard[]
  streaming?: boolean
  interrupted?: boolean
}

export interface ConverseState {
  turn: ConverseTurn
  conversationId: string | null
  requestId: string | null
  messages: ConverseMessage[]
  error: ConverseError | null
  errorDetail: string | null
}

export const initialConverse: ConverseState = {
  turn: 'idle',
  conversationId: null,
  requestId: null,
  messages: [],
  error: null,
  errorDetail: null,
}

export type ConverseEvent =
  | { type: 'listen' }
  | { type: 'stop-listening' }
  | { type: 'transcribing' }
  | { type: 'heard'; text: string }
  | { type: 'sent'; conversationId: string; requestId: string }
  | { type: 'delta'; requestId: string; text: string }
  | {
      type: 'done'
      requestId: string
      conversationId: string
      text: string
      cards: AgentCard[]
    }
  | { type: 'cancelled'; requestId: string }
  | { type: 'error'; requestId: string; code: AgentErrorCode; detail?: string }
  | { type: 'send-failed'; code: ConverseError }
  | { type: 'spoken' }
  | { type: 'interrupt' }
  | { type: 'load'; conversationId: string; messages: AgentMessage[] }
  | { type: 'reset' }

let seq = 0
const localId = (): string => `l${++seq}`

/** The server keeps no partial reply, so a streaming one that ends without `done` is dropped. */
const dropStreamingReply = (messages: ConverseMessage[]): ConverseMessage[] =>
  messages.at(-1)?.streaming ? messages.slice(0, -1) : messages

export function converseReducer(s: ConverseState, e: ConverseEvent): ConverseState {
  switch (e.type) {
    case 'listen':
      return { ...s, turn: 'listening', error: null, errorDetail: null }
    case 'stop-listening':
      // Also ends the transcribing phase (turn 'thinking' before a request exists): an empty
      // transcript or a cancel there would otherwise leave the screen stuck on "thinking".
      return s.turn === 'listening' || (s.turn === 'thinking' && s.requestId === null)
        ? { ...s, turn: 'idle' }
        : s
    case 'transcribing':
      return { ...s, turn: 'thinking', error: null, errorDetail: null }
    case 'heard':
      return {
        ...s,
        turn: 'thinking',
        error: null,
        errorDetail: null,
        messages: [...s.messages, { id: localId(), role: 'user', text: visibleUserText(e.text) }],
      }
    case 'sent':
      return {
        ...s,
        conversationId: e.conversationId,
        requestId: e.requestId,
        messages: [...s.messages, { id: localId(), role: 'assistant', text: '', streaming: true }],
      }
    case 'delta': {
      if (e.requestId !== s.requestId) return s
      const last = s.messages.at(-1)
      if (!last?.streaming) return s
      return {
        ...s,
        messages: [...s.messages.slice(0, -1), { ...last, text: last.text + e.text }],
      }
    }
    case 'done': {
      if (e.requestId !== s.requestId) return s
      const draft = s.messages.at(-1)?.streaming ? s.messages.at(-1) : undefined
      const rest = draft ? s.messages.slice(0, -1) : s.messages
      return {
        ...s,
        turn: 'speaking',
        requestId: null,
        conversationId: e.conversationId,
        messages: [
          ...rest,
          { id: draft?.id ?? localId(), role: 'assistant', text: e.text, cards: e.cards },
        ],
      }
    }
    case 'cancelled':
      if (e.requestId !== s.requestId) return s
      return { ...s, turn: 'idle', requestId: null, messages: dropStreamingReply(s.messages) }
    case 'error':
      if (e.requestId !== s.requestId) return s
      return {
        ...s,
        turn: 'idle',
        requestId: null,
        error: e.code,
        errorDetail: e.detail ?? null,
        messages: dropStreamingReply(s.messages),
      }
    case 'send-failed':
      return { ...s, turn: 'idle', error: e.code, errorDetail: null }
    case 'spoken':
      return s.turn === 'speaking' ? { ...s, turn: 'idle' } : s
    case 'interrupt': {
      if (s.turn !== 'speaking') return s
      const last = s.messages.at(-1)
      return {
        ...s,
        turn: 'idle',
        messages:
          last?.role === 'assistant'
            ? [...s.messages.slice(0, -1), { ...last, interrupted: true }]
            : s.messages,
      }
    }
    case 'load':
      return {
        ...initialConverse,
        conversationId: e.conversationId,
        messages: e.messages.map((m) => ({
          id: `m${m.id}`,
          role: m.role,
          text: m.role === 'user' ? visibleUserText(m.text) : m.text,
          cards: m.cards,
        })),
      }
    case 'reset':
      return initialConverse
  }
}

export type CaptionsAnnouncement = 'shown' | 'hidden'

/** What a screen reader hears when captions flip; never the transcript itself. */
export const captionsAnnouncement = (visible: boolean): CaptionsAnnouncement =>
  visible ? 'shown' : 'hidden'

/** Alt+C toggles captions anywhere on the Converse screen. */
export const isCaptionsShortcut = (e: KeyboardEvent): boolean =>
  e.code === 'KeyC' && e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey
