import type { AgentErrorCode } from '@engclaw/ipc-contract'

export interface ToolCall {
  id: string
  name: string
  /** Raw JSON text exactly as the model produced it; validated before use. */
  arguments: string
}

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string }

export interface ToolSpec {
  name: string
  description: string
  /** JSON Schema for the arguments object. */
  parameters: Record<string, unknown>
}

export type StreamChunk = { type: 'text'; text: string } | { type: 'toolCalls'; calls: ToolCall[] }

export interface ChatRequest {
  messages: ChatMessage[]
  tools: ToolSpec[]
  signal: AbortSignal
}

/** One model round: yields text deltas, then at most one `toolCalls` chunk when the model wants tools. */
export interface ChatProvider {
  stream(req: ChatRequest): AsyncIterable<StreamChunk>
}

export class AgentError extends Error {
  constructor(readonly code: AgentErrorCode) {
    super(code)
  }
}
